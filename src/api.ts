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
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images, hint }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data?.error || `APIエラー (${r.status})`);
  }
  return data as AnalyzeResponse;
}
