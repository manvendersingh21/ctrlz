"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
import styles from "./landing.module.css";

/** Drifting light beams plus a cursor-following spotlight, scoped to the parent hero section. */
export function HeroFx() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      layer.style.setProperty("--spot-x", `${x}px`);
      layer.style.setProperty("--spot-y", `${y}px`);
      layer.dataset.spot = "on";
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = layer.getBoundingClientRect();
      x = event.clientX - box.left;
      y = event.clientY - box.top;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      layer.dataset.spot = "off";
    };
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} className={styles.heroFx} data-spot="off" aria-hidden="true">
      <span className={styles.beam} />
      <span className={styles.beam} />
      <span className={styles.beam} />
      <span className={styles.spotlight} />
    </div>
  );
}

const signals = [
  { id: "unverified_money_routing", tone: styles.sigWarn, note: "self-diagnostic" },
  { id: "suspect_identified", tone: styles.sigPink, note: "blame" },
  { id: "rolled_back", tone: styles.sigViolet, note: "incident" },
  { id: "poison_source", tone: styles.sigMagenta, note: "root message" },
  { id: "clean_replay", tone: styles.sigGreen, note: "verified" },
] as const;
const STEP_MS = 1100;
const HOLD_STEPS = 3;

/** Decorative example sequence; it is not connected to a live Raindrop event. */
export function SignalStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<number>(signals.length);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    const start = () => {
      if (timer !== undefined) return;
      setStep(0);
      timer = window.setInterval(() => setStep((s) => (s >= signals.length + HOLD_STEPS ? 0 : s + 1)), STEP_MS);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      setStep(signals.length);
    };
    const observer = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()), { threshold: 0.2 });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);
  return (
    <div ref={ref} className={styles.signalStrip} aria-hidden="true">
      <div className={styles.signalHead}>
        <span className={styles.liveDot} /> EXAMPLE SIGNAL FLOW <span>Raindrop · illustrative animation</span>
      </div>
      <ol className={styles.signalRow}>
        {signals.map((signal, index) => (
          <li key={signal.id} className={`${styles.signal} ${signal.tone}`} data-lit={index < step ? "on" : "off"}>
            <b>{signal.id}</b>
            <small>{signal.note}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

const EASE = [0.21, 0.6, 0.35, 1] as const;

/** Fade/slide-up once on scroll; MotionConfig drops the slide for users who prefer reduced motion. */
export function Reveal({ as = "div", delay = 0, className, children }: { as?: "div" | "article"; delay?: number; className?: string; children: ReactNode }) {
  const props = {
    className,
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" as const },
    transition: { duration: 0.6, delay, ease: EASE },
  };
  return (
    <MotionConfig reducedMotion="user">
      {as === "article" ? <motion.article {...props}>{children}</motion.article> : <motion.div {...props}>{children}</motion.div>}
    </MotionConfig>
  );
}
