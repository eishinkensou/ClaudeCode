// server/schema.mjs と対応する型（拾い出し結果）

export interface BoardArea {
  type: string;
  areaM2: number;
}

export interface WallBoard {
  type: string;
  faces: number;
  areaM2: number;
}

export type OpeningKind = "door" | "window" | "other";

export interface Opening {
  name: string;
  kind: OpeningKind;
  widthMm: number;
  heightMm: number;
  count: number;
  reinforceM: number;
}

export interface Room {
  name: string;
  floorAreaM2: number;
  ceilingTakeoff: boolean;
  ceilingAreaM2: number;
  ceilingHeightMm: number;
  ceilingBoards: BoardArea[];
  wallLengthM: number;
  wallFramingHeightMm: number;
  wallFramingAreaM2: number;
  wallBoards: WallBoard[];
  openings: Opening[];
  openingReinforceM: number;
  notes: string;
}

export type Confidence = "high" | "medium" | "low";

export interface Takeoff {
  drawingType: string;
  scale: string;
  confidence: Confidence;
  assumptions: string;
  warnings: string[];
  rooms: Room[];
}

export interface AnalyzeResponse {
  mock: boolean;
  model: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  takeoff: Takeoff;
}
