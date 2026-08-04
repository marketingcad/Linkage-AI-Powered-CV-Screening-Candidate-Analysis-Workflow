import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Please upload a CV under the size limit.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Please upload exactly one CV file.'
          : `Upload error: ${err.message}`;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }

  // Malformed JSON body (express.json throws a SyntaxError with a `body` property).
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
    });
  }

  // Payload larger than the body-parser limit.
  if (isErrorWithCode(err) && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
  }

  // Postgres invalid input syntax (e.g. a non-UUID id or a bad enum value reaching a
  // typed column). Validation should catch these first; this is the safety net so they
  // return 400 rather than a 500 + error-level log on every malformed request.
  if (isErrorWithCode(err) && (err.code === '22P02' || err.code === '22003')) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data' },
    });
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      // Log the internals; never echo them to the client (they can carry upstream
      // provider messages: quota details, request URLs, model ids).
      logger.error({ err }, err.message);
      return res.status(err.status).json({
        error: { code: err.code, message: 'Something went wrong' },
      });
    }
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
}

/** Narrow an unknown error to the shape used by body-parser and postgres.js. */
function isErrorWithCode(err: unknown): err is { code?: string; type?: string } {
  return typeof err === 'object' && err !== null;
}
