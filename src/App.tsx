import { useEffect, useRef, useState } from "react";
import { analyzeImages, getHealth, type HealthInfo } from "./api";
import { loadPdf, renderPageToImage, type PdfDoc, type RenderedPage } from "./pdf";
import { downloadCsv } from "./export";
import type { Takeoff } from "./types";
import ResultEditor from "./components/ResultEditor";

interface SetItem {
  page: number;
  label: string;
}

const LABELS = ["平面図", "天井伏図", "仕上表", "建具表", "断面図", "立面図", "詳細図", "特記仕様書"];

export default function App() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [page, setPage] = useState<RenderedPage | null>(null);
  const [hint, setHint] = useState("");
  const [set, setSet] = useState<SetItem[]>([]);
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
    setPage(await renderPageToImage(d, idx));
    setStatus("");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("PDFを読み込み中…");
    setTakeoff(null);
    setSet([]);
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
    if (!doc || idx < 1 || idx > numPages || busy) return;
    setPageIndex(idx);
    setBusy(true);
    try {
      await showPage(doc, idx);
    } finally {
      setBusy(false);
    }
  };

  const addCurrentPage = () => {
    if (set.some((s) => s.page === pageIndex)) return;
    setSet((s) => [...s, { page: pageIndex, label: "" }].sort((a, b) => a.page - b.page));
  };
  const removeFromSet = (pg: number) => setSet((s) => s.filter((x) => x.page !== pg));
  const clearSet = () => setSet([]);
  const setLabel = (pg: number, label: string) =>
    setSet((s) => s.map((x) => (x.page === pg ? { ...x, label } : x)));

  const analyze = async () => {
    if (!doc) return;
    // 解析セットがあればそれを、無ければ現在ページを対象に
    const targets: SetItem[] = set.length > 0 ? set : [{ page: pageIndex, label: "" }];
    setBusy(true);
    setTakeoff(null);
    try {
      setStatus(`図面を準備中…（${targets.length}枚）`);
      const images = [];
      for (const t of targets) {
        // 小縮尺の寸法文字も読めるよう、Claudeの高解像度上限(長辺2576px)で描画
        const img = await renderPageToImage(doc, t.page, 2576);
        images.push({ base64: img.base64, mediaType: img.mediaType, label: t.label, page: t.page });
      }
      setStatus(`AIが${targets.length}枚の図面を読み取り中…（枚数に応じて1〜3分ほど）`);
      const res = await analyzeImages(images, hint);
      setTakeoff(res.takeoff);
      setIsMock(res.mock);
      setStatus(
        res.mock
          ? "サンプル表示中（APIキー未設定）。"
          : `AI拾い完了（${res.model} / ${targets.length}枚）${res.usage ? ` / 入力${res.usage.input_tokens ?? "?"}・出力${res.usage.output_tokens ?? "?"}トークン` : ""}`
      );
    } catch (err) {
      setStatus(`解析エラー: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const inSet = set.some((s) => s.page === pageIndex);
  const analyzeLabel = set.length > 0 ? `解析セット（${set.length}枚）をAIで拾う` : "このページをAIで拾う";

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
                <button className={inSet ? "in-set" : ""} disabled={inSet} onClick={addCurrentPage} title="このページを解析セットに追加">
                  {inSet ? "✓ 追加済" : "＋解析に追加"}
                </button>
                <span className="grow" />
                <button className="primary" disabled={busy} onClick={analyze}>{analyzeLabel}</button>
              </div>

              {set.length > 0 && (
                <div className="set-bar">
                  <div className="set-title">
                    解析セット {set.length}枚（複数図面を相互参照して拾います）
                    <button className="clear-set" onClick={clearSet}>全消去</button>
                    {set.length > 10 && (
                      <span className="too-many">⚠ 枚数が多すぎます。関連図面だけ（目安5〜8枚）に絞ってください</span>
                    )}
                  </div>
                  {set.map((s) => (
                    <div className="set-item" key={s.page}>
                      <span className="pg">p.{s.page}</span>
                      <input
                        list="label-list"
                        className="label-input"
                        placeholder="種別（平面図/仕上表/建具表…）"
                        value={s.label}
                        onChange={(e) => setLabel(s.page, e.target.value)}
                      />
                      <button onClick={() => removeFromSet(s.page)}>✕</button>
                    </div>
                  ))}
                  <datalist id="label-list">
                    {LABELS.map((l) => <option key={l} value={l} />)}
                  </datalist>
                  <div className="hint">※ 枚数が多いほど精度は上がりますが、解析時間と料金も増えます（目安5〜8枚）。</div>
                </div>
              )}

              <div className="hint-row">
                <input
                  className="hint-input"
                  placeholder="補足（任意）：例『縮尺1/300。壁下地はスラブまで、ボードは天井下まで。仕上表p.5、建具表p.8』"
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
              <span className="hint">平面図・天井伏図・建具表・仕上表・断面図などを読み取ります。</span>
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
              関連する図面（平面図・仕上表・建具表・断面 等）を
              <br />
              <strong>「＋解析に追加」</strong>でまとめてから
              <br />
              <strong>「解析セットをAIで拾う」</strong>を押すと、相互参照して拾います。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
