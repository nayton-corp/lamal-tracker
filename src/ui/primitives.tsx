import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-border bg-surface p-4 shadow-card", className)} {...props} />;
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface-2 text-text hover:bg-border",
  ghost: "bg-transparent text-primary hover:bg-primary-soft",
  danger: "bg-up text-white hover:opacity-90",
  lca: "bg-lca-strong text-black hover:opacity-90",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
    buttonVariants[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-surface-2 text-muted",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  lca: "bg-lca-soft text-lca",
  info: "bg-primary-soft text-primary",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start gap-3">
      {back && (
        <Link
          href={back}
          aria-label="Retour"
          className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary-soft"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "up" | "down" | "lca"; title?: string; children: ReactNode }) {
  const tones = {
    info: "border-primary/30 bg-primary-soft",
    up: "border-up/30 bg-up-soft",
    down: "border-down/30 bg-down-soft",
    lca: "border-lca-strong bg-lca-soft",
  } as const;
  return (
    <div role={tone === "up" || tone === "lca" ? "alert" : "status"} className={cn("rounded-xl border p-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && "mt-0.5")}>{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-up">{error}</p>}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text placeholder:text-muted focus:border-primary focus:outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, "appearance-none bg-[length:1rem] pr-8", props.className)} />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("num mt-0.5 truncate text-lg font-bold", tone === "up" && "text-up", tone === "down" && "text-down")}>{value}</p>
      {sub && <p className="num text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function ListRow({ href, children, trailing }: { href?: string; children: ReactNode; trailing?: ReactNode }) {
  const content = (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
      {href && (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block border-b border-border last:border-b-0 hover:bg-surface-2/50">
      {content}
    </Link>
  ) : (
    <div className="border-b border-border last:border-b-0">{content}</div>
  );
}
