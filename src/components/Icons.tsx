// Small inline icons from the approved mockup (stroke icons inherit the text color).
type P = { size?: number };
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const });

export const HomeIcon = ({ size = 26 }: P) => (
  <svg {...svg(size)} fill="currentColor"><path d="M12 3 2 11.5h3V21h5v-6h4v6h5v-9.5h3Z" /></svg>
);
export const TeamIcon = ({ size = 26 }: P) => (
  <svg {...svg(size)} fill="currentColor">
    <circle cx="12" cy="7" r="3.2" /><circle cx="5" cy="9" r="2.4" /><circle cx="19" cy="9" r="2.4" />
    <path d="M6 20a6 6 0 0 1 12 0Z" /><path d="M0.5 19a4.5 4.5 0 0 1 6.2-4.2A7.5 7.5 0 0 0 4.6 19Z" /><path d="M23.5 19a4.5 4.5 0 0 0-6.2-4.2 7.5 7.5 0 0 1 2.1 4.2Z" />
  </svg>
);
export const ChartIcon = ({ size = 26 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="18" /><rect x="2" y="10" width="7" height="11" /><rect x="15" y="13" width="7" height="8" />
  </svg>
);
export const CalendarIcon = ({ size = 26 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" />
  </svg>
);
export const FlagIcon = ({ size = 30 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 21V3l11 4-11 4" /><path d="M3 21h8" /></svg>
);
export const ClockIcon = ({ size = 16 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const LockIcon = ({ size = 16 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const PencilIcon = ({ size = 16 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const CheckIcon = ({ size = 10 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
);
export const XIcon = ({ size = 10 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const ExternalIcon = ({ size = 18 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const ArrowIcon = ({ size = 20 }: P) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
export const Silhouette = ({ size = 38 }: P) => (
  <svg {...svg(size)} fill="#ffffff"><circle cx="12" cy="9" r="4.5" /><path d="M3 24a9 9 0 0 1 18 0Z" /></svg>
);
