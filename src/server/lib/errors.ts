/**
 * Errors with a stable code and a message that is safe to show to users.
 * Anything that is not an AppError is reported to the user as a generic failure.
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT: 402,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly publicMessage: string,
    readonly details?: { fieldErrors?: Record<string, string[]>; retryAfterSec?: number },
  ) {
    super(`${code}: ${publicMessage}`);
    this.name = "AppError";
    this.status = HTTP_STATUS[code];
  }
}

export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", "Faça login para continuar."),
  // Same message for "exists but not yours" and "does not exist" to avoid leaking resource existence (BOLA).
  notFound: () => new AppError("NOT_FOUND", "Não encontrado."),
  forbidden: () => new AppError("FORBIDDEN", "Você não tem permissão para esta ação."),
  rateLimited: (retryAfterSec: number) =>
    new AppError("RATE_LIMITED", "Muitas tentativas. Aguarde um pouco e tente novamente.", { retryAfterSec }),
  validation: (fieldErrors: Record<string, string[]>) =>
    new AppError("VALIDATION", "Confira os campos destacados.", { fieldErrors }),
};
