import { useRef, useState } from "react";
import { CheckCircle2, PlugZap, XCircle } from "lucide-react";

import { Loading } from "@/components/feedback/loading.tsx";
import { IrctcApiError } from "@/lib/chart/client.ts";
import { loggedRequest } from "@/lib/chart/client.ts";
import {
  fetchCoachComposition,
  fetchSchedule,
  fetchTrainComposition,
} from "@/lib/chart/client.ts";
import { cn } from "@/lib/utils.ts";

interface TestStep {
  label: string;
  status: "pending" | "ok" | "error";
  detail: string;
}

// Fixed values from a verified-good call: these exact params returned real
// JSON from a home network, so they isolate "can this browser reach IRCTC"
// from "did I type a valid search".
const TRAIN_NO = "22637";
const J_DATE = "2026-09-24";
const BOARDING = "MAS";

function plainError(error: unknown): string {
  if (error instanceof IrctcApiError) {
    switch (error.kind) {
      case "blocked":
        return "IRCTC is blocking this network right now. Try phone hotspot.";
      case "rate-limit":
        return "IRCTC rate-limited us. Wait a minute and retry.";
      case "network":
        return "Could not reach IRCTC. Check internet, then retry.";
      case "chart":
        return `IRCTC answered but with an error: ${error.message}`;
      default:
        return `IRCTC error: ${error.message}`;
    }
  }
  if (error instanceof Error && error.name === "AbortError") return "Cancelled.";
  return error instanceof Error ? error.message : "Unknown error.";
}

/**
 * One-tap connection test on the start screen. No search, no To/class
 * picking — it answers "does IRCTC answer this browser?" in 3 lines.
 */
export function ConnectionTest() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [copied, setCopied] = useState(false);
  const runRef = useRef(0);

  function setStep(index: number, patch: Partial<TestStep>): void {
    setSteps((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function run(): Promise<void> {
    const runId = ++runRef.current;
    setPhase("running");
    setCopied(false);
    setSteps([
      { label: `1. Route of train ${TRAIN_NO}`, status: "pending", detail: "asking…" },
      { label: "2. Chart (coaches)", status: "pending", detail: "waiting…" },
      { label: "3. One coach layout", status: "pending", detail: "waiting…" },
    ]);

    try {
      const sched = await loggedRequest(`selftest schedule ${TRAIN_NO}`, () =>
        fetchSchedule(TRAIN_NO),
      );
      if (runRef.current !== runId) return;
      if (sched.errorMessage) throw new IrctcApiError(`schedule: ${sched.errorMessage}`, "chart");
      const count = sched.stationList?.length ?? 0;
      setStep(0, { status: "ok", detail: `${count} stations` });

      const comp = await loggedRequest(`selftest trainComposition ${TRAIN_NO}`, () =>
        fetchTrainComposition(TRAIN_NO, J_DATE, BOARDING),
      );
      if (runRef.current !== runId) return;
      if (comp.error != null && comp.error !== false && comp.error !== "") {
        throw new IrctcApiError(`trainComposition: ${String(comp.error)}`, "chart");
      }
      const coaches = comp.cdd ?? [];
      setStep(1, { status: "ok", detail: `${coaches.length} coaches` });

      const first = coaches[0];
      if (!first || !comp.remote || !comp.from || !comp.trainStartDate) {
        throw new IrctcApiError("chart data incomplete (remote/from/date missing)", "chart");
      }
      const coach = await loggedRequest(`selftest coach ${first.coachName}`, () =>
        fetchCoachComposition({
          trainNo: TRAIN_NO,
          boardingStation: BOARDING,
          remoteStation: comp.remote,
          trainSourceStation: comp.from,
          jDate: comp.trainStartDate,
          coach: first.coachName,
          cls: first.classCode,
        }),
      );
      if (runRef.current !== runId) return;
      if (coach.error != null && coach.error !== false && coach.error !== "") {
        throw new IrctcApiError(`coachComposition: ${String(coach.error)}`, "chart");
      }
      setStep(2, {
        status: "ok",
        detail: `${coach.bdd?.length ?? 0} berths in ${first.coachName}`,
      });
    } catch (error) {
      if (runRef.current !== runId) return;
      const message = plainError(error);
      setSteps((current) => {
        const firstPending = current.findIndex((s) => s.status === "pending");
        if (firstPending < 0) return current;
        return current.map((s, i) => (i === firstPending ? { ...s, status: "error", detail: message } : s));
      });
    } finally {
      if (runRef.current === runId) setPhase("done");
    }
  }

  async function copy(): Promise<void> {
    const text =
      steps.map((s) => `[${s.status}] ${s.label} — ${s.detail}`).join("\n") || "(not run)";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const failed = steps.some((s) => s.status === "error");

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <PlugZap className="size-4 text-rail" aria-hidden />
          <p className="text-sm font-bold">Is IRCTC answering you?</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={phase === "running"}
          className="rounded-lg bg-rail px-3 py-1.5 text-xs font-bold text-rail-foreground disabled:opacity-50"
        >
          {phase === "running" ? "Testing…" : steps.length > 0 ? "Test again" : "Test connection"}
        </button>
        {steps.length > 0 && phase === "done" ? (
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            {copied ? "Copied!" : "Copy result"}
          </button>
        ) : null}
      </div>

      {phase === "running" && steps.every((s) => s.status === "pending") ? (
        <div className="pt-2">
          <Loading label="Asking IRCTC…" className="py-4" />
        </div>
      ) : null}

      {steps.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {steps.map((step) => (
            <li
              key={step.label}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed",
                step.status === "pending" && "bg-muted text-muted-foreground",
                step.status === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                step.status === "error" && "bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              {step.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : step.status === "error" ? (
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <span className="mt-0.5 size-4 shrink-0 animate-pulse rounded-full bg-current opacity-40" aria-hidden />
              )}
              <span>
                <span className="font-bold">{step.label}:</span> {step.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          One tap checks your network against IRCTC with known-good values. If this is green but
          your search hangs, the problem is the search itself, not your connection.
        </p>
      )}

      {phase === "done" && failed ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Paste the result above back in chat and the fix becomes obvious.
        </p>
      ) : null}
    </div>
  );
}
