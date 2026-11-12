import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";

import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/**
 * Converts FormData to a plain object and validates it with a strict schema,
 * so unexpected fields are rejected. Next.js internal fields are dropped first.
 */
export function parseForm<S extends z.ZodType>(schema: S, form: FormData): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") throw Errors.validation({ [key]: ["Campo inválido."] });
    if (key in obj) throw Errors.validation({ [key]: ["Campo duplicado."] });
    obj[key] = value;
  }
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".") || "_form";
      // One message per field is easier to act on than a list.
      fieldErrors[k] ??= [issue.code === "unrecognized_keys" ? "Campos inesperados." : issue.message];
    }
    throw Errors.validation(fieldErrors);
  }
  return parsed.data;
}

/** Validates a non-form action argument (actions called directly from client code). */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.validation({ _form: ["Dados inválidos."] });
  return parsed.data;
}

/** Runs an action body and maps errors to a safe ActionResult. */
export async function runAction<T>(name: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return localized(await run(name, fn));
}

async function run<T>(name: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    // Lets redirect() and notFound() work inside actions.
    unstable_rethrow(err);
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.publicMessage, fieldErrors: err.details?.fieldErrors, retryAfterSec: err.details?.retryAfterSec };
    }
    log.error("action failed", { action: name, ...errorFields(err) });
    return { ok: false, code: "INTERNAL", message: "Algo deu errado. Tente novamente em instantes." };
  }
}

/**
 * Puts a result's texts in the language of the request. Messages built with values inside
 * (a count, a name) have no catalogue entry and stay in Portuguese for now.
 */
async function localized<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  const t = await getT();
  if (result.ok) return result.message ? { ...result, message: t(result.message) } : result;
  return {
    ...result,
    message: t(result.message),
    fieldErrors: result.fieldErrors ? Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k, v.map((m) => t(m))])) : result.fieldErrors,
  };
}
