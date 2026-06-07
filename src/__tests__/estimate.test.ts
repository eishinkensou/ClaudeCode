import { describe, it, expect } from "vitest";
import { estimateCeiling } from "../estimate/ceiling";
import { estimateWall } from "../estimate/wall";
import { estimateBoard } from "../estimate/board";
import { estimateRegion, estimateAll } from "../estimate";
import { DEFAULT_SETTINGS } from "../estimate/defaults";
import type { LineItem, Region, Scale } from "../types";

const find = (items: LineItem[], name: string) =>
  items.find((i) => i.name === name)!;

describe("estimateCeiling", () => {
  const spec = DEFAULT_SETTINGS.ceiling;
  it("scales material counts with area", () => {
    const items = estimateCeiling(100, spec);
    // 野縁延長 = 100 / 0.303 ≒ 330m → ×1.05 / 4m ≒ 87本
    expect(find(items, "野縁").qty).toBe(Math.ceil((100 / 0.303) * 1.05 / 4));
    // 吊りボルト = 100 / 0.81 ≒ 124本
    expect(find(items, "吊りボルト(W3/8)").qty).toBe(Math.ceil(100 / (0.9 * 0.9)));
  });
  it("returns nothing for zero area", () => {
    expect(estimateCeiling(0, spec)).toEqual([]);
  });
});

describe("estimateWall", () => {
  const spec = DEFAULT_SETTINGS.wall;
  it("computes runner as twice the length", () => {
    const items = estimateWall(10, 2.7, spec);
    // ランナー延長 = 20m → ×1.05 / 4 = 6本
    expect(find(items, "ランナー").qty).toBe(Math.ceil((20 * 1.05) / 4));
  });
  it("computes stud count from pitch + 1", () => {
    const items = estimateWall(10, 2.7, spec);
    const studCount = Math.floor(10 / 0.303) + 1; // 34
    expect(find(items, "スタッド").note).toContain(`${studCount}本`);
  });
  it("adds braces when height exceeds row pitch", () => {
    const items = estimateWall(10, 2.7, spec); // 2700/1200 = 2段
    expect(find(items, "振れ止め").note).toContain("2段");
  });
});

describe("estimateBoard", () => {
  const spec = DEFAULT_SETTINGS.board;
  it("computes board count with waste", () => {
    const items = estimateBoard(100, { ...spec, layers: 1 });
    const boardArea = 0.91 * 1.82;
    expect(find(items, "ボード").qty).toBe(Math.ceil((100 * 1.1) / boardArea));
  });
  it("doubles for two layers", () => {
    const one = estimateBoard(100, { ...spec, layers: 1 });
    const two = estimateBoard(100, { ...spec, layers: 2 });
    expect(find(two, "ボード").qty).toBeGreaterThan(find(one, "ボード").qty * 1.9);
  });
});

describe("estimateRegion / estimateAll", () => {
  // 縮尺: 1pt = 50mm（=1/50 図面相当の単純設定）
  const scale: Scale = { realMmPerPt: 50, label: "test", source: "default" };

  const ceilingRegion: Region = {
    id: "c1",
    name: "事務所",
    kind: "ceiling",
    // 100pt×80pt → 実寸 5000mm×4000mm = 20m²
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    confidence: 1,
    source: "manual",
  };

  it("converts pt area to m² via scale", () => {
    const r = estimateRegion(ceilingRegion, scale, DEFAULT_SETTINGS);
    expect(r.areaM2).toBeCloseTo(20, 3);
    expect(r.items.some((i) => i.name === "野縁")).toBe(true);
    // includeBoard 既定 true → 天井ボードも含む
    expect(r.items.some((i) => i.name === "ボード")).toBe(true);
  });

  it("can exclude board", () => {
    const r = estimateRegion(
      { ...ceilingRegion, includeBoard: false },
      scale,
      DEFAULT_SETTINGS
    );
    expect(r.items.some((i) => i.name === "ボード")).toBe(false);
  });

  it("aggregates totals across regions", () => {
    const res = estimateAll([ceilingRegion, ceilingRegion], scale, DEFAULT_SETTINGS);
    const single = estimateRegion(ceilingRegion, scale, DEFAULT_SETTINGS);
    const totalNoburi = res.totals.find((i) => i.name === "野縁")!;
    const oneNoburi = single.items.find((i) => i.name === "野縁")!;
    expect(totalNoburi.qty).toBe(oneNoburi.qty * 2);
  });
});
