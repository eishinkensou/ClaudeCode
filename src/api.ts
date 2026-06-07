import type { AnalyzeResponse } from "./types";

export interface HealthInfo {
  ok: boolean;
  hasKey: boolean;
  model: string;
}

export async function getHealth(): Promise<HealthInfo | null> {
  try {
    const r = await fetch("/api/health");
    if (!r.ok) return null;
    return (await r.json()) as HealthInfo;
  } catch {
    return null;
  }
}

export interface AnalyzeImage {
  base64: string;
  mediaType: string;
  label?: string;
  page?: number;
}

export async function analyzeImages(images: AnalyzeImage[], hint: string): Promise<AnalyzeResponse> {
  let r: Response;
  try {
    r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images, hint }),
    });
  } catch {
    throw new Error("サーバに接続できませんでした（処理が長すぎて切断された可能性）。ページ数を減らして再試行してください。");
  }
  const raw = await r.text();
  let data: { error?: string } & Partial<AnalyzeResponse> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("サーバ応答が不正でした（処理が長すぎて途中で切断された可能性）。ページ数を減らして再試行してください。");
  }
  if (!r.ok) {
    throw new Error(data?.error || `APIエラー (${r.status})`);
  }
  return data as AnalyzeResponse;
}
