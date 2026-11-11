/** Line icons for the community (24 px grid, inherit the text colour). */
type P = { filled?: boolean; className?: string };
const base = (className = "size-5") => ({ viewBox: "0 0 24 24", "aria-hidden": true, className, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const HeartIcon = ({ filled, className }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7.5-4.7-7.5-10.4A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.7c0 5.7-7.5 10.4-7.5 10.4Z" />
  </svg>
);
export const CommentIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.3-4.2A7.5 7.5 0 1 1 20 11.5Z" />
  </svg>
);
export const ShareIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </svg>
);
export const BookmarkIcon = ({ filled, className }: P) => (
  <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />
  </svg>
);
export const MoreIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? "size-5"} fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
export const ImageIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 18 4.5-4.5 3 3L15 14l4 4" />
  </svg>
);
export const WorkoutIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11" />
  </svg>
);
export const PinIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7" />
  </svg>
);
export const PlusIcon = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const SearchIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base(className)} strokeWidth={2.2}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const SendIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12h13m0 0-5-5m5 5-5 5" />
  </svg>
);
export const FlameIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 21a6 6 0 0 1-6-6c0-3 2-4.5 3-7 .5 1.5 1.5 2.5 2.5 3C12 8 12.5 5.5 12 3c3 2 6 5.5 6 12a6 6 0 0 1-6 6Z" />
  </svg>
);
export const CameraIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 8.500A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.600L16 7h2.500A1.5 1.5 0 0 1 20 8.500v9a1.5 1.5 0 0 1-1.5 1.500h-13A1.5 1.5 0 0 1 4 17.500v-9Z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
