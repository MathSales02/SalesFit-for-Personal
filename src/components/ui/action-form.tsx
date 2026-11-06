"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "./notice";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);
export const useActionPending = () => useContext(PendingContext);

/**
 * Form bound to a server action.
 * - Without JavaScript it still posts natively (progressive enhancement).
 * - With JavaScript it submits through a transition instead of the `action`
 *   prop, so React does not auto-reset the fields: input survives validation
 *   errors and saved values stay visible. Pass resetOnSuccess for forms that
 *   should clear after a successful submit (e.g. invite by email).
 */
export function ActionForm({
  action,
  children,
  className = "flex flex-col gap-5",
  successNotice = true,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: (state: ActionResult) => React.ReactNode;
  className?: string;
  successNotice?: boolean;
  resetOnSuccess?: boolean;
  /** Runs after a successful submit, e.g. to reset client state the form reset does not cover. */
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as ActionResult);
  const formRef = useRef<HTMLFormElement>(null);

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (!(state.ok && state.message)) return;
    if (resetOnSuccess) formRef.current?.reset();
    onSuccessRef.current?.();
  }, [state, resetOnSuccess]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  return (
    <PendingContext.Provider value={pending}>
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className={className} noValidate>
        {!state.ok && !state.fieldErrors && <Notice tone="error">{state.message}</Notice>}
        {!state.ok && state.fieldErrors?._form && <Notice tone="error">{state.fieldErrors._form.join(" ")}</Notice>}
        {successNotice && state.ok && state.message && <Notice tone="success">{state.message}</Notice>}
        {children(state)}
      </form>
    </PendingContext.Provider>
  );
}

export function fieldErrors(state: ActionResult, name: string): string[] | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
