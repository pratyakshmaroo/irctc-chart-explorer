import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { PageSize } from "@/lib/types.ts";
import { PAGE_SIZE_OPTIONS } from "@/lib/types.ts";

interface RowsPerPageSelectProps {
  value: PageSize;
  onChange: (value: PageSize) => void;
  disabled?: boolean;
}

function parsePageSize(raw: string): PageSize {
  if (raw === "All") return "All";
  const numeric = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(numeric)
    ? (numeric as PageSize)
    : 10;
}

export function RowsPerPageSelect({
  value,
  onChange,
  disabled,
}: RowsPerPageSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Rows</span>
      <Select
        value={String(value)}
        onValueChange={(raw) => onChange(parsePageSize(raw))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[4.75rem] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={String(size)} value={String(size)}>
              {String(size)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}