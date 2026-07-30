/**
 * Builds the interviewer persona/instructions from the room metadata the backend attaches
 * in createRoomAndSession (candidate name, job requirements, CV summary, generated questions).
 */
export interface InterviewContext {
  candidateName: string;
  jobTitle: string | null;
  jobRequirements: string;
  cvSummary: string;
  questions: string[];
  maxMinutes: number;
}

export const FALLBACK_CONTEXT: InterviewContext = {
  candidateName: 'the candidate',
  jobTitle: null,
  jobRequirements: 'the role',
  cvSummary: '',
  questions: [],
  maxMinutes: 15,
};

export function parseContext(metadata: string | undefined): InterviewContext {
  if (!metadata) return FALLBACK_CONTEXT;
  try {
    return { ...FALLBACK_CONTEXT, ...(JSON.parse(metadata) as Partial<InterviewContext>) };
  } catch {
    return FALLBACK_CONTEXT;
  }
}

export function buildInterviewerInstructions(ctx: InterviewContext): string {
  const role = ctx.jobTitle ?? 'the role';
  const questions = ctx.questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n');

  return [
    `You are "Robin", a warm, professional voice interviewer for the ${role} position.`,
    `You are speaking out loud with ${ctx.candidateName} on a live video call. Be concise and natural — this is spoken conversation, not an essay.`,
    ``,
    `Role requirements: ${ctx.jobRequirements}`,
    ctx.cvSummary ? `What their CV shows: ${ctx.cvSummary}` : '',
    ``,
    `How to conduct the interview:`,
    `- Greet them by name, confirm they can hear you, and briefly set expectations.`,
    `- Ask ONE question at a time and wait for the full answer before moving on.`,
    `- Ask natural follow-ups grounded in what they actually said and in their CV.`,
    `- Cover these focus areas (adapt the wording, don't read them robotically):`,
    questions || `  (Use your judgement to probe the role requirements above.)`,
    `- Keep the whole interview under about ${ctx.maxMinutes} minutes, then wrap up warmly.`,
    ``,
    `Boundaries:`,
    `- Do NOT make or state a hiring decision — a human reviews the recording afterward.`,
    `- Do not ask about age, race, religion, health, family/marital status, or other protected characteristics.`,
    `- If asked, remind them the call is recorded for the hiring team.`,
    `- End by thanking them and letting them know the team will follow up.`,
  ]
    .filter(Boolean)
    .join('\n');
}
