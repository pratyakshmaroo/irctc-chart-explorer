import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils.ts";

interface SectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  step?: number;
  className?: string;
  children: ReactNode;
}

export function Section({
  title,
  description,
  icon: Icon,
  step,
  className,
  children,
}: SectionProps) {
  return (
    <section className={cn("space-y-3 sm:space-y-4", className)}>
      <header className="space-y-1">
        <div className="flex items-center gap-2.5">
          {step !== undefined ? (
            <span className="step-chip" aria-hidden>
              {step}
            </span>
          ) : null}
          {Icon ? (
            <Icon
              className="size-4 shrink-0 text-rail"
              aria-hidden
            />
          ) : null}
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h2>
        </div>
        {description ? (
          <p className="pl-0 text-sm leading-relaxed text-muted-foreground sm:pl-9">
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}