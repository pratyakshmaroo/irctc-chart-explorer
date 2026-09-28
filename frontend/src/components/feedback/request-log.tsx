import { useState, useSyncExternalStore } from "react";
import { Activity } from "lucide-react";

import { getRequestLog, subscribeRequestLog } from "@/lib/chart/client.ts";
import { cn } from "@/lib/utils.ts";

function formatEntry(entry: { label: string; status: string; ms: number | null; detail: string | null }): string {
  const ms = entry.ms === null ? "…" : `${entry.ms}ms`;
  const extra = entry.detail ? ` — ${entry.detail}` : "";
  return `[${entry.status}] ${entry.label} (${ms})${extra}`;
}

/**
 * In-page diagnostics: every IRCTC call this browser made, live. Passengers
 * paste this back when reporting "it hangs" instead of opening DevTools.
 */
export function RequestLog() {
  const entries = useSyncExternalStore(subscribeRequestLog, getRequestLog);
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const text = entries.map(formatEntry).join("\n") || "(no requests yet)";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const pending = entries.filter((e) => e.status === "pending").length;

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-muted-foreground">
        <Activity className="size-3.5" aria-hidden />
        Live request log
        <span className="tabular-nums">
          ({entries.length} calls{pending > 0 ? `, ${pending} running` : ""})
        </span>
        <span className="ml-auto text-[11px] font-medium underline underline-offset-2">
          tap to {entries.length > 0 ? "hide" : "expand"}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No IRCTC calls yet. Search a train and each call appears here with its timing.
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  entry.status === "pending" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                  entry.status === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  entry.status === "error" && "bg-red-500/10 text-red-700 dark:text-red-300",
                )}
              >
                {formatEntry(entry)}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          {copied ? "Copied!" : "Copy log"}
        </button>
      </div>
    </details>
  );
}
