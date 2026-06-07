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
// 図面画像（base64）を載せるので上限を上げる
app.use(express.json({ limit: "32mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: !!API_KEY, model: MODEL });
});

/**
 * 図面画像を受け取り、Claude のビジョンで部屋ごとの拾い出しを返す。
 * APIキー未設定時はサンプル（モック）を返し、UIの動作確認だけできるようにする。
 * body: { imageBase64: string, mediaType: "image/png"|"image/jpeg", hint?: string }
 */
app.post("/api/analyze", async (req, res) => {
  const { imageBase64, mediaType = "image/png", hint = "" } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 がありません" });
  }

  // APIキーが無ければモックを返す（キー取得前でも動作確認できる）
  if (!API_KEY) {
    return res.json({ mock: true, model: null, takeoff: MOCK_TAKEOFF });
  }

  try {
    const client = new Anthropic({ apiKey: API_KEY });
    const userText =
      "この図面を読み取り、部屋ごとに軽天・ボード工事の数量を拾い出してください。" +
      (hint ? `\n\n補足情報: ${hint}` : "");

    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: zodOutputFormat(Takeoff),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    });

    if (!message.parsed_output) {
      return res.status(502).json({
        error: "AIの応答を解析できませんでした（安全上の拒否または出力上限の可能性）",
        stop_reason: message.stop_reason,
      });
    }

    res.json({
      mock: false,
      model: MODEL,
      usage: message.usage,
      takeoff: message.parsed_output,
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
