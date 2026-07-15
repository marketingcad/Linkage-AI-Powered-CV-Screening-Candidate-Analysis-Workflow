export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') =>
  new AppError(404, 'NOT_FOUND', message);
export const serverError = (message = 'Internal server error', details?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', message, details);
