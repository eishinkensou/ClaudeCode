// APIキー未設定時に返すサンプル拾い出し（UI動作確認用）。
export const MOCK_TAKEOFF = {
  drawingType: "平面図（サンプル）",
  scale: "1/100",
  confidence: "medium",
  assumptions:
    "これはAPIキー未設定時のサンプルデータです。実際のAI拾いには Anthropic APIキーが必要です。",
  warnings: ["サンプル表示中（AI未使用）", "実図面では各室の寸法・仕上を確認してください"],
  rooms: [
    {
      name: "事務所",
      floorAreaM2: 48.6,
      ceilingTakeoff: true,
      ceilingAreaM2: 48.6,
      ceilingHeightMm: 2700,
      ceilingBoards: [
        { type: "せっこうボード 9.5mm", areaM2: 48.6 },
        { type: "岩綿吸音板 12mm", areaM2: 48.6 },
      ],
      wallLengthM: 28.4,
      wallFramingHeightMm: 4000,
      wallFramingAreaM2: 113.6,
      wallBoards: [{ type: "せっこうボード 12.5mm", faces: 2, areaM2: 153.4 }],
      openings: [
        { name: "SD-1", kind: "door", widthMm: 900, heightMm: 2000, count: 1, reinforceM: 4.9 },
      ],
      openingReinforceM: 4.9,
      notes: "床面積≒天井面積。壁下地はスラブまで(H4000)、ボードは天井下(H2700)想定のサンプル値。",
    },
    {
      name: "会議室",
      floorAreaM2: 28.0,
      ceilingTakeoff: true,
      ceilingAreaM2: 28.0,
      ceilingHeightMm: 2700,
      ceilingBoards: [{ type: "せっこうボード 9.5mm", areaM2: 28.0 }],
      wallLengthM: 21.2,
      wallFramingHeightMm: 4000,
      wallFramingAreaM2: 84.8,
      wallBoards: [{ type: "強化せっこうボード 12.5mm", faces: 2, areaM2: 114.5 }],
      openings: [
        { name: "SD-2", kind: "door", widthMm: 900, heightMm: 2000, count: 1, reinforceM: 4.9 },
        { name: "AW-1", kind: "window", widthMm: 1800, heightMm: 1200, count: 2, reinforceM: 12.0 },
      ],
      openingReinforceM: 16.9,
      notes: "サンプル。窓補強=2×1.2+2×1.8=6.0m/か所 ×2。",
    },
  ],
};
