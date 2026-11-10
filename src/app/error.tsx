"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md space-y-3 rounded-xl border border-danger/40 bg-panel p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold text-danger">
          <AlertTriangle className="size-4" /> The dashboard hit an error
        </div>
        <p className="text-muted">{error.message || "Unexpected error"}</p>
        {error.digest && <code className="block text-[11px] text-muted">digest {error.digest}</code>}
        <button onClick={() => retry()} className="h-7 rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90">
          Try again
        </button>
      </div>
    </div>
  );
}
