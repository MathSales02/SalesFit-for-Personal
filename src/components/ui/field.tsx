"use client";

import { useId } from "react";

type FieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  hint?: string;
  errors?: string[];
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
};

/** Labelled input with hint and error text wired up for screen readers. */
export function Field({ label, name, type = "text", autoComplete, hint, errors, defaultValue, required = true, maxLength, minLength }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, errors?.length ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const invalid = !!errors?.length;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`h-11 rounded-[var(--radius-control)] border bg-paper px-3 text-base text-ink placeholder:text-muted outline-none transition-colors focus:border-turf focus:ring-2 focus:ring-turf/20 ${
          invalid ? "border-danger" : "border-line-strong"
        }`}
      />
      {hint && !invalid && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
