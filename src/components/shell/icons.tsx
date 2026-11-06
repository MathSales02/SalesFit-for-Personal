// Minimal stroke icons (24px grid) so the app ships no icon library.
const base = { width: "100%", height: "100%", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconHome = () => (
  <svg {...base}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9v11h14V9" />
  </svg>
);
export const IconUser = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
export const IconShield = () => (
  <svg {...base}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />
  </svg>
);
export const IconActivity = () => (
  <svg {...base}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);
export const IconLogout = () => (
  <svg {...base}>
    <path d="M15 4h4v16h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </svg>
);
export const IconUsers = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5" />
    <path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.7.7 2.9 2.4 3.5 5.2" />
  </svg>
);
export const IconHeart = () => (
  <svg {...base}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" />
  </svg>
);
export const IconDumbbell = () => (
  <svg {...base}>
    <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
  </svg>
);
export const IconClipboard = () => (
  <svg {...base}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5h6M9 10h6M9 14h6M9 18h3" />
  </svg>
);
export const IconTrend = () => (
  <svg {...base}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);
export const IconChat = () => (
  <svg {...base}>
    <path d="M4 5h12v9H8l-4 3.5V5Z" />
    <path d="M16 9h4v9.5L16.5 16H10v-2" />
  </svg>
);
export const IconBell = () => (
  <svg {...base}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);
export const IconMessage = () => (
  <svg {...base}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </svg>
);
export const IconMenu = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const IconTrophy = () => (
  <svg {...base}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8" />
    <path d="M12 13v4M8.5 20h7M10 17h4" />
  </svg>
);
