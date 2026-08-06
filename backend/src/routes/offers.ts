import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { candidateStageEvents, candidates, jobs, offers } from '../db/schema.js';
import { offerActionSchema, upsertOfferSchema } from '../lib/validation.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { idParams, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.js';
import { logger } from '../lib/logger.js';
import { sendStatusUpdate } from '../services/email.js';

export const offersRouter = Router();

offersRouter.use(requireAuth);

/**
 * Which lifecycle moves are legal. Validated here rather than trusted from the client,
 * because the candidate's pipeline stage is derived from the offer status — an unchecked
 * transition would desync the two.
 */
const ALLOWED: Record<string, string[]> = {
  draft: ['extend', 'withdraw'],
  extended: ['accept', 'decline', 'withdraw'],
  accepted: [],
  declined: [],
  expired: ['extend'],
  withdrawn: ['extend'],
};

/** The pipeline stage each offer status implies. null = leave the stage alone. */
const STAGE_FOR: Record<string, 'offer' | 'hired' | 'rejected' | null> = {
  extend: 'offer',
  accept: 'hired',
  decline: 'rejected',
  withdraw: null,
};

async function latestOffer(candidateId: string) {
  const [row] = await db
    .select()
    .from(offers)
    .where(eq(offers.candidateId, candidateId))
    .orderBy(desc(offers.createdAt))
    .limit(1);
  return row;
}

/** The current offer for a candidate (null when none has been drafted). */
offersRouter.get('/candidates/:id/offer', validate({ params: idParams }), async (req, res) => {
  res.json({ offer: (await latestOffer(req.params.id)) ?? null });
});

/** Create or amend the terms. Stays a draft — the candidate isn't told until it's extended. */
offersRouter.put('/candidates/:id/offer', validate({ params: idParams }), async (req, res) => {
  const input = upsertOfferSchema.parse(req.body);
  const candidateId = req.params.id;

  const [candidate] = await db
    .select({ id: candidates.id, jobId: candidates.jobId, fullName: candidates.fullName })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!candidate) throw notFound('Candidate not found');

  const existing = await latestOffer(candidateId);
  const terms = {
    salaryAmount: input.salaryAmount ?? null,
    salaryCurrency: input.salaryCurrency ?? null,
    startDate: input.startDate ?? null,
    expiresAt: input.expiresAt ?? null,
    notes: input.notes ?? null,
  };

  // An answered offer is a historical record — amending it would rewrite what the candidate
  // was actually told, so a new one is drafted instead.
  const amendable = existing && ['draft', 'extended'].includes(existing.status);

  const [offer] = amendable
    ? await db
        .update(offers)
        .set({ ...terms, updatedAt: new Date() })
        .where(eq(offers.id, existing!.id))
        .returning()
    : await db
        .insert(offers)
        .values({
          candidateId,
          jobId: candidate.jobId,
          createdBy: req.user?.sub ?? null,
          status: 'draft',
          ...terms,
        })
        .returning();

  res.json({ offer });
});

/** Move the offer through its lifecycle, keeping the candidate's stage in step. */
offersRouter.post('/candidates/:id/offer/action', validate({ params: idParams }), async (req, res) => {
  const { action, reason, notifyCandidate } = offerActionSchema.parse(req.body);
  const candidateId = req.params.id;

  const offer = await latestOffer(candidateId);
  if (!offer) throw badRequest('No offer has been drafted for this candidate yet.');

  const allowed = ALLOWED[offer.status] ?? [];
  if (!allowed.includes(action)) {
    throw badRequest(`Cannot ${action} an offer that is ${offer.status}.`);
  }
  if (action === 'decline' && !reason?.trim()) {
    throw badRequest('A reason is required when recording a declined offer.');
  }

  const now = new Date();
  const nextStatus =
    action === 'extend'
      ? 'extended'
      : action === 'accept'
        ? 'accepted'
        : action === 'decline'
          ? 'declined'
          : 'withdrawn';

  const [updated] = await db
    .update(offers)
    .set({
      status: nextStatus,
      declineReason: action === 'decline' ? (reason ?? null) : offer.declineReason,
      extendedAt: action === 'extend' ? now : offer.extendedAt,
      respondedAt: action === 'accept' || action === 'decline' ? now : offer.respondedAt,
      updatedAt: now,
    })
    .where(eq(offers.id, offer.id))
    .returning();

  // Keep the pipeline honest: extending puts them in 'offer', accepting in 'hired', and a
  // decline is a candidate-initiated exit — recorded with its reason so it is not counted
  // as us rejecting them.
  const nextStage = STAGE_FOR[action];
  let email: Awaited<ReturnType<typeof sendStatusUpdate>> | undefined;

  if (nextStage) {
    const [candidate] = await db
      .select({
        stage: candidates.stage,
        fullName: candidates.fullName,
        email: candidates.email,
        trackingToken: candidates.trackingToken,
        jobId: candidates.jobId,
      })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (candidate && candidate.stage !== nextStage) {
      await db
        .update(candidates)
        .set({ stage: nextStage, updatedAt: now })
        .where(eq(candidates.id, candidateId));
      await db.insert(candidateStageEvents).values({
        candidateId,
        fromStage: candidate.stage,
        toStage: nextStage,
        reason: action === 'decline' ? (reason ?? 'Declined our offer') : null,
        changedBy: req.user?.sub ?? null,
      });

      /*
       * Tell the candidate their stage moved.
       *
       * This route changes the stage directly rather than going through PATCH
       * /candidates/:id/stage, so it has to send the notification itself — otherwise
       * extending an offer told the candidate nothing, while the status page they could
       * reach said "Check your email for the details" about an email that was never sent.
       *
       * Awaited rather than fired and forgotten so the caller learns whether it actually
       * left, the same as scheduling an interview does.
       */
      if (notifyCandidate !== false) {
        const [job] = await db
          .select({ title: jobs.title })
          .from(jobs)
          .where(eq(jobs.id, candidate.jobId))
          .limit(1);
        email = await sendStatusUpdate(
          candidateId,
          candidate.email,
          candidate.fullName,
          job?.title ?? 'the role',
          nextStage,
          candidate.trackingToken,
        );
      }
    }

    void recordAudit({
      actorEmail: req.user?.email ?? null,
      action: `offer.${action}`,
      targetType: 'candidate',
      targetId: candidateId,
      detail: `${candidate?.fullName ?? 'Candidate'}: offer ${nextStatus}${reason ? ` (${reason})` : ''}`,
      ip: req.ip ?? null,
    });
  }

  logger.info({ candidateId, action, status: nextStatus, emailed: email?.sent ?? false }, 'offer action');
  res.json({ offer: updated, email });
});

/** Offer pipeline overview — what is out, and what came back. */
offersRouter.get('/offers', async (_req, res) => {
  const rows = await db
    .select({
      id: offers.id,
      candidateId: offers.candidateId,
      candidateName: candidates.fullName,
      jobTitle: jobs.title,
      status: offers.status,
      salaryAmount: offers.salaryAmount,
      salaryCurrency: offers.salaryCurrency,
      startDate: offers.startDate,
      expiresAt: offers.expiresAt,
      declineReason: offers.declineReason,
      extendedAt: offers.extendedAt,
      respondedAt: offers.respondedAt,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .leftJoin(candidates, eq(candidates.id, offers.candidateId))
    .leftJoin(jobs, eq(jobs.id, offers.jobId))
    .orderBy(desc(offers.createdAt))
    .limit(200);
  res.json({ offers: rows });
});
