import { useEffect, useRef, useState } from "react";
import { analyzeImage, getHealth, type HealthInfo } from "./api";
import { loadPdf, renderPageToImage, type PdfDoc, type RenderedPage } from "./pdf";
import { downloadCsv } from "./export";
import type { Takeoff } from "./types";
import ResultEditor from "./components/ResultEditor";

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [page, setPage] = useState<RenderedPage | null>(null);
  const [hint, setHint] = useState("");
  const [takeoff, setTakeoff] = useState<Takeoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [isMock, setIsMock] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  const showPage = async (d: PdfDoc, idx: number) => {
    setStatus("ページを描画中…");
    const img = await renderPageToImage(d, idx);
    setPage(img);
    setStatus("");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("PDFを読み込み中…");
    setTakeoff(null);
    try {
      const d = await loadPdf(await file.arrayBuffer());
      setDoc(d);
      setNumPages(d.numPages);
      setPageIndex(1);
      await showPage(d, 1);
    } catch (err) {
      setStatus(`PDF読み込み失敗: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const gotoPage = async (idx: number) => {
    if (!doc || idx < 1 || idx > numPages) return;
    setPageIndex(idx);
    setBusy(true);
    try {
      await showPage(doc, idx);
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!page) return;
    setBusy(true);
    setStatus("AIが図面を読み取り中…（30秒〜1分ほどかかります）");
    try {
      const res = await analyzeImage(page.base64, page.mediaType, hint);
      setTakeoff(res.takeoff);
      setIsMock(res.mock);
      setStatus(
        res.mock
          ? "サンプル表示中（APIキー未設定）。本物のAI拾いには .env にキーを設定してください。"
          : `AI拾い完了（${res.model}）${res.usage ? ` / 入力${res.usage.input_tokens ?? "?"}・出力${res.usage.output_tokens ?? "?"}トークン` : ""}`
      );
    } catch (err) {
      setStatus(`解析エラー: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="title">積算AI</span>
        <span className="subtitle">PDF図面から軽天・ボードを自動拾い</span>
        <span className="grow" />
        {health && (
          <span className={health.hasKey ? "badge ok" : "badge warn"}>
            {health.hasKey ? `AI接続OK (${health.model})` : "APIキー未設定（サンプルモード）"}
          </span>
        )}
        <button className="primary" onClick={() => fileRef.current?.click()}>PDFを開く</button>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFile} />
      </header>

      {status && <div className="status">{status}</div>}

      <div className="main">
        <div className="left">
          {page ? (
            <>
              <div className="page-bar">
                <button disabled={pageIndex <= 1 || busy} onClick={() => gotoPage(pageIndex - 1)}>◀</button>
                <span>{pageIndex} / {numPages}</span>
                <button disabled={pageIndex >= numPages || busy} onClick={() => gotoPage(pageIndex + 1)}>▶</button>
                <span className="grow" />
                <button className="primary" disabled={busy} onClick={analyze}>このページをAIで拾う</button>
              </div>
              <div className="hint-row">
                <input
                  className="hint-input"
                  placeholder="補足（任意）：例『天伏図。壁下地はスラブまで、ボードは天井下まで』"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                />
              </div>
              <div className="preview">
                <img src={page.dataUrl} alt="図面プレビュー" />
              </div>
            </>
          ) : (
            <div className="empty">
              {busy ? "処理中…" : "「PDFを開く」から図面を読み込んでください。"}
              <br />
              <span className="hint">平面図・天井伏図・建具表・仕上表などを読み取ります。</span>
            </div>
          )}
        </div>

        <div className="right">
          {takeoff ? (
            <>
              {isMock && <div className="mock-banner">⚠ サンプルデータ（AI未使用）。.env に APIキーを設定すると実図面を解析します。</div>}
              <ResultEditor takeoff={takeoff} onChange={setTakeoff} onExport={() => downloadCsv(takeoff)} />
            </>
          ) : (
            <div className="empty">
              図面を開いて「このページをAIで拾う」を押すと、
              <br />
              部屋ごとの拾い出し（天井・壁・ボード・開口補強）が表示されます。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
