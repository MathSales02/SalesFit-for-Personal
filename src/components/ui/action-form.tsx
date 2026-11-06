"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "./notice";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action. Works without JavaScript (progressive
 * enhancement) and renders field errors returned by the server.
 */
export function ActionForm({
  action,
  children,
  className = "flex flex-col gap-5",
  successNotice = true,
}: {
  action: Action;
  children: (state: ActionResult) => React.ReactNode;
  className?: string;
  successNotice?: boolean;
}) {
  const [state, formAction] = useActionState(action, { ok: true } as ActionResult);
  return (
    <form action={formAction} className={className} noValidate>
      {!state.ok && !state.fieldErrors && <Notice tone="error">{state.message}</Notice>}
      {!state.ok && state.fieldErrors?._form && <Notice tone="error">{state.fieldErrors._form.join(" ")}</Notice>}
      {successNotice && state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      {children(state)}
    </form>
  );
}

export function fieldErrors(state: ActionResult, name: string): string[] | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
