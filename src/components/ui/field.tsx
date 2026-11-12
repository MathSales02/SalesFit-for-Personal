"use client";

import { useId } from "react";
import { useT } from "@/i18n/client";

type Common = {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
};

const controlClass = (invalid: boolean) =>
  `rounded-[var(--radius-control)] border bg-paper px-3 text-base text-ink placeholder:text-muted outline-none transition-colors focus:border-turf focus:ring-2 focus:ring-turf/20 ${
    invalid ? "border-danger" : "border-line-strong"
  }`;

/** Label, hint and error text wired up for screen readers around any control. */
function FieldFrame({ label, hint, errors, children }: Omit<Common, "name" | "required"> & { children: (a11y: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode }) {
  const id = useId();
  const invalid = !!errors?.length;
  const describedBy = [hint ? `${id}-hint` : null, invalid ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid })}
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

export function Field({
  type = "text",
  autoComplete,
  defaultValue,
  required = true,
  maxLength,
  minLength,
  inputMode,
  ...rest
}: Common & {
  type?: "text" | "email" | "password" | "number";
  autoComplete?: string;
  defaultValue?: string;
  maxLength?: number;
  minLength?: number;
  inputMode?: "numeric" | "decimal" | "email" | "text";
}) {
  return (
    <FieldFrame {...rest}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={rest.name}
          type={type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          minLength={minLength}
          inputMode={inputMode}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`h-11 ${controlClass(invalid)}`}
        />
      )}
    </FieldFrame>
  );
}

export function TextAreaField({ defaultValue, required = false, maxLength, rows = 3, ...rest }: Common & { defaultValue?: string; maxLength?: number; rows?: number }) {
  return (
    <FieldFrame {...rest}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name={rest.name}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          rows={rows}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`py-2.5 leading-relaxed ${controlClass(invalid)}`}
        />
      )}
    </FieldFrame>
  );
}

export function SelectField({
  options,
  defaultValue,
  required = false,
  ...rest
}: Common & { options: { value: string; label: string }[]; defaultValue?: string }) {
  const t = useT();
  return (
    <FieldFrame {...rest}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          name={rest.name}
          defaultValue={defaultValue}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`h-11 ${controlClass(invalid)}`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      )}
    </FieldFrame>
  );
}
