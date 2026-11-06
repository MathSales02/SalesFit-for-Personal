type Tone = "error" | "success" | "info" | "warning";

const toneClass: Record<Tone, string> = {
  error: "bg-danger-tint text-danger border-danger/25",
  success: "bg-turf-tint text-turf border-turf/20",
  info: "bg-paper text-ink-soft border-line",
  warning: "bg-signal-tint text-ink border-signal/40",
};

/** Inline status message. Errors are announced immediately to screen readers. */
export function Notice({ tone = "info", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-[var(--radius-control)] border px-3.5 py-3 text-sm leading-relaxed ${toneClass[tone]}`}>
      {children}
    </div>
  );
}
