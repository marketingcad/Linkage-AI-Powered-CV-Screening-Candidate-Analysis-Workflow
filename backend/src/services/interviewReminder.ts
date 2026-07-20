import { and, eq, gt, sql } from 'drizzle-orm';
import { candidates, hrUsers, interviews, jobs } from '../db/schema.js';
import { db } from '../db/client.js';
import { sendInterviewReminder } from './email.js';
import { logger } from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60 * 1000; // every minute

function formatWhen(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Find scheduled interviews whose reminder is now due (reminder lead time reached,
 * interview not yet started) and email the recruiter once, marking reminderSent.
 * Returns how many reminders were sent/attempted.
 */
export async function sweepInterviewReminders(): Promise<number> {
  const now = new Date();

  // Due when: now >= scheduledAt - reminderMinutes  AND  scheduledAt is still in the future.
  const rows = await db
    .select({
      id: interviews.id,
      scheduledAt: interviews.scheduledAt,
      reminderMinutes: interviews.reminderMinutes,
      mode: interviews.mode,
      location: interviews.location,
      candidateName: candidates.fullName,
      jobTitle: jobs.title,
      recruiterEmail: hrUsers.email,
    })
    .from(interviews)
    .leftJoin(candidates, eq(candidates.id, interviews.candidateId))
    .leftJoin(jobs, eq(jobs.id, interviews.jobId))
    .leftJoin(hrUsers, eq(hrUsers.id, interviews.createdBy))
    .where(
      and(
        eq(interviews.status, 'scheduled'),
        eq(interviews.reminderSent, false),
        gt(interviews.scheduledAt, now),
        // Reminder lead time reached: scheduledAt - reminderMinutes <= now
        sql`${interviews.scheduledAt} - make_interval(mins => ${interviews.reminderMinutes}) <= ${now}`,
      ),
    );

  let sent = 0;
  for (const r of rows) {
    // Mark first to avoid duplicate sends if a send is slow / the sweep overlaps.
    await db.update(interviews).set({ reminderSent: true }).where(eq(interviews.id, r.id));
    if (r.recruiterEmail) {
      const minutes = Math.max(1, Math.round((r.scheduledAt.getTime() - now.getTime()) / 60000));
      await sendInterviewReminder(r.recruiterEmail, {
        candidateName: r.candidateName ?? 'Candidate',
        jobTitle: r.jobTitle ?? null,
        whenText: formatWhen(r.scheduledAt),
        minutes,
        mode: r.mode,
        location: r.location,
      });
      sent += 1;
    }
  }
  return sent;
}

/** Start the periodic interview-reminder sweep. */
export function startInterviewReminderSweeper(): void {
  const run = () =>
    sweepInterviewReminders()
      .then((n) => {
        if (n > 0) logger.info({ sent: n }, 'interview reminders sent');
      })
      .catch((err) => logger.error({ err }, 'interview reminder sweep failed'));

  run();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  timer.unref?.();
  logger.info('interview reminder sweeper enabled');
}
