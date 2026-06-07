import * as pdfjsLib from "pdfjs-dist";
// Vite: worker を URL として取り込む
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = pdfjsLib.PDFDocumentProxy;
export type PdfPage = pdfjsLib.PDFPageProxy;
export { pdfjsLib };

/** ArrayBuffer から PDF を読み込む */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const task = pdfjsLib.getDocument({ data });
  return task.promise;
}

/** ページを canvas に描画し、使用した viewport を返す */
export async function renderPage(
  page: PdfPage,
  canvas: HTMLCanvasElement,
  renderScale: number
): Promise<pdfjsLib.PageViewport> {
  const viewport = page.getViewport({ scale: renderScale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D コンテキストを取得できません");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return viewport;
}
