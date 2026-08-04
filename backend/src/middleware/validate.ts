import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';

/**
 * Request-validation middleware.
 *
 * Standard pattern: declare the schema for each part of the request next to the route,
 * validate before the handler runs, and let the central error handler turn a ZodError into
 * the documented `{ error: { code, message, details } }` 400 response. Handlers then read
 * `req.params` / `req.query` / `req.body` as already-validated, correctly-typed data.
 *
 * This also closes a whole class of 500s: an unvalidated `:id` reaching a Postgres `uuid`
 * column raises `22P02` deep in the driver, which surfaced as "Something went wrong"
 * instead of a clean 400.
 *
 *   router.get('/:id', validate({ params: idParams }), handler)
 */
export function validate(schemas: {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): RequestHandler<any, any, any, any> {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Assign parsed output back so handlers get coerced/defaulted values.
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // Express 5's req.query is a getter — redefine rather than assign.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      next(err); // ZodError → 400 VALIDATION_ERROR in the error handler
    }
  };
}

// --- Reusable field/param primitives -------------------------------------------------

/** A UUID path param, e.g. `/candidates/:id`. */
export const idParams = z.object({ id: z.string().uuid('Must be a valid id') });

/** Two UUID path params, e.g. `/candidates/:id/notes/:noteId`. */
export const idNoteParams = z.object({
  id: z.string().uuid('Must be a valid id'),
  noteId: z.string().uuid('Must be a valid note id'),
});

/** A UUID-token path param, e.g. the applicant status link `/status/:token`. */
export const tokenParams = z.object({ token: z.string().uuid('Invalid tracking link') });

/** LiveKit room name — our rooms are `ai-interview-<uuid>`. */
export const roomParams = z.object({
  room: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid room name'),
});

/** Trimmed, length-bounded free text. Use for every user-supplied string. */
export const text = (max: number, min = 0) =>
  z.string().trim().min(min).max(max, `Must be ${max} characters or fewer`);

/** An optional query string that treats "" as absent (so `?stage=` doesn't 400). */
export const optionalQueryString = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** A safe http(s) URL. Rejects `javascript:` / `data:` payloads that get rendered as links. */
export const httpUrl = (max = 512) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => {
        try {
          return ['http:', 'https:'].includes(new URL(v).protocol);
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid http(s) URL' },
    );
