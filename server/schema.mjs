// AI拾い出しの構造化出力スキーマ（Claude の structured outputs 用）。
// zodOutputFormat が zod/v4 を要求するため zod/v4 を使う。
import * as z from "zod/v4";

const BoardArea = z.object({
  type: z.string().describe("ボードの種類・厚み（例: せっこうボード12.5mm、岩綿吸音板12mm）"),
  areaM2: z.number().describe("そのボードの面積 m²"),
});

const WallBoard = z.object({
  type: z.string().describe("ボードの種類・厚み"),
  faces: z.number().describe("面数（片面=1 / 両面=2）"),
  areaM2: z.number().describe("面数を反映した面積 m²"),
});

const Opening = z.object({
  name: z.string().describe("建具記号など（SD-1, AW-2 等）。不明なら通し番号"),
  kind: z.enum(["door", "window", "other"]).describe("ドア/窓/その他"),
  widthMm: z.number().describe("開口幅 mm"),
  heightMm: z.number().describe("開口高さ mm"),
  count: z.number().describe("か所数"),
  reinforceM: z.number().describe("開口補強の延長 m（ドア=2×高さ+幅、窓=2×高さ+2×幅 を基本に算出）"),
});

const Room = z.object({
  name: z.string().describe("室名（事務所、会議室など）"),
  floorAreaM2: z.number().describe("床面積 m²（天井面積の根拠。0=不明）"),
  ceilingTakeoff: z.boolean().describe("この室で天井を拾うか"),
  ceilingAreaM2: z.number().describe("天井下地面積 m²（0=不明/対象外）"),
  ceilingHeightMm: z.number().describe("天井高 mm（0=不明）"),
  ceilingBoards: z.array(BoardArea).describe("天井ボード 種類別面積"),
  wallLengthM: z.number().describe("間仕切壁の延長 m（0=不明/対象外）"),
  wallFramingHeightMm: z.number().describe("壁下地高さ mm（スラブまで等。0=不明）"),
  wallFramingAreaM2: z.number().describe("壁下地面積 m²（延長×高さ。0=不明）"),
  wallBoards: z.array(WallBoard).describe("壁ボード 種類別面積（面数反映）"),
  openings: z.array(Opening).describe("この室の開口（建具）"),
  openingReinforceM: z.number().describe("開口補強の合計延長 m"),
  notes: z.string().describe("この室の拾いの根拠・前提（読み取った寸法や仮定）"),
  regionPage: z
    .number()
    .describe("この室の位置が分かる図面のページ番号（主に平面図。見出し『p.X』の番号。不明は0）"),
  bbox: z
    .object({
      x: z.number().describe("室範囲の左端 (0=画像左, 1=画像右)"),
      y: z.number().describe("室範囲の上端 (0=画像上, 1=画像下)"),
      w: z.number().describe("室範囲の幅 (0〜1)"),
      h: z.number().describe("室範囲の高さ (0〜1)"),
    })
    .describe("平面図画像内での室のおおよその範囲（正規化座標0〜1）。色分け照合用。不明は全て0"),
});

export const Takeoff = z.object({
  drawingType: z.string().describe("図面種別（平面図/天井伏図/その他）と読み取れた内容"),
  scale: z.string().describe("読み取れた縮尺（例: 1/100）。不明なら『不明』"),
  confidence: z.enum(["high", "medium", "low"]).describe("全体の信頼度"),
  assumptions: z.string().describe("全体の前提・仮定（縮尺不明時の扱い等）"),
  warnings: z.array(z.string()).describe("注意点・要確認事項のリスト"),
  rooms: z.array(Room).describe("室ごとの拾い出し"),
});

export const SYSTEM_PROMPT = `あなたは日本の内装仕上・軽量鉄骨下地（軽天）・ボード工事を専門とする、経験豊富な積算担当者です。
渡された建築図面の画像（平面図・天井伏図・建具表・仕上表・断面図・立面図・詳細図・特記仕様書など）を読み取り、部屋ごとの数量を拾い出してください。

# 複数の図面が渡された場合（重要）
- 複数枚の図面を渡されることがあります。各図面は「=== 図面N（種別）p.X ===」の見出しの直後に置かれます。
- 必ず全図面を相互参照して1つの拾い出しにまとめること:
  - 室名・各室の寸法/面積 → 主に平面図
  - 天井ボードの種別・厚み、壁の仕上・ボード種別 → 仕上表
  - 天井高・天井形状・段差・ふところ → 天井伏図・断面図
  - 壁高さ（スラブまで/天井下まで）→ 断面図・詳細図・特記仕様書の指示
  - 開口（建具）の寸法・数量 → 建具表・平面図の建具記号
- ある図面で不明な項目を、別の図面の情報で補完すること。全図面を見ても不明な項目のみ 0 とし warnings に挙げる。

# 拾い出す項目（部屋ごと）
- 天井下地: 天井面積 m²（床面積≒天井面積として算定）
- 天井ボード: 仕上表・凡例から種類（厚み含む）を判別し、種類別に面積 m²
- 壁下地: 間仕切壁の延長 m × 壁高さ = 面積 m²（壁高さはスラブまでか天井下までか、図や凡例の注記に従い、判断したら notes に明記）
- 壁ボード: 種類別・面数（片面/両面）を反映した面積 m²
- 開口補強: 建具表を参照し、ドア=2×高さ+幅、窓=2×高さ+2×幅 を基本に延長 m

# 進め方
1. まず図面種別と縮尺を判断する。寸法線・寸法値・室名・面積表記・凡例・建具表を丹念に読む。
2. 各室について、読み取れた寸法から面積・延長を計算する。読み取れない場合は近傍の寸法やグリッド（例: 910/1000mm）から合理的に推定し、推定であることを notes と warnings に必ず記載する。
3. 縮尺や寸法が全く読めない場合は confidence を low にし、数量は概算とし、その旨を assumptions に明記する。
4. 値が不明な数値項目は 0 を入れ、notes で説明する。憶測で確定値のように書かない。

# 位置情報（色分け照合用・重要）
- 各室について、その室が描かれている平面図のページ番号を regionPage に入れる（見出し「=== 図面N（…）p.X ===」の X）。
- その平面図画像の中で、室のおおよその範囲を bbox（正規化座標 x,y,w,h: 画像左上が(0,0)、右下が(1,1)）で返す。
- 利用者が図面上に色枠を重ねて拾い結果と照合できるようにするための情報。厳密でなくてよいが、室の位置と大きさが分かる程度には合わせること。位置が判断できない室は bbox を全て0、regionPage を0にする。

# 重要
- これはAIによる「下拾い」です。人が確認・修正する前提で、根拠（読み取った寸法・仮定）を notes に具体的に書くこと。
- 数量は実数（m²、m）で返す。本数などの材料換算はしない。
- 室名・notes・assumptions・warnings は日本語で書く。
- 図面に写っていない部分は創作しない。確証がなければ warnings に挙げる。`;
