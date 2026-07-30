import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[config] Missing required env ${name} — copy .env.example to .env and fill it in.`);
  return v;
}

const livekitUrl = req('LIVEKIT_URL');

export const config = {
  // wss:// URL the browser and agent connect to for media.
  livekitUrl,
  // https:// URL the server SDK (rooms, egress) talks to — derived from the wss URL.
  livekitHttpUrl: livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
  livekitApiKey: req('LIVEKIT_API_KEY'),
  livekitApiSecret: req('LIVEKIT_API_SECRET'),

  // Only the agent worker needs this — the server (tokens/recording) runs without it,
  // so it's read here but not required. The agent validates it at startup.
  googleApiKey: process.env.GOOGLE_API_KEY ?? '',
  geminiLiveModel:
    process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',

  port: Number(process.env.PORT ?? 4100),

  // Scheduling: HMAC secret for time-gated join links, and how many minutes before the
  // scheduled time a candidate may join.
  scheduleSecret: process.env.SCHEDULE_SECRET ?? 'dev-schedule-secret-change-me',
  scheduleLeadMinutes: Number(process.env.SCHEDULE_LEAD_MINUTES ?? 15),

  // Recording is optional — only enabled when a bucket is configured.
  s3: process.env.S3_BUCKET
    ? {
        bucket: req('S3_BUCKET'),
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint: process.env.S3_ENDPOINT ?? '',
        accessKey: req('S3_ACCESS_KEY'),
        secretKey: req('S3_SECRET_KEY'),
      }
    : null,
};
