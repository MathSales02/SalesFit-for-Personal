/**
 * Typed result for server actions. Errors carry only public messages; stack
 * traces and database errors never reach the client.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]>; retryAfterSec?: number };
