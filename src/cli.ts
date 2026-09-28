#!/usr/bin/env node

import {
  chartPrepared,
  classesOf,
  coachesOfClass,
  defaultClass,
  getClassVacancy,
  getCoachComposition,
  getJourney,
} from "./irctc/index.ts";
import { IrctcApiError } from "./irctc/client.ts";
import { compareBoardingStations, getAvailableBerths, loadClassCompositions } from "./query.ts";
import type { ClassAvailability, CrossBoardingResult, Journey } from "./types.ts";

interface Options {
  trainNo: string;
  displayDate: string;
  isoDate: string;
  boarding: string;
  cls?: string;
  chartType: number;
  coach?: string;
  from?: string;
  to?: string;
  dest?: string;
  boardings?: string[];
}

function usage(): void {
  console.log("usage: npm run chart -- <trainNo> <DD-MM-YYYY|YYYY-MM-DD> <boardingStationCode> [options]");
  console.log("options:");
  console.log("  --class <CLS>        class code to analyse (default: class with most reported vacancy)");
  console.log("  --charttype 1|2      chart to query (default: 1)");
  console.log("  --coach <COACH>      specific coach for the coach-composition summary");
  console.log("  --from <CODE> --to <CODE>   route-segment availability for the chosen class");
  console.log("  --dest <CODE> --boardings C1,C2,..   cross-boarding-station comparison to dest");
  console.log("example: npm run chart -- 22637 24-09-2026 MAS --class 2A --from TUP --to CBE");
}

const FORMATS = [
  /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-mm-dd
  /^(\d{2})[-/](\d{2})[-/](\d{4})$/, // dd/mm/yyyy or dd-mm-yyyy
];

function parseDate(raw: string): string | null {
  for (const [index, pattern] of FORMATS.entries()) {
    const match = raw.match(pattern);
    if (!match) continue;
    // Branch on the format that actually matched, never on the shape of the raw
    // string: a yyyy-mm-dd date also starts with two digits, so testing the
    // string misroutes every ISO input into the dd-mm-yyyy branch and rejects it.
    const yyyy = index === 0 ? match[1]! : match[3]!;
    const mm = match[2]!;
    const dd = index === 0 ? match[3]! : match[1]!;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function parseArgs(argv: string[]): Options | { error: string } {
  const positional: string[] = [];
  let cls: string | undefined;
  let chartType = 1;
  let coach: string | undefined;
  let from: string | undefined;
  let to: string | undefined;
  let dest: string | undefined;
  let boardings: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--class") {
      cls = argv[++i]?.toUpperCase();
    } else if (arg === "--charttype") {
      const v = argv[++i];
      if (v !== "1" && v !== "2") return { error: "--charttype must be 1 or 2" };
      chartType = Number(v);
    } else if (arg === "--coach") {
      coach = argv[++i]?.toUpperCase();
    } else if (arg === "--from") {
      from = argv[++i]?.toUpperCase();
    } else if (arg === "--to") {
      to = argv[++i]?.toUpperCase();
    } else if (arg === "--dest") {
      dest = argv[++i]?.toUpperCase();
    } else if (arg === "--boardings") {
      const raw = argv[++i];
      if (!raw) return { error: "--boardings requires at least one station code" };
      boardings = raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
    } else if (arg.startsWith("-")) {
      return { error: `unknown option ${arg}` };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 3) {
    return { error: "train number, journey date and boarding station are required" };
  }
  const [trainNo, dateRaw, boarding] = positional;
  if (!/^\d{4,5}$/.test(trainNo!)) return { error: `invalid train number "${trainNo}"` };
  const isoDate = parseDate(dateRaw!);
  if (!isoDate) return { error: `invalid journey date "${dateRaw}" (use DD-MM-YYYY or YYYY-MM-DD)` };
  const boardingCode = boarding!.toUpperCase().replace(/\s/g, "");
  if (!boardingCode) return { error: "boarding station code required" };

  if ((from && !to) || (!from && to)) return { error: "--from and --to must be used together" };
  if ((dest && !boardings) || (!dest && boardings)) return { error: "--dest and --boardings must be used together" };
  if (from && dest) return { error: "choose either --from/--to or --dest/--boardings, not both" };
  if (boardings && boardings.length === 0) return { error: "--boardings requires at least one station code" };

  return { trainNo: trainNo!, displayDate: displayDate(isoDate), isoDate, boarding: boardingCode, cls, chartType, coach, from, to, dest, boardings };
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

function printStations(journey: Journey): void {
  for (let i = 0; i < journey.stations.length; i++) {
    const s = journey.stations[i]!;
    const flag = s.boardingDisabled ? " [boarding disabled]" : "";
    console.log(
      `${String(i + 1).padStart(2)}. ${s.code.padEnd(5)} ${s.name}  arr=${s.arrivalTime ?? "--"} dep=${s.departureTime ?? "--"} day=${s.dayCount ?? "?"}${flag}`,
    );
  }
}

function printChart(journey: Journey): void {
  const c = journey.chart;
  console.log(`trainStartDate      : ${c.trainStartDate ?? "-"}`);
  console.log(`chartOneDate (1st)  : ${c.chartOneDate ?? "-"}`);
  console.log(`chartTwoDate (2nd)  : ${c.chartTwoDate ?? "-"}`);
  console.log(`remoteLocationChart : ${c.remoteLocationChartDate ?? "-"}`);
  console.log(`destinationStation  : ${c.destinationStation ?? "-"}`);
  console.log(`chart prepared      : ${chartPrepared(journey) ? "yes" : "no"}`);
}

function printCoaches(journey: Journey): void {
  const perClass = new Map<string, { coaches: number; vacant: number }>();
  for (const coach of journey.coaches) {
    const entry = perClass.get(coach.classCode) ?? { coaches: 0, vacant: 0 };
    entry.coaches += 1;
    entry.vacant += coach.vacantBerths ?? 0;
    perClass.set(coach.classCode, entry);
  }
  for (const cls of classesOf(journey)) {
    console.log(`class ${cls} : ${perClass.get(cls)?.coaches} coach(es), vacant berths reported = ${perClass.get(cls)?.vacant}`);
  }
  console.log("coach breakdown:");
  for (const coach of journey.coaches) {
    console.log(`  ${coach.name.padEnd(4)} ${coach.classCode.padEnd(3)} pos=${coach.positionFromEngine ?? "?"} vacant=${coach.vacantBerths ?? "?"}`);
  }
}

function printVacancy(vac: Awaited<ReturnType<typeof getClassVacancy>>): void {
  console.log(`class ${vac.cls}, chartType ${vac.chartType}: ${vac.rows.length} vacant berth row(s)`);
  for (const row of vac.rows) {
    console.log(`  ${row.coachName.padEnd(4)} ${String(row.berthCode).padEnd(2)} berth ${String(row.berthNumber).padStart(3)} free ${row.from} -> ${row.to} (split ${row.splitNo ?? "?"})`);
  }
}

function printCoachComposition(comp: Awaited<ReturnType<typeof getCoachComposition>>): void {
  const disabled = comp.berths.filter((b) => b.enabled === false).length;
  const withSegments = comp.berths.filter((b) => b.segments.length > 0).length;
  console.log(`coach ${comp.coachName} (${comp.cls}): ${comp.berths.length} berth(s), ${disabled} disabled, ${withSegments} with booking segments`);
  for (const berth of comp.berths) {
    const flag = berth.enabled === false ? " [disabled]" : "";
    const segs = berth.segments
      .map((s) => `s${s.splitNo ?? "?"}:${s.from}->${s.to}:${s.quota ?? "?"}:occ=${s.occupancy}`)
      .join(" | ");
    console.log(`  ${String(berth.berthNo).padStart(3)} ${String(berth.berthCode).padEnd(3)} ${berth.from}->${berth.to}${flag}  ->  ${segs || "(no segments)"}`);
  }
}

function printAvailability(result: ClassAvailability): void {
  console.log(`class ${result.classCode} ${result.fromStation} -> ${result.toStation}: ${result.availableCount}/${result.totalBerths} berths available`);
  for (const coach of result.coaches) {
    if (coach.availableCount === 0) continue;
    console.log(`  ${coach.coachKey.padEnd(8)} ${coach.availableCount}/${coach.totalBerths} available`);
  }
  const rows = result.coaches.flatMap((c) =>
    c.result
      .filter((r) => r.available)
      .map((r) => `${r.coachName} ${String(r.berthNo).padStart(2)}${r.berthCode} window ${r.availabilityWindow?.from}->${r.availabilityWindow?.to}`),
  );
  for (const line of rows) console.log(`  AVL ${line}`);
}

function printCross(results: CrossBoardingResult[]): void {
  const sorted = [...results].sort((a, b) => b.availableCount - a.availableCount);
  for (const r of sorted) {
    console.log(`boarding ${r.fromStation} -> ${r.toStation}: ${r.availableCount}/${r.totalBerthsEvaluated} available across ${r.coachesCovered} coach(es)`);
    const sample = r.availableBerths.slice(0, 10).map((b) => `${b.coachName} ${b.berthNo}${b.berthCode} window ${b.availabilityWindow?.from}->${b.availabilityWindow?.to}`);
    for (const line of sample) console.log(`  AVL ${line}`);
    if (r.availableBerths.length > 10) console.log(`  ... and ${r.availableBerths.length - 10} more`);
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.log(`error: ${parsed.error}`);
    usage();
    return 2;
  }

  try {
    const journey = await getJourney({
      trainNo: parsed.trainNo,
      journeyDate: parsed.isoDate,
      boardingStation: parsed.boarding,
    });

    console.log(`=== IRCTC CHART EXPLORER — LIVE DATA ===`);
    section("TRAIN");
    console.log(`${journey.trainNo} ${journey.trainName ?? ""}  (${journey.from ?? "?"} -> ${journey.to ?? "?"})`);
    console.log(`journey date: ${parsed.displayDate} (${parsed.isoDate})  boarding: ${journey.boardingStation}`);
    console.log(`stations on route: ${journey.stations.length}`);

    section("ORDERED STATIONS");
    printStations(journey);

    section("CHART");
    printChart(journey);

    section("COACHES / CLASSES");
    printCoaches(journey);

    const cls = parsed.cls ?? defaultClass(journey);
    if (!cls) {
      console.log("\nwarning: no class found for this train/journey.");
      return 0;
    }
    console.log(`\n(vacancy + coach detail fetched for class ${cls}, chartType ${parsed.chartType})`);

    if (parsed.from && parsed.to) {
      section(`AVAILABILITY — class ${cls}, ${parsed.from} -> ${parsed.to}`);
      const compositions = await loadClassCompositions(journey, cls);
      const result = await getAvailableBerths({
        journey,
        fromStation: parsed.from,
        toStation: parsed.to,
        classCode: cls,
        compositions,
      });
      printAvailability(result);
      return 0;
    }

    if (parsed.dest && parsed.boardings) {
      section(`CROSS-BOARDING — class ${cls}, destinations ${parsed.dest}`);
      const compositions = await loadClassCompositions(journey, cls);
      const results = await compareBoardingStations({
        journey,
        destination: parsed.dest,
        classCode: cls,
        boardingStations: parsed.boardings,
        compositions,
      });
      printCross(results);
      return 0;
    }

    section(`VACANT BERTHS — class ${cls}`);
    const vac = await getClassVacancy(journey, cls, parsed.chartType);
    printVacancy(vac);

    const coach = parsed.coach ?? coachesOfClass(journey, cls)[0]?.name;
    if (coach && coachesOfClass(journey, cls).some((c) => c.name === coach)) {
      section(`COACH COMPOSITION — ${coach} (${cls})`);
      const comp = await getCoachComposition(journey, coach, cls);
      printCoachComposition(comp);
    } else {
      console.log(`\nnote: no coach named ${coach ?? "(none)"} in class ${cls}; berth/booking segments skipped.`);
    }

    return 0;
  } catch (error) {
    if (error instanceof IrctcApiError) {
      console.log(`\nIRCTC ERROR [${error.kind}]${error.status ? ` (HTTP ${error.status})` : ""}: ${error.message}`);
    } else {
      console.log(`\nUNEXPECTED ERROR: ${(error as Error).message}`);
    }
    return 1;
  }
}

process.exitCode = await main();