import { describe, it, expect } from "vitest";
import {
  takeoffRoom,
  takeoffAll,
  ceilingAreaM2,
  wallLengthM,
  wallHeightsMm,
  openingReinforcePerUnit,
} from "../estimate";
import { DEFAULT_SETTINGS } from "../estimate/defaults";
import type { AppSettings, Room, Scale, Wall } from "../types";

// 縮尺: 1pt = 50mm（テスト用の単純設定）
const scale: Scale = { realMmPerPt: 50, label: "test", source: "default" };

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  defaultSlabHeightMm: 3000, // 3m
  defaultCeilingHeightMm: 2500, // 2.5m
  deductOpenings: true,
  boardTypes: [
    { id: "pb95", name: "PB9.5" },
    { id: "pb125", name: "PB12.5" },
    { id: "rw12", name: "岩綿12" },
  ],
};

// 100pt×80pt → 実寸 5000mm×4000mm = 20m²
const polygon = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 80 },
  { x: 0, y: 80 },
];

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    id: "r1",
    name: "事務所",
    page: 1,
    polygon,
    ceilingBoards: [],
    includeCeiling: true,
    walls: [],
    openings: [],
    source: "manual",
    confidence: 1,
    ...over,
  };
}

function wall(over: Partial<Wall> = {}): Wall {
  return {
    id: "w1",
    name: "W1",
    lengthMmManual: 10000, // 10m
    framingReach: "slab",
    boardReach: "ceiling",
    boards: [],
    includeFraming: true,
    ...over,
  };
}

describe("ceilingAreaM2 / wallLengthM", () => {
  it("converts polygon area pt² → m² via scale", () => {
    expect(ceilingAreaM2(baseRoom(), scale)).toBeCloseTo(20, 3);
  });
  it("falls back to manual area when no polygon", () => {
    expect(ceilingAreaM2(baseRoom({ polygon: [], ceilingAreaM2Manual: 12.5 }), scale)).toBe(12.5);
  });
  it("computes wall length from drawn segment", () => {
    const w = wall({ segment: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, lengthMmManual: undefined });
    expect(wallLengthM(w, scale)).toBeCloseTo(5, 3); // 100pt × 50mm = 5m
  });
  it("computes wall length from manual mm", () => {
    expect(wallLengthM(wall({ lengthMmManual: 8000 }), scale)).toBe(8);
  });
});

describe("wallHeightsMm", () => {
  const room = baseRoom();
  it("framing slab / board ceiling use room (or default) heights", () => {
    const h = wallHeightsMm(wall(), room, settings);
    expect(h.framingHeightMm).toBe(3000); // slab
    expect(h.boardHeightMm).toBe(2500); // ceiling
  });
  it("framing ceiling / board slab swaps the reaches", () => {
    const h = wallHeightsMm(wall({ framingReach: "ceiling", boardReach: "slab" }), room, settings);
    expect(h.framingHeightMm).toBe(2500);
    expect(h.boardHeightMm).toBe(3000);
  });
  it("room-level slab/ceiling heights override defaults", () => {
    const h = wallHeightsMm(wall(), baseRoom({ slabHeightMm: 4200, ceilingHeightMm: 2800 }), settings);
    expect(h.framingHeightMm).toBe(4200);
    expect(h.boardHeightMm).toBe(2800);
  });
  it("explicit per-wall heights take priority", () => {
    const h = wallHeightsMm(wall({ framingHeightMm: 2800, boardHeightMm: 2400 }), room, settings);
    expect(h.framingHeightMm).toBe(2800);
    expect(h.boardHeightMm).toBe(2400);
  });
});

describe("openingReinforcePerUnit", () => {
  it("door = 2H + W (example: H3, W0.9 → 6.9)", () => {
    expect(openingReinforcePerUnit("door", 0.9, 3).perUnitM).toBeCloseTo(6.9, 6);
  });
  it("window = 2H + 2W", () => {
    expect(openingReinforcePerUnit("window", 1.5, 1.2).perUnitM).toBeCloseTo(2 * 1.2 + 2 * 1.5, 6);
  });
});

describe("takeoffRoom — ceiling", () => {
  it("aggregates ceiling board area per type (重ね貼り)", () => {
    const t = takeoffRoom(
      baseRoom({ ceilingBoards: [{ boardTypeId: "rw12" }, { boardTypeId: "pb95" }] }),
      scale,
      settings
    );
    expect(t.ceilingFramingAreaM2).toBeCloseTo(20, 2);
    expect(t.ceilingBoards.find((b) => b.name === "岩綿12")?.areaM2).toBeCloseTo(20, 2);
    expect(t.ceilingBoards.find((b) => b.name === "PB9.5")?.areaM2).toBeCloseTo(20, 2);
  });
});

describe("takeoffRoom — wall heights (ITS工房の考え方)", () => {
  it("パターンA: 下地=スラブ(3m) / ボード=天井下(2.5m)", () => {
    const t = takeoffRoom(
      baseRoom({ walls: [wall({ boards: [{ boardTypeId: "pb125", faces: 2 }] })] }),
      scale,
      settings
    );
    // 下地 10×3 = 30
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
    // ボード 10×2.5×2面 = 50
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(50, 2);
    expect(t.wallDetails[0].framingHeightM).toBeCloseTo(3, 2);
    expect(t.wallDetails[0].boardHeightM).toBeCloseTo(2.5, 2);
  });

  it("パターンB: 下地・ボード共にスラブ(3m)", () => {
    const t = takeoffRoom(
      baseRoom({
        walls: [wall({ boardReach: "slab", boards: [{ boardTypeId: "pb125", faces: 2 }] })],
      }),
      scale,
      settings
    );
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
    // ボード 10×3×2面 = 60
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(60, 2);
  });

  it("excludes wall framing when includeFraming is false (ボードは残る)", () => {
    const t = takeoffRoom(
      baseRoom({
        walls: [wall({ includeFraming: false, boards: [{ boardTypeId: "pb125", faces: 1 }] })],
      }),
      scale,
      settings
    );
    expect(t.wallFramingAreaM2).toBe(0);
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(25, 2); // 10×2.5×1
  });
});

describe("takeoffRoom — openings", () => {
  it("computes opening reinforcement (door 6.9m example)", () => {
    const t = takeoffRoom(
      baseRoom({
        openings: [{ id: "o1", name: "SD-1", kind: "door", widthMm: 900, heightMm: 3000, count: 2 }],
      }),
      scale,
      settings
    );
    expect(t.openingReinforceM).toBeCloseTo(13.8, 6); // 6.9 × 2
  });

  it("deducts opening from linked wall: framing once, board per face, with each height", () => {
    const t = takeoffRoom(
      baseRoom({
        walls: [wall({ boards: [{ boardTypeId: "pb125", faces: 2 }] })],
        // 開口 1.0×2.0 = 2m²、対象壁 w1
        openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1, wallId: "w1" }],
      }),
      scale,
      settings
    );
    // 下地 30 - 2 = 28
    expect(t.wallFramingAreaM2).toBeCloseTo(28, 2);
    // ボード (10×2.5 - 2) × 2面 = 46
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(46, 2);
    expect(t.wallDetails[0].openingDeductM2).toBeCloseTo(2, 2);
  });

  it("does not deduct when opening has no linked wall", () => {
    const t = takeoffRoom(
      baseRoom({
        walls: [wall({ boards: [{ boardTypeId: "pb125", faces: 2 }] })],
        openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1 }],
      }),
      scale,
      settings
    );
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
    expect(t.openingReinforceM).toBeGreaterThan(0);
  });

  it("does not deduct when deductOpenings is off", () => {
    const t = takeoffRoom(
      baseRoom({
        walls: [wall({ boards: [{ boardTypeId: "pb125", faces: 2 }] })],
        openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1, wallId: "w1" }],
      }),
      scale,
      { ...settings, deductOpenings: false }
    );
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
  });
});

describe("takeoffAll", () => {
  it("sums framing and board types across rooms", () => {
    const r = baseRoom({ ceilingBoards: [{ boardTypeId: "pb95" }] });
    const res = takeoffAll([r, { ...r, id: "r2" }], scale, settings);
    expect(res.totals.ceilingFramingAreaM2).toBeCloseTo(40, 2);
    expect(res.totals.ceilingBoards.find((b) => b.name === "PB9.5")?.areaM2).toBeCloseTo(40, 2);
  });

  it("applies a per-page scale resolver", () => {
    const r1 = baseRoom({ id: "r1", page: 1 });
    const r2 = baseRoom({ id: "r2", page: 2 });
    const scaleFor = (room: Room): Scale =>
      room.page === 1
        ? { realMmPerPt: 50, label: "p1", source: "default" }
        : { realMmPerPt: 100, label: "p2", source: "default" };
    const res = takeoffAll([r1, r2], scaleFor, settings);
    // 100×80pt → p1: 20m², p2: 80m² → 合計100m²
    expect(res.totals.ceilingFramingAreaM2).toBeCloseTo(100, 1);
  });
});
