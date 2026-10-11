"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "./cn";

export function Panel({ title, icon, actions, className, bodyClassName, children }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string; bodyClassName?: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_18px_50px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl", className)}>
      <header className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        {icon && <span className="text-muted [&>svg]:size-4">{icon}</span>}
        <h2 className="font-serif text-[15px] leading-none tracking-tight text-cream">{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">{actions}</div>
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "danger" | "warn" | "ok" | "teal" | "violet" | "info" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-white/[0.05] text-muted border-white/10",
  danger: "bg-danger/10 text-danger border-danger/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  ok: "bg-ok/10 text-ok border-ok/30",
  teal: "bg-ok/10 text-ok border-ok/30",
  violet: "bg-violet/10 text-violet border-violet/30",
  info: "bg-info/10 text-info border-info/30",
  accent: "bg-accent/10 text-accent border-accent/30",
};

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium", toneClass[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  quarantined: "danger",
  block: "danger",
  rejected: "danger",
  reversed: "warn",
  compensated: "warn",
  compensating: "warn",
  reverted: "warn",
  kept: "ok",
  held: "violet",
  hold: "violet",
  candidate: "violet",
  deduped: "info",
  replaying: "info",
  active: "ok",
  allow: "ok",
  resolved: "ok",
  ship: "ok",
  live: "ok",
};

export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? "neutral";

type Variant = "primary" | "danger" | "ghost" | "outline";

export function Button({ variant = "outline", loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-3.5",
        variant === "primary" && "bg-fg text-[#160923] hover:bg-cream",
        variant === "danger" && "bg-danger text-[#160923] hover:bg-danger/90",
        variant === "ghost" && "text-muted hover:bg-white/[0.06] hover:text-fg",
        variant === "outline" && "border border-white/20 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.07]",
        className,
      )}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-20 items-center justify-center p-4 text-center text-xs text-muted">{children}</div>;
}

export function Bar({ value, max, tone = "accent", className }: { value: number; max: number; tone?: Tone; className?: string }) {
  const w = max === 0 ? 0 : Math.round((value / max) * 100);
  const fill: Record<Tone, string> = { neutral: "bg-muted", danger: "bg-danger", warn: "bg-warn", ok: "bg-ok", teal: "bg-ok", violet: "bg-violet", info: "bg-info", accent: "bg-accent" };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-all", fill[tone])} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Gentle fade/slide-up on scroll; disabled when the user prefers reduced motion. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      // Animate on mount, not on intersection: console content must never be stuck invisible.
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.6, 0.35, 1] }}
    >
      {children}
    </motion.div>
  );
}
