import { IrctcApiError } from "./irctc/client.ts";

export interface RouteIndex {
  readonly codes: readonly string[];
  readonly codeToIndices: ReadonlyMap<string, readonly number[]>;
  readonly duplicateCodes: readonly string[];
  readonly legCount: number;
}

export function buildRouteIndex(codes: string[]): RouteIndex {
  const codeToIndices = new Map<string, number[]>();
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    const list = codeToIndices.get(code) ?? [];
    list.push(i);
    codeToIndices.set(code, list);
  }
  const duplicateCodes = [...codeToIndices.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([code]) => code);
  return {
    codes,
    codeToIndices,
    duplicateCodes,
    legCount: Math.max(0, codes.length - 1),
  };
}

export function resolveUnique(route: RouteIndex, code: string, role: string): number {
  const indexes = route.codeToIndices.get(code);
  if (!indexes || indexes.length === 0) {
    throw new IrctcApiError(
      `${role} station ${code} is not on this train's route`,
      "usage",
    );
  }
  if (indexes.length > 1) {
    throw new IrctcApiError(
      `${role} station ${code} occurs ${indexes.length} times on this route; use an unambiguous station`,
      "usage",
    );
  }
  return indexes[0]!;
}

export function validateOrder(fromIdx: number, toIdx: number, fromCode: string, toCode: string): void {
  if (fromIdx === toIdx) {
    throw new IrctcApiError("From and To cannot be the same station", "usage");
  }
  if (fromIdx > toIdx) {
    throw new IrctcApiError(
      `from station ${fromCode} must precede to station ${toCode} along the route`,
      "usage",
    );
  }
}