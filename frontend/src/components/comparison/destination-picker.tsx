import { Route } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { StationOption } from "@/lib/types.ts";

interface DestinationPickerProps {
  destinations?: readonly StationOption[];
  destination: string;
  disabled?: boolean;
  onDestinationChange: (value: string) => void;
}

export function DestinationPicker({
  destinations = [],
  destination,
  disabled,
  onDestinationChange,
}: DestinationPickerProps) {
  const hasDestinations = destinations.length > 0;

  return (
    <div className="space-y-1.5">
      <Label id="dest-station-label" htmlFor="dest-station">
        Destination
      </Label>
      <Select
        value={destination || undefined}
        onValueChange={onDestinationChange}
        disabled={disabled || !hasDestinations}
      >
        <SelectTrigger id="dest-station" aria-labelledby="dest-station-label" className="h-11 w-full">
          <SelectValue placeholder={hasDestinations ? "Choose a destination" : "Loads after search"} />
        </SelectTrigger>
        <SelectContent>
          {destinations.map((station) => (
            <SelectItem key={station.code} value={station.code}>
              <span className="font-mono text-sm font-medium">{station.code}</span>
              <span className="text-muted-foreground"> · {station.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hasDestinations && !disabled ? (
        <p className="text-xs text-muted-foreground">
          Destination options appear once a forward segment is selected.
        </p>
      ) : null}
    </div>
  );
}

export function ComparisonEmpty({ destination }: { destination: string }) {
  return (
    <EmptyState
      icon={Route}
      title={destination ? "No confirmed boarding results" : "Choose a destination"}
      description={
        destination
          ? "The backend returned no usable comparison for this class and destination."
          : "Choose a destination to see confirmed available berths from earlier valid boarding stations."
      }
    />
  );
}
