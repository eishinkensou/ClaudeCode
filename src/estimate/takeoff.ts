import type {
  AppSettings,
  BoardType,
  OpeningDetail,
  Room,
  RoomTakeoff,
  Scale,
  TakeoffResult,
  TypedArea,
  Wall,
  WallDetail,
} from "../types";
import { polygonArea, segLength } from "../geometry";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** pt → m 係数（実寸） */
function mPerPt(scale: Scale): number {
  return scale.realMmPerPt / 1000;
}

/** 室の天井面積（m²）。ポリゴンがあれば縮尺換算、無ければ手入力値。 */
export function ceilingAreaM2(room: Room, scale: Scale): number {
  if (room.polygon.length >= 3) {
    const k = mPerPt(scale);
    return polygonArea(room.polygon) * k * k;
  }
  return room.ceilingAreaM2Manual ?? 0;
}

/** 壁の延長（m）。作図線分があれば縮尺換算、無ければ手入力値。 */
export function wallLengthM(wall: Wall, scale: Scale): number {
  if (wall.segment) return segLength(wall.segment) * mPerPt(scale);
  return (wall.lengthMmManual ?? 0) / 1000;
}

/** 開口1か所あたりの補強延長（m）と算定式 */
export function openingReinforcePerUnit(
  kind: "door" | "window",
  widthM: number,
  heightM: number
): { perUnitM: number; formula: string } {
  if (kind === "door") {
    // ドア（建具）: 両側たて枠 + 上枠 = 2×高 + 幅
    return {
      perUnitM: 2 * heightM + widthM,
      formula: `2×${round2(heightM)}＋${round2(widthM)}`,
    };
  }
  // 窓: 周囲（たて2 + 上下2） = 2×高 + 2×幅
  return {
    perUnitM: 2 * heightM + 2 * widthM,
    formula: `2×${round2(heightM)}＋2×${round2(widthM)}`,
  };
}

/** 種類別面積の合計をマージ（同名は加算、入力順を維持） */
function mergeTyped(into: TypedArea[], add: TypedArea[]): void {
  for (const a of add) {
    const found = into.find((x) => x.name === a.name);
    if (found) found.areaM2 = round2(found.areaM2 + a.areaM2);
    else into.push({ name: a.name, areaM2: round2(a.areaM2) });
  }
}

/** 1室を拾い出す */
export function takeoffRoom(
  room: Room,
  scale: Scale,
  settings: AppSettings
): RoomTakeoff {
  const boardName = (id: string): string =>
    settings.boardTypes.find((b: BoardType) => b.id === id)?.name ?? "(未設定ボード)";

  // ── 開口（先に集計：開口控除に使う） ──
  const openingDetails: OpeningDetail[] = room.openings.map((o) => {
    const widthM = o.widthMm / 1000;
    const heightM = o.heightMm / 1000;
    const { perUnitM, formula } = openingReinforcePerUnit(o.kind, widthM, heightM);
    return {
      name: o.name,
      kind: o.kind,
      widthM: round2(widthM),
      heightM: round2(heightM),
      count: o.count,
      perUnitM: round2(perUnitM),
      totalM: round2(perUnitM * o.count),
      formula: `(${formula})×${o.count}`,
    };
  });
  const openingReinforceM = round2(
    openingDetails.reduce((s, d) => s + d.totalM, 0)
  );
  // 開口控除に使う「開口面積合計（m²）」
  const openingAreaM2 = room.openings.reduce(
    (s, o) => s + (o.widthMm / 1000) * (o.heightMm / 1000) * o.count,
    0
  );

  // ── 天井 ──
  const cArea = room.includeCeiling ? ceilingAreaM2(room, scale) : 0;
  const ceilingFramingAreaM2 = round2(cArea);
  const ceilingBoards: TypedArea[] = [];
  for (const layer of room.ceilingBoards) {
    mergeTyped(ceilingBoards, [{ name: boardName(layer.boardTypeId), areaM2: cArea }]);
  }

  // ── 壁 ──
  let wallFramingAreaM2 = 0;
  const wallBoards: TypedArea[] = [];
  const wallDetails: WallDetail[] = [];

  for (const wall of room.walls) {
    const lenM = wallLengthM(wall, scale);
    const hM = (wall.heightMm ?? settings.defaultWallHeightMm) / 1000;
    let gross = lenM * hM;
    // 開口控除（室の開口面積を壁全体に按分せず、壁面積から一律控除する簡易方式）
    // ※既定では控除しない
    const framingArea = wall.includeFraming ? gross : 0;

    const boards = wall.boards.map((b) => {
      let area = lenM * hM * b.faces;
      return { name: boardName(b.boardTypeId), faces: b.faces, areaM2: round2(area) };
    });

    wallFramingAreaM2 += framingArea;
    mergeTyped(
      wallBoards,
      boards.map((b) => ({ name: b.name, areaM2: b.areaM2 }))
    );
    wallDetails.push({
      name: wall.name,
      lengthM: round2(lenM),
      heightM: round2(hM),
      framingAreaM2: round2(framingArea),
      boards,
    });
  }

  // 開口控除（settings.deductOpenings = true のとき、室合計から差し引く）
  if (settings.deductOpenings && openingAreaM2 > 0) {
    wallFramingAreaM2 = Math.max(0, wallFramingAreaM2 - openingAreaM2);
    for (const b of wallBoards) {
      b.areaM2 = round2(Math.max(0, b.areaM2 - openingAreaM2));
    }
  }

  return {
    roomId: room.id,
    roomName: room.name,
    ceilingFramingAreaM2,
    ceilingHeightMm: room.ceilingHeightMm,
    ceilingBoards,
    wallFramingAreaM2: round2(wallFramingAreaM2),
    wallBoards,
    wallDetails,
    openingReinforceM,
    openingDetails,
  };
}

/** 全室を拾い出して合計も出す */
export function takeoffAll(
  rooms: Room[],
  scale: Scale,
  settings: AppSettings
): TakeoffResult {
  const roomResults = rooms.map((r) => takeoffRoom(r, scale, settings));

  const ceilingBoards: TypedArea[] = [];
  const wallBoards: TypedArea[] = [];
  let ceilingFramingAreaM2 = 0;
  let wallFramingAreaM2 = 0;
  let openingReinforceM = 0;

  for (const r of roomResults) {
    ceilingFramingAreaM2 += r.ceilingFramingAreaM2;
    wallFramingAreaM2 += r.wallFramingAreaM2;
    openingReinforceM += r.openingReinforceM;
    mergeTyped(ceilingBoards, r.ceilingBoards);
    mergeTyped(wallBoards, r.wallBoards);
  }

  return {
    rooms: roomResults,
    totals: {
      ceilingFramingAreaM2: round2(ceilingFramingAreaM2),
      wallFramingAreaM2: round2(wallFramingAreaM2),
      ceilingBoards,
      wallBoards,
      openingReinforceM: round2(openingReinforceM),
    },
  };
}
