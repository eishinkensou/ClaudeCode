import { describe, it, expect } from "vitest";
import {
  polygonArea,
  polygonPerimeter,
  pointInPolygon,
  detectRectangles,
} from "../geometry";
import type { Point, Segment } from "../types";

const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

describe("polygonArea", () => {
  it("computes area of a unit square", () => {
    expect(polygonArea(rect(0, 0, 10, 10))).toBe(100);
  });
  it("is orientation-independent", () => {
    const cw = rect(0, 0, 10, 5).reverse();
    expect(polygonArea(cw)).toBe(50);
  });
  it("returns 0 for degenerate input", () => {
    expect(polygonArea([{ x: 0, y: 0 }])).toBe(0);
  });
});

describe("polygonPerimeter", () => {
  it("computes perimeter of a rectangle", () => {
    expect(polygonPerimeter(rect(0, 0, 10, 5))).toBe(30);
  });
});

describe("pointInPolygon", () => {
  const sq = rect(0, 0, 10, 10);
  it("detects inside point", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
  });
  it("detects outside point", () => {
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe("detectRectangles", () => {
  it("finds a rectangle from 4 axis-aligned segments", () => {
    const segs: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, // bottom
      { a: { x: 0, y: 80 }, b: { x: 100, y: 80 } }, // top
      { a: { x: 0, y: 0 }, b: { x: 0, y: 80 } }, // left
      { a: { x: 100, y: 0 }, b: { x: 100, y: 80 } }, // right
    ];
    const rects = detectRectangles(segs);
    expect(rects.length).toBe(1);
    expect(polygonArea(rects[0])).toBeCloseTo(8000, 1);
  });

  it("ignores segments too small to be a room", () => {
    const segs: Segment[] = [
      { a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      { a: { x: 0, y: 5 }, b: { x: 5, y: 5 } },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 5 } },
      { a: { x: 5, y: 0 }, b: { x: 5, y: 5 } },
    ];
    expect(detectRectangles(segs, { minSizePt: 20 }).length).toBe(0);
  });
});
