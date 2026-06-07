import express from "express";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Takeoff, SYSTEM_PROMPT } from "./schema.mjs";
import { MOCK_TAKEOFF } from "./mock.mjs";

dotenv.config();

const PORT = process.env.PORT || 8787;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const app = express();
// 複数ページの図面画像（base64）を載せるので上限を大きめに
app.use(express.json({ limit: "96mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: !!API_KEY, model: MODEL });
});

/**
 * 図面画像を受け取り、Claude のビジョンで部屋ごとの拾い出しを返す。
 * 複数ページ（平面図＋仕上表＋建具表＋天伏図＋断面 等）をまとめて渡すと相互参照して拾う。
 * APIキー未設定時はサンプル（モック）を返す。
 * body: {
 *   images?: [{ base64, mediaType, label?, page? }],   // 複数ページ（推奨）
 *   imageBase64?, mediaType?,                            // 単一ページ（後方互換）
 *   hint?: string
 * }
 */
app.post("/api/analyze", async (req, res) => {
  const { imageBase64, mediaType = "image/png", hint = "", images } = req.body || {};

  // 入力画像を配列に正規化
  let imgs = [];
  if (Array.isArray(images) && images.length > 0) {
    imgs = images;
  } else if (imageBase64) {
    imgs = [{ base64: imageBase64, mediaType, label: "", page: 1 }];
  }
  if (imgs.length === 0) {
    return res.status(400).json({ error: "解析する画像がありません" });
  }

  // APIキーが無ければモックを返す（キー取得前でも動作確認できる）
  if (!API_KEY) {
    return res.json({ mock: true, model: null, takeoff: MOCK_TAKEOFF });
  }

  try {
    const client = new Anthropic({ apiKey: API_KEY });

    // 各図面を「ラベル＋画像」の組で並べ、最後に指示文を置く
    const content = [];
    imgs.forEach((im, i) => {
      const label = im.label ? `（${im.label}）` : "";
      const pg = im.page ? ` p.${im.page}` : "";
      content.push({ type: "text", text: `=== 図面${i + 1}${label}${pg} ===` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: im.mediaType || "image/png", data: im.base64 },
      });
    });
    content.push({
      type: "text",
      text:
        `上記${imgs.length}枚の図面を相互に参照し、平面図の各室について軽天・ボード工事の数量を拾い出してください。` +
        `仕上表からボード種別、建具表から開口、断面図/立面図/詳細図から壁高さ・天井高・ふところを補完してください。` +
        (hint ? `\n\n補足情報: ${hint}` : ""),
    });

    const message = await client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: zodOutputFormat(Takeoff),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const final = await message.finalMessage();

    if (final.stop_reason === "max_tokens") {
      return res.status(502).json({
        error:
          "出力が長すぎて途中で切れました。解析ページ数を減らすか、フロア・図面種別ごとに分けて解析してください（目安5〜8枚）。",
        stop_reason: final.stop_reason,
      });
    }

    const text = final.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let takeoff;
    try {
      takeoff = Takeoff.parse(JSON.parse(text));
    } catch {
      return res.status(502).json({
        error:
          "AI出力の解析に失敗しました（出力が途中で切れた可能性）。解析ページ数を減らして再試行してください。",
      });
    }

    res.json({
      mock: false,
      model: MODEL,
      usage: final.usage,
      takeoff,
    });
  } catch (err) {
    console.error("[analyze] error:", err);
    const status = err?.status || 500;
    res.status(status).json({
      error: err?.message || "AI解析でエラーが発生しました",
      type: err?.type,
    });
  }
});

// 本番ビルド（dist/）を配信
app.use(express.static("dist"));

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}  model=${MODEL}  key=${API_KEY ? "set" : "MISSING(mock)"}`);
});
