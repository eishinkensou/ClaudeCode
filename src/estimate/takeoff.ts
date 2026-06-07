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

/**
 * 壁の下地高さ・ボード高さ（mm）を解決する。
 * 明示指定があれば優先、無ければ到達先（スラブ/天井）と室の高さから算出。
 */
export function wallHeightsMm(
  wall: Wall,
  room: Room,
  settings: AppSettings
): { framingHeightMm: number; boardHeightMm: number } {
  const slabH = room.slabHeightMm ?? settings.defaultSlabHeightMm;
  const ceilH = room.ceilingHeightMm ?? settings.defaultCeilingHeightMm;
  const framingHeightMm =
    wall.framingHeightMm ?? (wall.framingReach === "slab" ? slabH : ceilH);
  const boardHeightMm = wall.boardHeightMm ?? (wall.boardReach === "slab" ? slabH : ceilH);
  return { framingHeightMm, boardHeightMm };
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

  // 壁ごとの開口控除面積（m²/1面）。wallId が指定された開口のみ対象。
  const openAreaByWall = new Map<string, number>();
  if (settings.deductOpenings) {
    for (const o of room.openings) {
      if (!o.wallId) continue;
      const a = (o.widthMm / 1000) * (o.heightMm / 1000) * o.count;
      openAreaByWall.set(o.wallId, (openAreaByWall.get(o.wallId) ?? 0) + a);
    }
  }

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
    const { framingHeightMm, boardHeightMm } = wallHeightsMm(wall, room, settings);
    const framingH = framingHeightMm / 1000;
    const boardH = boardHeightMm / 1000;
    const grossFraming = lenM * framingH;
    const grossBoardPerFace = lenM * boardH;
    const openArea = openAreaByWall.get(wall.id) ?? 0;
    // 開口控除（それぞれの高さの面積を超えない範囲で控除）
    const deductFraming = Math.min(grossFraming, openArea);
    const deductBoard = Math.min(grossBoardPerFace, openArea);

    const framingArea = wall.includeFraming ? grossFraming - deductFraming : 0;
    const netBoardPerFace = grossBoardPerFace - deductBoard;

    // ボードは面数ぶん控除（両面なら開口も両面ぶん）
    const boards = wall.boards.map((b) => ({
      name: boardName(b.boardTypeId),
      faces: b.faces,
      areaM2: round2(netBoardPerFace * b.faces),
    }));

    wallFramingAreaM2 += framingArea;
    mergeTyped(
      wallBoards,
      boards.map((b) => ({ name: b.name, areaM2: b.areaM2 }))
    );
    wallDetails.push({
      name: wall.name,
      lengthM: round2(lenM),
      framingReach: wall.framingReach,
      framingHeightM: round2(framingH),
      framingAreaM2: round2(framingArea),
      boardReach: wall.boardReach,
      boardHeightM: round2(boardH),
      openingDeductM2: round2(deductBoard),
      boards,
    });
  }

  return {
    roomId: room.id,
    roomName: room.name,
    color: room.color,
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

/**
 * 全室を拾い出して合計も出す。
 * scale は単一の縮尺、または室ごとに縮尺を返す関数（ページ別縮尺）を受け取れる。
 */
export function takeoffAll(
  rooms: Room[],
  scale: Scale | ((room: Room) => Scale),
  settings: AppSettings
): TakeoffResult {
  const scaleFor = typeof scale === "function" ? scale : () => scale;
  const roomResults = rooms.map((r) => takeoffRoom(r, scaleFor(r), settings));

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
