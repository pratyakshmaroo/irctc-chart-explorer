import { TrainFront } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";

export function AppHeader() {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rail text-rail-foreground shadow-sm">
          <TrainFront className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-xl">
            IRCTC Chart Explorer
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Seat availability across boarding stations
          </p>
        </div>
      </div>
      <Badge
        variant="secondary"
        className="hidden shrink-0 items-center gap-1.5 font-medium sm:inline-flex"
      >
        <span className="size-1.5 rotate-45 rounded-sm bg-signal-good" aria-hidden />
        On-demand data
      </Badge>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal-good" aria-hidden />
      <p>
        Chart data is requested only when you search or change a selection;
        confirmed availability remains the source of truth.
      </p>
    </footer>
  );
}
