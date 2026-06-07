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

export async function analyzeImage(
  base64: string,
  mediaType: string,
  hint: string
): Promise<AnalyzeResponse> {
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType, hint }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data?.error || `APIエラー (${r.status})`);
  }
  return data as AnalyzeResponse;
}
