import { cn } from "@/lib/utils.ts";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export function SegmentControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  className,
}: SegmentControlProps<T>) {
  return (
    <div
      role="group"
      aria-label="Segment control"
      className={cn(
        "inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}