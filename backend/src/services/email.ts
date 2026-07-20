import nodemailer, { type Transporter } from 'nodemailer';
import { appPublicUrl, emailEnabled, env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { statusFor, type StageKey } from '../lib/applicantStatus.js';
import { db } from '../db/client.js';
import { emailLogs } from '../db/schema.js';

export type EmailType = 'application_received' | 'status_update';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!emailEnabled || !env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export type SendResult = { sent: boolean; skipped?: boolean; error?: string };

async function recordLog(
  candidateId: string,
  type: EmailType,
  to: string,
  subject: string,
  status: 'sent' | 'skipped' | 'failed',
  error?: string,
) {
  try {
    await db.insert(emailLogs).values({ candidateId, type, toEmail: to, subject, status, error: error ?? null });
  } catch (err) {
    logger.error({ err }, '[email] failed to record log');
  }
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  candidateId: string;
  type: EmailType;
}): Promise<SendResult> {
  const { to, subject, html, text, candidateId, type } = opts;
  const tx = getTransporter();

  if (!tx) {
    // Dev-safe: no SMTP configured — log instead of failing.
    logger.info({ to, subject }, '[email] skipped (SMTP not configured)');
    await recordLog(candidateId, type, to, subject, 'skipped', 'SMTP not configured');
    return { sent: false, skipped: true };
  }
  try {
    await tx.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info({ to, subject }, '[email] sent');
    await recordLog(candidateId, type, to, subject, 'sent');
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, '[email] send failed');
    await recordLog(candidateId, type, to, subject, 'failed', error);
    return { sent: false, error };
  }
}

export function trackingUrl(token: string): string {
  return `${appPublicUrl}/status/${token}`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const BRAND = 'ScreenAI';
const ACCENT = '#3366f0';

function layout(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}): string {
  const bar =
    opts.tone === 'positive' ? '#059669' : opts.tone === 'negative' ? '#e11d48' : ACCENT;
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:8px 0 4px;">
           <a href="${opts.ctaUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;">${opts.ctaLabel}</a>
         </td></tr>
         <tr><td style="padding:6px 0;color:#94a3b8;font-size:12px;">Or copy this link: <span style="color:#64748b;">${opts.ctaUrl}</span></td></tr>`
      : '';

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="height:4px;background:${bar};"></td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;height:36px;background:${ACCENT};border-radius:9px;color:#fff;font-weight:700;font-size:14px;text-align:center;vertical-align:middle;">CV</td>
              <td style="padding-left:10px;font-weight:700;color:#0f172a;font-size:16px;">${BRAND} Careers</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:12px 32px 4px;">
          <h1 style="margin:0;color:#0f172a;font-size:20px;">${opts.heading}</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 20px;color:#475569;font-size:14px;line-height:1.6;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="color:#475569;font-size:14px;line-height:1.6;">${opts.bodyHtml}</td></tr>
            ${cta}
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 26px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
          This is an automated message from ${BRAND} Careers. Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function applicationReceivedEmail(name: string, jobTitle: string, token: string) {
  const url = trackingUrl(token);
  const subject = `We received your application for ${jobTitle}`;
  const html = layout({
    heading: 'Application received',
    tone: 'neutral',
    bodyHtml: `Hi ${escapeHtml(name)},<br/><br/>
      Thank you for applying for the <b>${escapeHtml(jobTitle)}</b> position. We've received your
      application and our team is reviewing it. You can track the status of your application at any
      time using the link below.`,
    ctaLabel: 'Track your application',
    ctaUrl: url,
  });
  const text = `Hi ${name},\n\nThank you for applying for the ${jobTitle} position. We've received your application and our team is reviewing it.\n\nTrack your application: ${url}\n\n— ${BRAND} Careers`;
  return { subject, html, text };
}

export function statusUpdateEmail(name: string, jobTitle: string, stage: StageKey, token: string) {
  const url = trackingUrl(token);
  const status = statusFor(stage);
  const subject = `Update on your application for ${jobTitle}`;
  const html = layout({
    heading: `Status: ${status.label}`,
    tone: status.tone,
    bodyHtml: `Hi ${escapeHtml(name)},<br/><br/>
      There's an update on your application for the <b>${escapeHtml(jobTitle)}</b> position.<br/><br/>
      <b>${status.label}.</b> ${escapeHtml(status.message)}`,
    ctaLabel: 'View application status',
    ctaUrl: url,
  });
  const text = `Hi ${name},\n\nUpdate on your application for ${jobTitle}: ${status.label}.\n${status.message}\n\nView status: ${url}\n\n— ${BRAND} Careers`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Public senders (fire-and-forget safe — never throw)
// ---------------------------------------------------------------------------

export async function sendApplicationReceived(
  candidateId: string,
  to: string,
  name: string,
  jobTitle: string,
  token: string,
): Promise<SendResult> {
  return sendEmail({
    to,
    candidateId,
    type: 'application_received',
    ...applicationReceivedEmail(name, jobTitle, token),
  });
}

export async function sendStatusUpdate(
  candidateId: string,
  to: string,
  name: string,
  jobTitle: string,
  stage: StageKey,
  token: string,
): Promise<SendResult> {
  return sendEmail({
    to,
    candidateId,
    type: 'status_update',
    ...statusUpdateEmail(name, jobTitle, stage, token),
  });
}

// ---------------------------------------------------------------------------
// Interview reminder (to the recruiter) — not tied to a candidate email log
// ---------------------------------------------------------------------------

export type InterviewReminderInfo = {
  candidateName: string;
  jobTitle: string | null;
  whenText: string;
  minutes: number;
  mode: string;
  location?: string | null;
};

export function interviewReminderEmail(info: InterviewReminderInfo) {
  const subject = `Reminder: interview with ${info.candidateName} in ${info.minutes} minutes`;
  const details = [
    `<b>Candidate:</b> ${escapeHtml(info.candidateName)}`,
    info.jobTitle ? `<b>Role:</b> ${escapeHtml(info.jobTitle)}` : null,
    `<b>When:</b> ${escapeHtml(info.whenText)}`,
    `<b>Mode:</b> ${escapeHtml(info.mode)}`,
    info.location ? `<b>Where:</b> ${escapeHtml(info.location)}` : null,
  ]
    .filter(Boolean)
    .join('<br/>');
  const html = layout({
    heading: `Interview in ${info.minutes} minutes`,
    tone: 'neutral',
    bodyHtml: `This is a reminder for your upcoming interview.<br/><br/>${details}`,
  });
  const text = `Reminder: interview with ${info.candidateName} in ${info.minutes} minutes.\nRole: ${info.jobTitle ?? '—'}\nWhen: ${info.whenText}\nMode: ${info.mode}${info.location ? `\nWhere: ${info.location}` : ''}`;
  return { subject, html, text };
}

/** Send an interview reminder to a recruiter. Never throws. */
export async function sendInterviewReminder(
  to: string,
  info: InterviewReminderInfo,
): Promise<SendResult> {
  const tx = getTransporter();
  const { subject, html, text } = interviewReminderEmail(info);
  if (!tx) {
    logger.info({ to, subject }, '[email] interview reminder skipped (SMTP not configured)');
    return { sent: false, skipped: true };
  }
  try {
    await tx.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info({ to, subject }, '[email] interview reminder sent');
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, '[email] interview reminder failed');
    return { sent: false, error };
  }
}

// ---------------------------------------------------------------------------
// Recruiter alert — a new candidate has applied
// ---------------------------------------------------------------------------

export type NewApplicationInfo = {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  source: string;
  overallScore: number | null;
  recommendation: string | null;
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  strong_match: 'Strong match',
  possible: 'Possible',
  not_a_fit: 'Not a fit',
};

export function newApplicationAlertEmail(info: NewApplicationInfo) {
  const reviewUrl = `${appPublicUrl}/hr/candidates/${info.candidateId}`;
  const subject = `New applicant: ${info.candidateName} — ${info.jobTitle}`;
  const rows = [
    `<b>Candidate:</b> ${escapeHtml(info.candidateName)}`,
    `<b>Role:</b> ${escapeHtml(info.jobTitle)}`,
    `<b>Source:</b> ${escapeHtml(info.source)}`,
    info.overallScore != null ? `<b>AI score:</b> ${info.overallScore}/100` : null,
    info.recommendation
      ? `<b>AI recommendation:</b> ${escapeHtml(RECOMMENDATION_LABEL[info.recommendation] ?? info.recommendation)}`
      : null,
  ]
    .filter(Boolean)
    .join('<br/>');
  const html = layout({
    heading: 'New application received',
    tone: 'neutral',
    bodyHtml: `A new candidate has applied and been screened by AI.<br/><br/>${rows}`,
    ctaLabel: 'Review candidate',
    ctaUrl: reviewUrl,
  });
  const text = [
    'A new candidate has applied and been screened by AI.',
    '',
    `Candidate: ${info.candidateName}`,
    `Role: ${info.jobTitle}`,
    `Source: ${info.source}`,
    info.overallScore != null ? `AI score: ${info.overallScore}/100` : '',
    info.recommendation ? `AI recommendation: ${RECOMMENDATION_LABEL[info.recommendation] ?? info.recommendation}` : '',
    '',
    `Review: ${reviewUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, html, text };
}

/** Notify a recruiter that a new candidate has applied. Never throws. */
export async function sendNewApplicationAlert(
  to: string,
  info: NewApplicationInfo,
): Promise<SendResult> {
  const tx = getTransporter();
  const { subject, html, text } = newApplicationAlertEmail(info);
  if (!tx) {
    logger.info({ to, subject }, '[email] new-application alert skipped (SMTP not configured)');
    return { sent: false, skipped: true };
  }
  try {
    await tx.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info({ to, subject }, '[email] new-application alert sent');
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, '[email] new-application alert failed');
    return { sent: false, error };
  }
}

// ---------------------------------------------------------------------------
// Candidate interview invitation / update / cancellation (with .ics attachment)
// ---------------------------------------------------------------------------

export type CandidateInterviewKind = 'invite' | 'updated' | 'canceled';

export type CandidateInterviewInfo = {
  interviewId: string;
  candidateName: string;
  jobTitle: string | null;
  start: Date;
  durationMinutes: number;
  mode: string; // video | onsite | phone
  location?: string | null;
  sequence?: number; // bump on updates so calendars replace the event
};

const MODE_LABEL: Record<string, string> = {
  video: 'Video call',
  onsite: 'On-site',
  phone: 'Phone call',
};

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

function formatWhenLong(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Build a minimal RFC-5545 calendar event so candidates can add it in one click. */
function buildInterviewIcs(info: CandidateInterviewInfo, canceled: boolean): string {
  const end = new Date(info.start.getTime() + info.durationMinutes * 60000);
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const summary = `Interview${info.jobTitle ? ` — ${info.jobTitle}` : ''}`;
  const description = [
    `Interview for ${info.jobTitle ?? 'the role'}.`,
    `Format: ${MODE_LABEL[info.mode] ?? info.mode}.`,
    info.location ? `Details: ${info.location}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Linkage ScreenAI//Interview//EN',
    `METHOD:${canceled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:interview-${info.interviewId}@linkage-screenai`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(info.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    info.location ? `LOCATION:${esc(info.location)}` : '',
    `STATUS:${canceled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${info.sequence ?? 0}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function candidateInterviewEmail(kind: CandidateInterviewKind, info: CandidateInterviewInfo) {
  const when = formatWhenLong(info.start);
  const modeLabel = MODE_LABEL[info.mode] ?? info.mode;
  const role = info.jobTitle ?? 'the role';
  const linkIsUrl = info.location ? isUrl(info.location) : false;

  const heading =
    kind === 'invite'
      ? `You're invited to interview for ${escapeHtml(role)}`
      : kind === 'updated'
        ? 'Your interview has been rescheduled'
        : 'Your interview has been canceled';
  const subject =
    kind === 'invite'
      ? `Interview invitation — ${role}`
      : kind === 'updated'
        ? `Updated interview details — ${role}`
        : `Interview canceled — ${role}`;
  const tone = kind === 'canceled' ? 'negative' : 'positive';

  if (kind === 'canceled') {
    const html = layout({
      heading,
      tone,
      bodyHtml: `Hi ${escapeHtml(info.candidateName)},<br/><br/>
        Your interview for the <b>${escapeHtml(role)}</b> position, previously scheduled for
        <b>${escapeHtml(when)}</b>, has been canceled. We'll be in touch about next steps.`,
    });
    const text = `Hi ${info.candidateName},\n\nYour interview for ${role} (previously ${when}) has been canceled. We'll be in touch about next steps.\n\n— ${BRAND} Careers`;
    return { subject, html, text };
  }

  const detailRows = [
    `<b>Role:</b> ${escapeHtml(role)}`,
    `<b>When:</b> ${escapeHtml(when)}`,
    `<b>Duration:</b> ${info.durationMinutes} minutes`,
    `<b>Format:</b> ${escapeHtml(modeLabel)}`,
    info.location && !linkIsUrl ? `<b>Where:</b> ${escapeHtml(info.location)}` : '',
  ]
    .filter(Boolean)
    .join('<br/>');

  const intro =
    kind === 'invite'
      ? `Hi ${escapeHtml(info.candidateName)},<br/><br/>
         We'd like to invite you to an interview for the <b>${escapeHtml(role)}</b> position. Here are the details:`
      : `Hi ${escapeHtml(info.candidateName)},<br/><br/>
         Your interview for the <b>${escapeHtml(role)}</b> position has been updated. Here are the new details:`;

  const html = layout({
    heading,
    tone,
    bodyHtml: `${intro}<br/><br/>${detailRows}<br/><br/>
      A calendar invitation is attached — open it to add this to your calendar.`,
    ctaLabel: linkIsUrl ? 'Join the meeting' : undefined,
    ctaUrl: linkIsUrl ? info.location! : undefined,
  });
  const text = [
    `Hi ${info.candidateName},`,
    '',
    kind === 'invite'
      ? `We'd like to invite you to an interview for ${role}.`
      : `Your interview for ${role} has been updated.`,
    '',
    `Role: ${role}`,
    `When: ${when}`,
    `Duration: ${info.durationMinutes} minutes`,
    `Format: ${modeLabel}`,
    info.location ? `${linkIsUrl ? 'Join link' : 'Where'}: ${info.location}` : '',
    '',
    'A calendar invitation is attached.',
    `— ${BRAND} Careers`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

/** Render the candidate interview email + .ics without sending (for preview/testing). */
export function renderCandidateInterviewEmail(
  kind: CandidateInterviewKind,
  info: CandidateInterviewInfo,
) {
  return { ...candidateInterviewEmail(kind, info), ics: buildInterviewIcs(info, kind === 'canceled') };
}

/**
 * Email a candidate about an interview (invitation, reschedule, or cancellation),
 * including a calendar (.ics) attachment. Never throws.
 */
export async function sendCandidateInterviewEmail(
  to: string,
  kind: CandidateInterviewKind,
  info: CandidateInterviewInfo,
): Promise<SendResult> {
  const tx = getTransporter();
  const { subject, html, text } = candidateInterviewEmail(kind, info);
  if (!tx) {
    logger.info({ to, subject }, `[email] interview ${kind} skipped (SMTP not configured)`);
    return { sent: false, skipped: true };
  }
  try {
    const ics = buildInterviewIcs(info, kind === 'canceled');
    await tx.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
      attachments: [
        {
          filename: 'interview.ics',
          content: ics,
          contentType: `text/calendar; method=${kind === 'canceled' ? 'CANCEL' : 'REQUEST'}`,
        },
      ],
    });
    logger.info({ to, subject }, `[email] interview ${kind} sent`);
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, `[email] interview ${kind} failed`);
    return { sent: false, error };
  }
}