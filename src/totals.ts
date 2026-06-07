import type { Takeoff } from "./types";

export interface TypedTotal {
  type: string;
  areaM2: number;
}

export interface Totals {
  ceilingFramingM2: number;
  wallFramingM2: number;
  openingReinforceM: number;
  ceilingBoards: TypedTotal[];
  wallBoards: TypedTotal[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function add(map: Map<string, number>, type: string, area: number) {
  map.set(type, (map.get(type) ?? 0) + area);
}
const toList = (m: Map<string, number>): TypedTotal[] =>
  [...m.entries()].map(([type, areaM2]) => ({ type, areaM2: round2(areaM2) }));

export function computeTotals(t: Takeoff): Totals {
  let ceilingFramingM2 = 0;
  let wallFramingM2 = 0;
  let openingReinforceM = 0;
  const cb = new Map<string, number>();
  const wb = new Map<string, number>();

  for (const r of t.rooms) {
    ceilingFramingM2 += r.ceilingAreaM2 || 0;
    wallFramingM2 += r.wallFramingAreaM2 || 0;
    openingReinforceM += r.openingReinforceM || 0;
    for (const b of r.ceilingBoards) add(cb, b.type, b.areaM2 || 0);
    for (const b of r.wallBoards) add(wb, b.type, b.areaM2 || 0);
  }

  return {
    ceilingFramingM2: round2(ceilingFramingM2),
    wallFramingM2: round2(wallFramingM2),
    openingReinforceM: round2(openingReinforceM),
    ceilingBoards: toList(cb),
    wallBoards: toList(wb),
  };
}
