/**
 * A member's photo, or their initial when they have none. Decorative: the name is
 * always written next to it. `ring` marks a member who trained today.
 */
export function Avatar({ name, src, size = 40, ring = false, className = "" }: { name: string; src?: string | null; size?: number; ring?: boolean; className?: string }) {
  const inner = src ? (
    // Short-lived signed URL; next/image would cache it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className="size-full rounded-full bg-surface-subtle object-cover" />
  ) : (
    <span className="grid size-full place-items-center rounded-full bg-turf-tint font-display font-bold text-turf" style={{ fontSize: size * 0.42 }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
  if (!ring) {
    return (
      <span aria-hidden="true" className={`block shrink-0 rounded-full ${className}`} style={{ width: size, height: size }}>
        {inner}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`block shrink-0 rounded-full bg-signal p-[2.5px] ${className}`} style={{ width: size + 9, height: size + 9 }}>
      <span className="block size-full rounded-full bg-paper p-[2px]">{inner}</span>
    </span>
  );
}
