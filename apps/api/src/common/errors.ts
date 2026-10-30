import { HttpException, HttpStatus } from '@nestjs/common';

/** A rule from the spec blocked the request. `code` is stable for clients to branch on. */
export class RuleViolation extends HttpException {
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super({ code, message, ...extra }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class NotFound extends HttpException {
  constructor(what: string) {
    // The same answer whether the record does not exist or belongs to another client.
    super({ code: 'not_found', message: `${what} not found.` }, HttpStatus.NOT_FOUND);
  }
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e?.code ? e : e?.cause;
  return pg?.code === '23505' && (!constraint || pg.constraint === constraint);
}
