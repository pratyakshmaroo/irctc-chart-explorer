import { ArrowRight, CircleAlert } from "lucide-react";

import { Label } from "@/components/ui/label.tsx";
import { SegmentControl } from "@/components/ui/segment-control.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { selectBoardingStations, selectDestinations, stationIndex } from "@/lib/adapters.ts";
import type { StationOption } from "@/lib/types.ts";

interface AvailabilitySearchProps {
  stations?: readonly StationOption[];
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  classes?: readonly string[];
  classCode: string;
  onClassChange: (value: string) => void;
  disabled?: boolean;
}

/** One station dropdown. Both ends of the segment use this, only the options differ. */
function StationSelect({
  id,
  label,
  placeholder,
  value,
  route,
  options,
  disabled,
  onValueChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  /** The full route, used to number stops consistently with the timeline. */
  route: readonly StationOption[];
  options: readonly StationOption[];
  disabled: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} className="min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((station) => (
            <SelectItem key={station.code} value={station.code}>
              <span className="font-mono text-sm font-medium">{station.code}</span>
              <span className="text-muted-foreground">
                {" "}· Stop {stationIndex(route, station.code) + 1} · {station.name}
              </span>
              {station.boardingDisabled ? (
                <span className="text-muted-foreground"> · destination only</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AvailabilitySearch({
  stations = [],
  from,
  onFromChange,
  to,
  onToChange,
  classes = [],
  classCode,
  onClassChange,
  disabled,
}: AvailabilitySearchProps) {
  const hasRoute = stations.length > 1;
  const hasClasses = classes.length > 0;
  const stationDisabled = disabled || !hasRoute;
  const fromIdx = stationIndex(stations, from);
  const toIdx = stationIndex(stations, to);
  const fromStation = fromIdx >= 0 ? stations[fromIdx] : undefined;
  const toStation = toIdx >= 0 ? stations[toIdx] : undefined;
  const invalidForwardSegment = Boolean((from || to) && !(fromStation && toStation && toIdx > fromIdx));
  const fromOptions = selectBoardingStations(stations);
  const toOptions = selectDestinations(stations, from);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Forward segment</p>
          <p className="text-xs text-muted-foreground">
            Availability is checked across every route leg between these stops.
          </p>
        </div>
        {fromStation && toStation ? (
          <span className="rounded-full bg-rail/10 px-2.5 py-1 text-[11px] font-semibold text-rail">
            Stops {fromIdx + 1}–{toIdx + 1}
          </span>
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <StationSelect
          id="from-station"
          label="From"
          placeholder="Origin"
          value={from}
          route={stations}
          options={fromOptions}
          disabled={stationDisabled}
          onValueChange={onFromChange}
        />
        <div
          className="mb-0.5 flex size-9 shrink-0 items-center justify-center text-muted-foreground"
          aria-label="Forward journey direction"
        >
          <ArrowRight className="size-4" aria-hidden />
        </div>
        <StationSelect
          id="to-station"
          label="To"
          placeholder="Destination"
          value={to}
          route={stations}
          options={toOptions}
          disabled={stationDisabled}
          onValueChange={onToChange}
        />
      </div>

      {!hasRoute && !disabled ? (
        <p className="text-xs text-muted-foreground">
          Segment options appear once the train's route loads.
        </p>
      ) : null}
      {invalidForwardSegment ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Choose a destination after the origin. Availability is only valid for a forward route segment.</span>
        </div>
      ) : fromStation && toStation ? (
        <div className="rounded-xl border border-signal-good/25 bg-signal-good/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-signal-good">
              Confirmed availability window
            </p>
            <p className="font-mono text-sm font-bold text-signal-good">
              {fromStation.code} <ArrowRight className="inline size-3.5 align-[-2px]" aria-hidden /> {toStation.code}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground">
            A berth must stay free across every leg from {fromStation.name} to {toStation.name}. Each result shows the actual free window, which may extend beyond this selection.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Class</Label>
        {hasClasses ? (
          <SegmentControl
            options={classes.map((cls) => ({ value: cls, label: cls }))}
            value={classCode}
            onValueChange={onClassChange}
            disabled={disabled}
            className="min-h-10"
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Classes appear after a train is searched.
          </p>
        )}
      </div>
    </div>
  );
}