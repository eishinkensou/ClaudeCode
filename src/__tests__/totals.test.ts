import { describe, it, expect } from "vitest";
import { computeTotals } from "../totals";
import { takeoffToCsv } from "../export";
import type { Takeoff } from "../types";

const sample: Takeoff = {
  drawingType: "平面図",
  scale: "1/100",
  confidence: "medium",
  assumptions: "テスト",
  warnings: ["w1"],
  rooms: [
    {
      name: "事務所",
      floorAreaM2: 50,
      ceilingTakeoff: true,
      ceilingAreaM2: 50,
      ceilingHeightMm: 2700,
      ceilingBoards: [{ type: "PB9.5", areaM2: 50 }],
      wallLengthM: 30,
      wallFramingHeightMm: 4000,
      wallFramingAreaM2: 120,
      wallBoards: [{ type: "PB12.5", faces: 2, areaM2: 162 }],
      openings: [{ name: "SD-1", kind: "door", widthMm: 900, heightMm: 2000, count: 1, reinforceM: 4.9 }],
      openingReinforceM: 4.9,
      notes: "根拠",
    },
    {
      name: "会議室",
      floorAreaM2: 20,
      ceilingTakeoff: true,
      ceilingAreaM2: 20,
      ceilingHeightMm: 2700,
      ceilingBoards: [{ type: "PB9.5", areaM2: 20 }],
      wallLengthM: 18,
      wallFramingHeightMm: 4000,
      wallFramingAreaM2: 72,
      wallBoards: [{ type: "PB12.5", faces: 2, areaM2: 97.2 }],
      openings: [],
      openingReinforceM: 0,
      notes: "",
    },
  ],
};

describe("computeTotals", () => {
  it("sums framing and aggregates board types across rooms", () => {
    const t = computeTotals(sample);
    expect(t.ceilingFramingM2).toBeCloseTo(70, 2);
    expect(t.wallFramingM2).toBeCloseTo(192, 2);
    expect(t.openingReinforceM).toBeCloseTo(4.9, 2);
    expect(t.ceilingBoards.find((b) => b.type === "PB9.5")?.areaM2).toBeCloseTo(70, 2);
    expect(t.wallBoards.find((b) => b.type === "PB12.5")?.areaM2).toBeCloseTo(259.2, 2);
  });
});

describe("takeoffToCsv", () => {
  it("includes rooms, totals, and a BOM", () => {
    const csv = takeoffToCsv(sample);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain("事務所");
    expect(csv).toContain("■ 合計");
    expect(csv).toContain("PB12.5");
  });
});
