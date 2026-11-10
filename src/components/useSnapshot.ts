"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/state";

export interface Toast {
  id: number;
  tone: "error" | "ok";
  text: string;
}

/** Polls /api/state (paused while the tab is hidden) and exposes a `call` helper for mutations. */
export function useSnapshot(intervalMs = 1500) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j as Snapshot);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, intervalMs);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const first = setTimeout(() => void refresh(), 0);
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  /** POSTs to an API route; `label` identifies the in-flight action so buttons can show pending state. */
  const call = useCallback(
    async <T,>(label: string, path: string, body?: unknown): Promise<T | null> => {
      setPending(label);
      try {
        const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!r.ok || (j && typeof j === "object" && "error" in j)) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
        return j as T;
      } catch (e) {
        toast("error", e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setPending(null);
        await refresh();
      }
    },
    [refresh, toast],
  );

  return { data, error, pending, call, toast, toasts, refresh };
}
