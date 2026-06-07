import { describe, it, expect } from "vitest";
import {
  takeoffRoom,
  takeoffAll,
  ceilingAreaM2,
  wallLengthM,
  openingReinforcePerUnit,
} from "../estimate";
import { DEFAULT_SETTINGS } from "../estimate/defaults";
import type { AppSettings, Room, Scale, Wall } from "../types";

// 縮尺: 1pt = 50mm（テスト用の単純設定）
const scale: Scale = { realMmPerPt: 50, label: "test", source: "default" };

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  defaultWallHeightMm: 3000,
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

describe("ceilingAreaM2 / wallLengthM", () => {
  it("converts polygon area pt² → m² via scale", () => {
    expect(ceilingAreaM2(baseRoom(), scale)).toBeCloseTo(20, 3);
  });
  it("falls back to manual area when no polygon", () => {
    const r = baseRoom({ polygon: [], ceilingAreaM2Manual: 12.5 });
    expect(ceilingAreaM2(r, scale)).toBe(12.5);
  });
  it("computes wall length from drawn segment", () => {
    const w: Wall = {
      id: "w",
      name: "W1",
      segment: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, // 100pt × 50mm = 5000mm = 5m
      boards: [],
      includeFraming: true,
    };
    expect(wallLengthM(w, scale)).toBeCloseTo(5, 3);
  });
  it("computes wall length from manual mm", () => {
    const w: Wall = { id: "w", name: "W1", lengthMmManual: 8000, boards: [], includeFraming: true };
    expect(wallLengthM(w, scale)).toBe(8);
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

describe("takeoffRoom", () => {
  it("aggregates ceiling board area per type (重ね貼り)", () => {
    const r = baseRoom({
      ceilingBoards: [{ boardTypeId: "rw12" }, { boardTypeId: "pb95" }],
    });
    const t = takeoffRoom(r, scale, settings);
    expect(t.ceilingFramingAreaM2).toBeCloseTo(20, 2);
    expect(t.ceilingBoards).toHaveLength(2);
    expect(t.ceilingBoards.find((b) => b.name === "岩綿12")?.areaM2).toBeCloseTo(20, 2);
    expect(t.ceilingBoards.find((b) => b.name === "PB9.5")?.areaM2).toBeCloseTo(20, 2);
  });

  it("computes wall framing once and board per face", () => {
    const wall: Wall = {
      id: "w1",
      name: "W1",
      lengthMmManual: 10000, // 10m
      heightMm: 3000, // 3m → 下地 30m²
      boards: [{ boardTypeId: "pb125", faces: 2 }],
      includeFraming: true,
    };
    const t = takeoffRoom(baseRoom({ walls: [wall] }), scale, settings);
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
    // ボードは両面 → 60m²
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(60, 2);
    expect(t.wallDetails[0].boards[0].faces).toBe(2);
  });

  it("uses default wall height when wall height is unset", () => {
    const wall: Wall = { id: "w1", name: "W1", lengthMmManual: 5000, boards: [], includeFraming: true };
    const t = takeoffRoom(baseRoom({ walls: [wall] }), scale, settings);
    // 5m × 既定3m = 15m²
    expect(t.wallFramingAreaM2).toBeCloseTo(15, 2);
  });

  it("excludes wall framing when includeFraming is false", () => {
    const wall: Wall = {
      id: "w1",
      name: "W1",
      lengthMmManual: 5000,
      heightMm: 3000,
      boards: [{ boardTypeId: "pb125", faces: 1 }],
      includeFraming: false,
    };
    const t = takeoffRoom(baseRoom({ walls: [wall] }), scale, settings);
    expect(t.wallFramingAreaM2).toBe(0);
    // ボードは計上される
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(15, 2);
  });

  it("computes opening reinforcement (door 6.9m example)", () => {
    const r = baseRoom({
      openings: [{ id: "o1", name: "SD-1", kind: "door", widthMm: 900, heightMm: 3000, count: 2 }],
    });
    const t = takeoffRoom(r, scale, settings);
    expect(t.openingReinforceM).toBeCloseTo(13.8, 6); // 6.9 × 2
    expect(t.openingDetails[0].perUnitM).toBeCloseTo(6.9, 6);
  });

  it("deducts opening area from the linked wall (framing once, board per face)", () => {
    const wall: Wall = {
      id: "w1",
      name: "W1",
      lengthMmManual: 10000, // 10m
      heightMm: 3000, // 3m → gross 30m²
      boards: [{ boardTypeId: "pb125", faces: 2 }],
      includeFraming: true,
    };
    const room = baseRoom({
      walls: [wall],
      // 開口 1.0×2.0 ×1 = 2m²、対象壁 W1
      openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1, wallId: "w1" }],
    });
    const t = takeoffRoom(room, scale, { ...settings, deductOpenings: true });
    // 下地: 30 - 2 = 28
    expect(t.wallFramingAreaM2).toBeCloseTo(28, 2);
    // ボード両面: (30 - 2) × 2 = 56
    expect(t.wallBoards.find((b) => b.name === "PB12.5")?.areaM2).toBeCloseTo(56, 2);
    expect(t.wallDetails[0].openingDeductM2).toBeCloseTo(2, 2);
  });

  it("does not deduct when opening has no linked wall", () => {
    const wall: Wall = {
      id: "w1",
      name: "W1",
      lengthMmManual: 10000,
      heightMm: 3000,
      boards: [{ boardTypeId: "pb125", faces: 2 }],
      includeFraming: true,
    };
    const room = baseRoom({
      walls: [wall],
      openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1 }],
    });
    const t = takeoffRoom(room, scale, { ...settings, deductOpenings: true });
    expect(t.wallFramingAreaM2).toBeCloseTo(30, 2);
    // 補強は壁紐づけが無くても計上される
    expect(t.openingReinforceM).toBeGreaterThan(0);
  });

  it("does not deduct when deductOpenings is off", () => {
    const wall: Wall = {
      id: "w1",
      name: "W1",
      lengthMmManual: 10000,
      heightMm: 3000,
      boards: [{ boardTypeId: "pb125", faces: 2 }],
      includeFraming: true,
    };
    const room = baseRoom({
      walls: [wall],
      openings: [{ id: "o1", name: "D", kind: "door", widthMm: 1000, heightMm: 2000, count: 1, wallId: "w1" }],
    });
    const t = takeoffRoom(room, scale, { ...settings, deductOpenings: false });
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
    // 室1=ページ1(50mm/pt → 20m²)、室2=ページ2(100mm/pt → 80m²)
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
