import { startOfToday } from "date-fns";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, MapPin, Search, TrainFront } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DatePicker } from "@/components/ui/date-picker.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { isoDateOf } from "@/lib/dates.ts";
import type { StationOption } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

export interface SearchResult {
  trainNo: string;
  journeyDate: string;
  boardingStation: string | null;
}

export interface SearchFields {
  trainNo: string;
  journeyDate: string | null;
  boardingStation: string | null;
}

interface SearchScreenProps {
  /** Already filtered to boarding-enabled stops by the caller. Stable across renders. */
  boardingOptions?: readonly StationOption[];
  routeLoaded?: boolean;
  boardingLoading?: boolean;
  loading?: boolean;
  error?: string | null;
  searched?: boolean;
  onSearch: (result: SearchResult) => void | Promise<void>;
  onFieldsChange?: (fields: SearchFields) => void;
  className?: string;
}

interface FieldErrors {
  trainNo?: string;
  journeyDate?: string;
  boarding?: string;
}

function FieldError({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
      {children}
    </p>
  );
}

export function SearchScreen({
  boardingOptions = [],
  routeLoaded = false,
  boardingLoading = false,
  loading = false,
  error = null,
  searched = false,
  onSearch,
  onFieldsChange,
  className,
}: SearchScreenProps) {
  const [trainNo, setTrainNo] = useState("");
  const [journeyDate, setJourneyDate] = useState<Date | undefined>(() => startOfToday());
  const [boarding, setBoarding] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // `boardingOptions` arrives pre-filtered and memoised by the caller, so it is
  // safe to use directly as the effect dependency below.
  const hasRouteData = routeLoaded || boardingOptions.length > 0;
  const hasBoardingOptions = boardingOptions.length > 0;
  const hasValues = Boolean(trainNo || boarding);

  function notifyFields(
    nextTrainNo = trainNo,
    nextJourneyDate = journeyDate,
    nextBoarding = boarding,
  ) {
    onFieldsChange?.({
      trainNo: nextTrainNo,
      journeyDate: nextJourneyDate ? isoDateOf(nextJourneyDate) : null,
      boardingStation: nextBoarding || null,
    });
  }

  useEffect(() => {
    if (boarding && !boardingOptions.some((station) => station.code === boarding)) {
      setBoarding("");
      notifyFields(trainNo, journeyDate, "");
    }
  }, [boarding, journeyDate, trainNo, boardingOptions]);

  function validate(): SearchResult | null {
    const next: FieldErrors = {};
    if (!/^\d{4,5}$/.test(trainNo)) {
      next.trainNo = "Enter a valid 4–5 digit train number.";
    }
    if (!journeyDate) {
      next.journeyDate = "Choose a journey date from the calendar.";
    }
    if (hasBoardingOptions && !boarding) {
      next.boarding = "Select the boarding station.";
    }
    setErrors(next);
    if (next.trainNo || next.journeyDate || next.boarding) return null;
    return {
      trainNo,
      journeyDate: isoDateOf(journeyDate!),
      boardingStation: boarding || null,
    };
  }

  useEffect(() => {
    if (errors.trainNo && /^\d{4,5}$/.test(trainNo)) {
      setErrors((prev) => ({ ...prev, trainNo: undefined }));
    }
  }, [trainNo, errors.trainNo]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const result = validate();
    if (result) void onSearch(result);
  }

  function handleTrainNoInput(value: string) {
    const next = value.replace(/\D/g, "").slice(0, 5);
    setTrainNo(next);
    notifyFields(next, journeyDate, boarding);
  }

  function handleClear() {
    setTrainNo("");
    setJourneyDate(undefined);
    setBoarding("");
    setErrors({});
    onFieldsChange?.({ trainNo: "", journeyDate: null, boardingStation: null });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Find a journey</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Start with the train and journey date.
          </p>
        </div>
        {hasValues ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Clear
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="train-no">Train number</Label>
        <div className="relative">
          <TrainFront
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="train-no"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder="e.g. 12625"
            value={trainNo}
            onChange={(event) => handleTrainNoInput(event.target.value)}
            disabled={loading}
            aria-invalid={Boolean(errors.trainNo)}
            aria-describedby={errors.trainNo ? "train-no-error" : undefined}
            className="h-11 pl-9 font-mono text-base tracking-widest"
          />
        </div>
        {errors.trainNo ? (
          <div id="train-no-error">
            <FieldError>{errors.trainNo}</FieldError>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label id="journey-date-label" htmlFor="journey-date">Journey date</Label>
        <DatePicker
          id="journey-date"
          ariaLabelledBy="journey-date-label"
          value={journeyDate}
          onSelect={(date) => {
            setJourneyDate(date);
            setErrors((prev) => ({ ...prev, journeyDate: undefined }));
            notifyFields(trainNo, date, boarding);
          }}
          fromDate={startOfToday()}
          disabled={loading}
          className="h-11"
        />
        {errors.journeyDate ? <FieldError>{errors.journeyDate}</FieldError> : null}
      </div>

      <div className="space-y-1.5">
        <Label id="boarding-station-label" htmlFor="boarding-station">Boarding station</Label>
        <Select
          value={boarding || undefined}
          onValueChange={(value) => {
            setBoarding(value);
            setErrors((prev) => ({ ...prev, boarding: undefined }));
            notifyFields(trainNo, journeyDate, value);
          }}
          disabled={
            loading || (!boardingLoading && (!hasRouteData || !hasBoardingOptions))
          }
        >
          <SelectTrigger
            id="boarding-station"
            aria-labelledby="boarding-station-label"
            className="relative h-11 w-full pl-9"
          >
            <MapPin
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <SelectValue
              placeholder={
                  boardingLoading
                    ? "Loading route…"
                    : hasRouteData && hasBoardingOptions
                      ? "Select station"
                      : hasRouteData
                        ? "No boarding station"
                        : "Search train to load route"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {boardingOptions.map((station) => (
              <SelectItem key={station.code} value={station.code}>
                <span className="font-mono text-sm font-medium">{station.code}</span>
                <span className="text-muted-foreground"> · {station.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {boardingLoading ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading stations from the train route…
          </p>
        ) : !hasRouteData ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Search a train number and date first — boarding options come from
            the returned route.
          </p>
        ) : !hasBoardingOptions ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This route has no boarding-enabled station in the current data.
          </p>
        ) : null}
        {errors.boarding ? <FieldError>{errors.boarding}</FieldError> : null}
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-11 w-full"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {routeLoaded ? "Opening chart…" : "Loading route…"}
          </>
        ) : (
          <>
            <Search className="size-4" aria-hidden />
            {routeLoaded ? "Open chart" : "Search train"}
          </>
        )}
      </Button>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {searched && !loading && !error ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CircleCheck
            className="mt-0.5 size-4 shrink-0 text-signal-good"
            aria-hidden
          />
          Journey details are ready below.
        </p>
      ) : null}
    </form>
  );
}
