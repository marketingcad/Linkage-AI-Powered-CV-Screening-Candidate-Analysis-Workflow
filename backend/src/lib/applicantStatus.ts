// Applicant-facing view of the internal pipeline stage.
// Never exposes AI scores, evaluations, or other candidates — status only.

export type StageKey = 'new' | 'shortlisted' | 'interviewing' | 'offer' | 'hired' | 'rejected';
export type StatusTone = 'neutral' | 'positive' | 'negative';

export const APPLICANT_STATUS: Record<StageKey, { label: string; message: string; tone: StatusTone }> = {
  new: {
    label: 'Under review',
    message: 'Your application has been received and is being reviewed by our team.',
    tone: 'neutral',
  },
  shortlisted: {
    label: 'Shortlisted',
    message: 'Great news — you have been shortlisted. Our team will be in touch about the next steps.',
    tone: 'positive',
  },
  interviewing: {
    label: 'Interview stage',
    message: 'You have progressed to the interview stage. We will contact you shortly to arrange the details.',
    tone: 'positive',
  },
  // 'hired' used to be labelled "Offer" because there was no offer stage — which told a
  // candidate whose offer was still pending the same thing as one who had already accepted.
  offer: {
    label: 'Offer extended',
    message:
      'We would like to offer you the role. Check your email for the details — we look forward to your response.',
    tone: 'positive',
  },
  hired: {
    label: 'Offer accepted',
    message:
      'Congratulations, and welcome aboard! Our team will be in touch about your start date and onboarding.',
    tone: 'positive',
  },
  rejected: {
    label: 'Not selected',
    message:
      'Thank you for your interest and the time you invested. After careful review, we will not be moving forward at this time. We truly wish you the best in your search.',
    tone: 'negative',
  },
};

// Ordered pipeline for the applicant status tracker (rejected is terminal, shown separately).
export const APPLICANT_TIMELINE: StageKey[] = ['new', 'shortlisted', 'interviewing', 'offer', 'hired'];

export function statusFor(stage: string) {
  return APPLICANT_STATUS[stage as StageKey] ?? APPLICANT_STATUS.new;
}
