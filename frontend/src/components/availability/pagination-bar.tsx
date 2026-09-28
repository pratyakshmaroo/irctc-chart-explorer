import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationBarProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= safeTotalPages;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between gap-2",
        className,
      )}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(safePage - 1)}
        disabled={prevDisabled}
      >
        <ChevronLeft className="size-4" aria-hidden />
        <span className="hidden sm:inline">Previous</span>
      </Button>
      <p className="text-sm tabular-nums text-muted-foreground">
        Page{" "}
        <span className="font-semibold text-foreground">{safePage}</span> of{" "}
        <span className="font-semibold text-foreground">{safeTotalPages}</span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(safePage + 1)}
        disabled={nextDisabled}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  );
}