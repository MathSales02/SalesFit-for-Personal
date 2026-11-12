"use client";

import { useFormStatus } from "react-dom";
import { useActionPending } from "./action-form";
import { buttonClass, type Variant } from "./button-styles";
import { useT } from "@/i18n/client";

/** Submit button that disables itself and shows progress while its form is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  full = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  full?: boolean;
  name?: string;
  value?: string;
}) {
  const t = useT();
  // Plain <form action> submissions report through useFormStatus; ActionForm reports through context.
  const { pending: nativePending } = useFormStatus();
  const actionPending = useActionPending();
  const pending = nativePending || actionPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, full)}>
      {pending ? (pendingLabel ?? t("Aguarde…")) : children}
    </button>
  );
}
