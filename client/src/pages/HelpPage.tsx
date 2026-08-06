import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  LuArchive,
  LuBriefcase,
  LuCalendarClock,
  LuCircleHelp,
  LuGauge,
  LuHandshake,
  LuLayoutDashboard,
  LuMail,
  LuMessageSquareQuote,
  LuShieldCheck,
  LuUserCog,
  LuUsers,
  LuVideo,
} from 'react-icons/lu';
import { Card, STAGE_ICONS } from '../components/ui';
import { DEFAULT_SCORING_WEIGHTS } from '../api/types';

/**
 * Plain-language guide to the app for recruiters.
 *
 * Written for someone who has to hire people, not someone who has to run software: it explains
 * what a number means and what to do next, and it says out loud where the AI should not be
 * trusted on its own.
 */

type Section = { id: string; title: string; Icon: IconType };

const SECTIONS: Section[] = [
  { id: 'flow', title: 'How hiring works here', Icon: LuCircleHelp },
  { id: 'sections', title: 'What each page is for', Icon: LuLayoutDashboard },
  { id: 'scores', title: 'Making sense of the scores', Icon: LuGauge },
  { id: 'stages', title: 'Stages, and what candidates see', Icon: LuUsers },
  { id: 'reasons', title: 'Why you record a reason', Icon: LuMessageSquareQuote },
  { id: 'retiring', title: 'Retiring a role', Icon: LuArchive },
  { id: 'ai-interview', title: 'AI voice interviews', Icon: LuVideo },
  { id: 'offers', title: 'Making an offer', Icon: LuHandshake },
  { id: 'emails', title: 'What candidates receive', Icon: LuMail },
  { id: 'access', title: 'Who can do what', Icon: LuShieldCheck },
];

const STEPS = [
  {
    title: 'Someone applies',
    body: 'You share a job link. The candidate fills in the form and uploads their CV. They get a confirmation email with a link to track their own progress.',
  },
  {
    title: 'The CV is read and scored',
    body: 'Their CV is read automatically and compared against what the role asks for. Within seconds you have a score, a summary, their strengths, and any gaps.',
  },
  {
    title: 'You decide who to talk to',
    body: 'Candidates arrive ranked. You review, shortlist the ones worth your time, and pass on the rest — recording why.',
  },
  {
    title: 'You interview',
    body: 'Book an interview and the candidate is emailed an invitation with a calendar attachment. You can run it yourself, or have the AI interviewer do a first-round call.',
  },
  {
    title: 'You make an offer',
    body: 'Draft the terms privately, extend the offer when the decision is made, then record whether it was accepted or declined.',
  },
];

const PAGES: { to: string; label: string; Icon: IconType; body: string }[] = [
  {
    to: '/hr',
    label: 'Overview',
    Icon: LuLayoutDashboard,
    body: 'Your dashboard. How many candidates you have, where they are, how long each step is taking, and why people drop out.',
  },
  {
    to: '/hr/jobs',
    label: 'Jobs',
    Icon: LuBriefcase,
    body: 'Create and edit roles. Each job has its own application link to share, and can include a short screening quiz that is marked automatically. Finished with a role? Archive it — see below.',
  },
  {
    to: '/hr/candidates',
    label: 'Candidates',
    Icon: LuUsers,
    body: 'Everyone who has applied. The board view shows your pipeline at a glance and lets you drag people between stages; the table view is better for filtering and comparing.',
  },
  {
    to: '/hr/scheduler',
    label: 'Scheduler',
    Icon: LuCalendarClock,
    body: 'Your interviews on a calendar. It warns you about double-bookings and reminds you before each one starts.',
  },
  {
    to: '/hr/recordings',
    label: 'Recordings',
    Icon: LuVideo,
    body: 'Every recorded AI interview in one place, so anyone on the team can watch a conversation back instead of relying on notes.',
  },
  {
    to: '/hr/team',
    label: 'Team',
    Icon: LuUserCog,
    body: 'Invite colleagues and set what they can do. Admins only.',
  },
];

/** Your stage → the wording the candidate sees on their tracking page and in emails. */
const STAGE_ROWS: { stage: keyof typeof STAGE_ICONS; yours: string; theirs: string }[] = [
  { stage: 'new', yours: 'New', theirs: 'Under review' },
  { stage: 'shortlisted', yours: 'Shortlisted', theirs: 'Shortlisted' },
  { stage: 'interviewing', yours: 'Interviewing', theirs: 'Interview stage' },
  { stage: 'offer', yours: 'Offer', theirs: 'Offer extended' },
  { stage: 'hired', yours: 'Hired', theirs: 'Offer accepted' },
  { stage: 'rejected', yours: 'Rejected', theirs: 'Not selected' },
];

const WEIGHTS: { key: keyof typeof DEFAULT_SCORING_WEIGHTS; label: string; body: string }[] = [
  { key: 'skills', label: 'Skills match', body: 'How many of the required skills the CV actually evidences.' },
  { key: 'experience', label: 'Experience', body: 'Depth and relevance of their background against the role.' },
  { key: 'education', label: 'Education', body: 'Whether they meet the education requirement you set.' },
  { key: 'quiz', label: 'Screening quiz', body: 'Their score on the quiz, if the job has one.' },
];

export default function HelpPage() {
  const [active, setActive] = useState(SECTIONS[0]!.id);
  // Scrollspy is muted until this time, while a click-driven scroll is still travelling.
  const suppressSpyUntil = useRef(0);

  /**
   * Glide to a section instead of teleporting.
   *
   * Handled here rather than with a global `scroll-behavior: smooth` so it only applies to
   * this page's contents links — a site-wide setting would also animate route changes and
   * any programmatic scroll, which is not what anyone asked for.
   *
   * The href stays on the anchor so middle-click, copy-link and keyboard still behave; this
   * only intercepts a plain left-click.
   */
  function goToSection(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Long enough for a full-page glide to settle; instant when motion is reduced.
    suppressSpyUntil.current = Date.now() + (reduced ? 0 : 900);
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
    // Keep the URL shareable without letting the hash change trigger a second, instant jump.
    history.replaceState(null, '', `#${id}`);
  }

  // Highlight the section currently in view so the contents list tracks the reader.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // A smooth scroll sweeps past every section in between, which would strobe the
        // highlight down the list and — for a short final section that cannot reach the top
        // of the viewport — leave it settled on the wrong entry. The click already set the
        // destination, so ignore the journey.
        if (Date.now() < suppressSpyUntil.current) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Only counts a section once it reaches the upper part of the viewport, so the highlight
      // moves when you arrive at a heading rather than when it merely appears at the bottom.
      { rootMargin: '-80px 0px -70% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <LuCircleHelp className="h-6 w-6 text-brand-500" />
          Help
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          How this app works, in plain language. No technical knowledge needed.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        {/* Contents */}
        <nav className="hidden lg:sticky lg:top-20 lg:block" aria-label="On this page">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            On this page
          </p>
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => goToSection(e, s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-200 ${
                    active === s.id
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <s.Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* --- How hiring works ------------------------------------------------ */}
          <Card className="scroll-mt-20 p-5" id="flow">
            <h2 className="text-base font-semibold text-slate-800">How hiring works here</h2>
            <p className="mt-1 text-sm text-slate-600">
              Five steps, from an application landing to someone accepting a job.
            </p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3.5">
                  {/* Numbered because this genuinely is a sequence — each step depends on the last. */}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{s.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* --- Pages ----------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="sections">
            <h2 className="text-base font-semibold text-slate-800">What each page is for</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PAGES.map((p) => (
                <Link
                  key={p.to}
                  to={p.to}
                  className="group rounded-xl border border-slate-200 p-3.5 transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <p.Icon className="h-4 w-4 shrink-0 text-brand-500" />
                    {p.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{p.body}</p>
                </Link>
              ))}
            </div>
          </Card>

          {/* --- Scores ---------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="scores">
            <h2 className="text-base font-semibold text-slate-800">Making sense of the scores</h2>
            <p className="mt-1 text-sm text-slate-600">
              Every candidate gets a score out of 100. It is a reading of their CV against the role
              you described — a way to decide who to read first, not a decision.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="pb-2 pr-3 font-medium">Part of the score</th>
                    <th className="pb-2 pr-3 font-medium">What it looks at</th>
                    <th className="pb-2 text-right font-medium">Default weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {WEIGHTS.map((w) => (
                    <tr key={w.key}>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{w.label}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{w.body}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {DEFAULT_SCORING_WEIGHTS[w.key]}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              These weights are per job — change them on the job and everyone who applied is
              re-ranked immediately, without re-reading any CVs.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <p className="text-sm font-semibold text-slate-800">The recommendation</p>
                <p className="mt-1 text-sm text-slate-600">
                  A shorthand for the score: <b>Strong match</b>, <b>Possible</b>, or{' '}
                  <b>Not a fit</b>. Useful for a quick pass, but always open the summary before
                  turning someone down.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <p className="text-sm font-semibold text-slate-800">CV authenticity</p>
                <p className="mt-1 text-sm text-slate-600">
                  An estimate of how likely the CV was written by AI, from the writing style alone.
                  It is a hint, never proof — plenty of honest people use AI to tidy up their
                  writing. Treat a high reading as a question to ask, not a reason to reject.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-l-3 border-amber-400 bg-amber-50/70 p-3.5">
              <p className="text-sm text-amber-900">
                <b>The score is a starting point.</b> It reads a CV; it does not meet the person.
                Someone who changed career, took time out, or writes plainly can score low and
                still be the right hire. Use it to choose who to read first, then judge for
                yourself.
              </p>
            </div>
          </Card>

          {/* --- Stages ---------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="stages">
            <h2 className="text-base font-semibold text-slate-800">Stages, and what candidates see</h2>
            <p className="mt-1 text-sm text-slate-600">
              Moving someone along updates the page they can check themselves. The wording they see
              is deliberately softer than your internal label.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="pb-2 pr-3 font-medium">Your stage</th>
                    <th className="pb-2 font-medium">What the candidate is told</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {STAGE_ROWS.map((r) => {
                    const Icon = STAGE_ICONS[r.stage];
                    return (
                      <tr key={r.stage}>
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2 font-medium text-slate-800">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            {r.yours}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-600">“{r.theirs}”</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Candidates never see their score, your notes, or anything about other applicants.
            </p>
          </Card>

          {/* --- Reasons --------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="reasons">
            <h2 className="text-base font-semibold text-slate-800">Why you record a reason</h2>
            <p className="mt-1 text-sm text-slate-600">
              When you turn someone down you pick a reason from a list. It takes a second, and it
              is the only way the Overview can tell you <i>why</i> you lose people rather than just
              how many.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { t: 'We passed', b: 'You decided not to go forward — missing skills, interview performance, someone else was stronger.' },
                { t: 'Candidate withdrew', b: 'They stopped the process — took another offer, salary did not work, went quiet.' },
                { t: 'Role closed', b: 'Nothing to do with the person — the position was filled or put on hold.' },
              ].map((c) => (
                <div key={c.t} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="text-sm font-semibold text-slate-800">{c.t}</p>
                  <p className="mt-1 text-sm text-slate-600">{c.b}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              The split matters. Someone who withdrew is never counted as a candidate you rejected,
              so your reporting reflects the decisions you actually made.
            </p>
          </Card>

          {/* --- Retiring a role ------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="retiring">
            <h2 className="text-base font-semibold text-slate-800">Retiring a role</h2>
            <p className="mt-1 text-sm text-slate-600">
              Three ways to take a job off the market, depending on what you want to keep.
            </p>
            <div className="mt-4 space-y-3">
              {[
                {
                  t: 'Unavailable',
                  b: 'Stops accepting applications but leaves the role in your list. Anyone opening the link is told applications are closed. Use it for a role that is paused or nearly filled.',
                },
                {
                  t: 'Archive',
                  b: 'Retires the role and moves it out of your working list, keeping every candidate, score, note and interview. The link shows the closed page. Restore it whenever you like — nothing is lost.',
                },
                {
                  t: 'Delete',
                  b: 'Only possible for a role nobody has applied to — a posting created by mistake. Once someone has applied, deleting is refused and archiving is offered instead.',
                },
              ].map((r) => (
                <div key={r.t} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="text-sm font-semibold text-slate-800">{r.t}</p>
                  <p className="mt-1 text-sm text-slate-600">{r.b}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border-l-3 border-brand-400 bg-brand-50/60 p-3.5">
              <p className="text-sm text-slate-700">
                <b>Archive is the one you want for a finished role.</b> Your reporting is built from
                the history of everyone who applied — deleting that history would change past
                figures like time to hire, so a role with applicants cannot be deleted at all.
              </p>
            </div>
          </Card>

          {/* --- AI interviews --------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="ai-interview">
            <h2 className="text-base font-semibold text-slate-800">AI voice interviews</h2>
            <p className="mt-1 text-sm text-slate-600">
              An optional first-round call run by an AI interviewer. Book it like any other
              interview — pick <b>AI voice interview</b> as the mode — and the candidate is emailed
              a private link.
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
              {[
                'The AI opens by saying it is an AI, that the call is recorded, and that a person makes the final decision. The candidate has to agree before anything starts.',
                'It works through questions tailored to that candidate, in the same order for everyone applying to the role, so answers can be compared fairly.',
                'The link only opens shortly before the scheduled time, and works once. Once the interview is finished it cannot be used again.',
                'Afterwards you get the recording, a transcript, and a summary — review them alongside your own judgement.',
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border-l-3 border-brand-400 bg-brand-50/60 p-3.5">
              <p className="text-sm text-slate-700">
                <b>The AI does not decide anything.</b> It holds a conversation and writes up what
                was said. Every hiring decision stays with you.
              </p>
            </div>
          </Card>

          {/* --- Offers ---------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="offers">
            <h2 className="text-base font-semibold text-slate-800">Making an offer</h2>
            <p className="mt-1 text-sm text-slate-600">
              The offer card appears on a candidate once they reach the interview stage.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                ['Draft the terms', 'Salary, start date, a respond-by date, and any internal notes. Nothing is sent — only your team can see a draft.'],
                ['Extend it', 'When the decision is made, extend the offer. The candidate moves to the Offer stage and is told an offer has been made.'],
                ['Record the answer', 'Mark it accepted or declined. Accepted moves them to Hired; declined asks why, so you learn what is costing you offers.'],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-slate-600">
              Changing an offer that has already been answered creates a new one rather than
              editing the old — the record of what someone was originally told is kept.
            </p>
          </Card>

          {/* --- Emails ---------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="emails">
            <h2 className="text-base font-semibold text-slate-800">What candidates receive</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sent automatically. Every one carries a link where they can check their own progress.
            </p>
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                ['When they apply', 'A confirmation that their application arrived.'],
                ['When you move them', 'An update written for the stage they moved to.'],
                ['When you book an interview', 'The date, time, and joining details, with a calendar attachment.'],
                ['If you change or cancel it', 'A replacement invitation, or a note that it is cancelled.'],
              ].map(([t, b]) => (
                <li key={t} className="flex flex-wrap gap-x-3 py-2.5">
                  <span className="w-52 shrink-0 font-medium text-slate-800">{t}</span>
                  <span className="min-w-0 flex-1 text-slate-600">{b}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* --- Access ---------------------------------------------------------- */}
          <Card className="scroll-mt-20 p-5" id="access">
            <h2 className="text-base font-semibold text-slate-800">Who can do what</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <LuShieldCheck className="h-4 w-4 text-brand-500" />
                  Admin
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Everything a member can do, plus managing the team, deleting records, and seeing
                  the activity log.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <LuUsers className="h-4 w-4 text-slate-500" />
                  Member
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Runs the hiring: jobs, candidates, interviews, and reviews. Cannot delete records
                  or change who has access.
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Change your own name, photo, or password under{' '}
              <Link to="/hr/settings" className="font-medium text-brand-600 hover:underline">
                Account settings
              </Link>
              , where you can also turn on two-factor sign-in.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
