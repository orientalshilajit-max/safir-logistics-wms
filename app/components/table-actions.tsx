import type { ReactNode } from "react";
import Link from "next/link";

type Tone = "neutral" | "danger" | "primary";

const toneStyles: Record<Tone, string> = {
  danger: "border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700",
  neutral: "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-950",
  primary: "border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
};

export function TableActionLink({
  "aria-label": ariaLabel,
  children,
  href,
  title,
  tone = "neutral",
}: {
  "aria-label": string;
  children: ReactNode;
  href: string;
  title: string;
  tone?: Tone;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex size-8 items-center justify-center rounded-md border bg-white transition ${toneStyles[tone]}`}
    >
      {children}
    </Link>
  );
}

export function TableActionButton({
  "aria-label": ariaLabel,
  children,
  disabled,
  onClick,
  title,
  tone = "neutral",
}: {
  "aria-label": string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex size-8 items-center justify-center rounded-md border bg-white transition disabled:cursor-not-allowed disabled:opacity-50 ${toneStyles[tone]}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PencilIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

export function ViewIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 21h14" strokeLinecap="round" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 17h16" strokeLinecap="round" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7.5" cy="14.5" r="3.5" />
      <path d="m10 12 8-8 3 3-2 2 2 2-2 2-2-2-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16v12H4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
