// 관리 화면 공용 표시 요소(서버·클라이언트 양쪽에서 쓸 수 있는 순수 컴포넌트).
import { statusLabel, type RecentStatus, type StatusTone } from "@/lib/ingest-ui";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const TONE: Record<StatusTone, string> = {
  muted: "border border-[var(--line)] text-[var(--muted)]",
  accent: "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]",
  success: "bg-[color-mix(in_srgb,#16a34a_14%,transparent)] text-[color-mix(in_srgb,#16a34a_80%,var(--fg))]",
  danger: "bg-[color-mix(in_srgb,#dc2626_12%,transparent)] text-[color-mix(in_srgb,#dc2626_80%,var(--fg))]",
};

export function StatusBadge({ status, progress, className = "" }: { status: RecentStatus; progress: string | null; className?: string }) {
  const s = statusLabel({ status, progress });
  return <span className={`truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[s.tone]} ${className}`}>{s.label}</span>;
}

export function Icon({ children, size = 16, className, label }: { children: React.ReactNode; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={className}
    >
      {children}
    </svg>
  );
}

export const LockIcon = ({ size = 14, label }: { size?: number; label?: string }) => (
  <Icon size={size} label={label} className="shrink-0">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
export const GlobeIcon = ({ size = 14, label }: { size?: number; label?: string }) => (
  <Icon size={size} label={label} className="shrink-0">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon size={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);
export const ChevronRightIcon = () => (
  <Icon size={16}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
export const ChevronLeftIcon = () => (
  <Icon size={16}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
export const ExternalIcon = () => (
  <Icon size={14}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
);
export const AlertIcon = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);

const dateFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });
const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}
export function formatDateTime(d: Date): string {
  return dateTimeFmt.format(d);
}
