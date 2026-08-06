import { setDefaultResultOrder } from 'node:dns';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { env, corsOrigins } from './config/env.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { jobsRouter } from './routes/jobs.js';
import { applicationsRouter } from './routes/applications.js';
import { candidatesRouter } from './routes/candidates.js';
import { statsRouter } from './routes/stats.js';
import { auditRouter } from './routes/audit.js';
import { interviewsRouter } from './routes/interviews.js';
import { aiInterviewRouter } from './routes/aiInterview.js';
import { teamRouter } from './routes/team.js';
import { offersRouter } from './routes/offers.js';
import { startRetentionSweeper } from './services/retention.js';
import { startInterviewReminderSweeper } from './services/interviewReminder.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

/*
 * Prefer IPv4 when a hostname resolves to both.
 *
 * Node 17+ returns addresses in whatever order DNS gave them rather than preferring IPv4, so on
 * a host with no IPv6 route an outbound connection can pick the AAAA record and die with
 * ENETUNREACH.
 *
 * Note this covers `dns.lookup` only — anything using `dns.resolve4/6` directly does its own
 * ordering and is unaffected. Nodemailer is one of those; see the retry in services/email.ts.
 */
setDefaultResultOrder('ipv4first');

const app = express();

// Behind Render/other proxies — needed for correct client IPs (rate limiting).
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/candidates', candidatesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/ai-interview', aiInterviewRouter);
app.use('/api/team', teamRouter);
// Offer routes are mounted at /api so they can sit under /candidates/:id/offer.
app.use('/api', offersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
  startRetentionSweeper();
  startInterviewReminderSweeper();
});
