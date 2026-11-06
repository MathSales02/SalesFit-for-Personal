"use client";

import { useFormStatus } from "react-dom";

import { buttonClass, type Variant } from "./button-styles";

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
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, full)}>
      {pending ? (pendingLabel ?? "Aguarde…") : children}
    </button>
  );
}
