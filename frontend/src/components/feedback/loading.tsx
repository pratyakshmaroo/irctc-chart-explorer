import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils.ts";

interface LoadingProps {
  label?: string;
  className?: string;
}

export function Loading({ label = "Loading…", className }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-rail/10">
        <Loader2
          className="size-5 animate-spin text-rail"
          aria-hidden
        />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}