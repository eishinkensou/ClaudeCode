import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  dataUrl: string; // 画面プレビュー用
  base64: string; // API送信用（プレフィックスなし）
  mediaType: "image/png";
  width: number;
  height: number;
}

export type PdfDoc = pdfjsLib.PDFDocumentProxy;

export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  return pdfjsLib.getDocument({ data }).promise;
}

/**
 * ページを画像（PNG）に描画する。AIが寸法を読めるよう長辺を maxPx 程度まで拡大。
 * Claude の高解像度上限（長辺2576px）に収まるよう既定 2200px。
 */
export async function renderPageToImage(
  doc: PdfDoc,
  pageNumber: number,
  maxPx = 2200
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const longEdge = Math.max(base.width, base.height);
  const scale = Math.min(4, Math.max(1, maxPx / longEdge));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2Dコンテキストを取得できません");
  // 背景を白で塗る（透過PDF対策）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  return { dataUrl, base64, mediaType: "image/png", width: canvas.width, height: canvas.height };
}
