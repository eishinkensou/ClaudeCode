import { useCallback, useMemo, useRef, useState } from "react";
import type { EstimateSettings, Point, Region, Scale } from "./types";
import { loadPdf, type PdfDocument, type PdfPage } from "./pdf/loader";
import {
  extractPage,
  scaleFromDenominator,
  scaleFromTwoPoints,
} from "./pdf/extract";
import { estimateAll, DEFAULT_SETTINGS } from "./estimate";
import { downloadCsv } from "./export/csv";
import PdfViewer, { type ViewerMode } from "./components/PdfViewer";
import RoomList from "./components/RoomList";
import SettingsPanel from "./components/SettingsPanel";
import ResultsTable from "./components/ResultsTable";

let seq = 0;
const newId = () => `m${Date.now().toString(36)}_${seq++}`;

type Tab = "regions" | "settings" | "results";

export default function App() {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [page, setPage] = useState<PdfPage | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [scale, setScale] = useState<Scale>(scaleFromDenominator(100));
  const [settings, setSettings] = useState<EstimateSettings>(DEFAULT_SETTINGS);
  const [renderScale, setRenderScale] = useState(1.3);
  const [mode, setMode] = useState<ViewerMode>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("regions");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const result = useMemo(
    () => estimateAll(regions, scale, settings),
    [regions, scale, settings]
  );

  const loadAndExtract = useCallback(
    async (document: PdfDocument, idx: number, autoScale: boolean) => {
      setBusy(true);
      try {
        const p = await document.getPage(idx);
        setPage(p);
        const ex = await extractPage(p, idx);
        setRegions(ex.rooms);
        setSelectedId(null);
        setMode("select");
        if (autoScale) {
          if (ex.detectedScale) {
            setScale(ex.detectedScale);
            setStatus(
              `自動検出: 縮尺 ${ex.detectedScale.label}、領域 ${ex.rooms.length}件、線分 ${ex.segments.length}本`
            );
          } else {
            setStatus(
              `領域 ${ex.rooms.length}件を検出（縮尺は未検出のため要校正）。線分 ${ex.segments.length}本`
            );
          }
        } else {
          setStatus(`ページ${idx}: 領域 ${ex.rooms.length}件を検出`);
        }
      } catch (e) {
        setStatus(`解析エラー: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("読み込み中…");
    try {
      const buf = await file.arrayBuffer();
      const d = await loadPdf(buf);
      setDoc(d);
      setNumPages(d.numPages);
      setPageIndex(1);
      await loadAndExtract(d, 1, true);
    } catch (err) {
      setStatus(`PDF読み込み失敗: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const gotoPage = async (idx: number) => {
    if (!doc || idx < 1 || idx > numPages) return;
    setPageIndex(idx);
    await loadAndExtract(doc, idx, false);
  };

  const updateRegion = (id: string, patch: Partial<Region>) =>
    setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRegion = (id: string) =>
    setRegions((rs) => rs.filter((r) => r.id !== id));

  const addRegion = (poly: Point[], isWall: boolean) => {
    const r: Region = {
      id: newId(),
      name: isWall ? `壁${regions.length + 1}` : `領域${regions.length + 1}`,
      kind: isWall ? "wall" : "ceiling",
      polygon: poly,
      segments: isWall ? [{ a: poly[0], b: poly[1] }] : undefined,
      confidence: 1,
      source: "manual",
    };
    setRegions((rs) => [...rs, r]);
    setSelectedId(r.id);
    setMode("select");
    setTab("regions");
  };

  const onCalibrate = (a: Point, b: Point) => {
    const input = window.prompt("この2点間の実寸法を mm で入力してください", "1000");
    if (!input) {
      setMode("select");
      return;
    }
    const mm = Number(input);
    if (mm > 0) {
      setScale(scaleFromTwoPoints(a, b, mm));
      setStatus(`2点校正で縮尺を設定しました（${mm}mm）`);
    }
    setMode("select");
  };

  const setDenom = (denom: number) => {
    if (denom > 0) setScale(scaleFromDenominator(denom));
  };

  const hasDoc = !!doc && !!page;

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">軽天積算</span>
        <button className="primary" onClick={() => fileRef.current?.click()}>
          PDFを開く
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={onFile}
        />

        {hasDoc && (
          <>
            <div className="sep" />
            <div className="group">
              <button disabled={pageIndex <= 1} onClick={() => gotoPage(pageIndex - 1)}>
                ◀
              </button>
              <span>
                {pageIndex} / {numPages}
              </span>
              <button disabled={pageIndex >= numPages} onClick={() => gotoPage(pageIndex + 1)}>
                ▶
              </button>
            </div>

            <div className="sep" />
            <div className="group">
              <button onClick={() => setRenderScale((s) => Math.max(0.4, s - 0.2))}>－</button>
              <span>{Math.round(renderScale * 100)}%</span>
              <button onClick={() => setRenderScale((s) => Math.min(4, s + 0.2))}>＋</button>
            </div>

            <div className="sep" />
            <div className="group">
              <span className="hint">縮尺</span>
              <span>{scale.label}</span>
              <span className="hint">1/</span>
              <input
                type="number"
                style={{ width: 64 }}
                defaultValue={100}
                onBlur={(e) => setDenom(Number(e.target.value))}
                title="縮尺分母を入力（PDFが正寸の場合）"
              />
              <button
                className={mode === "calibrate" ? "active" : ""}
                onClick={() => setMode(mode === "calibrate" ? "select" : "calibrate")}
                title="既知寸法の2点をクリックして校正"
              >
                2点校正
              </button>
            </div>

            <div className="sep" />
            <div className="group">
              <button
                className={mode === "draw-ceiling" ? "active" : ""}
                onClick={() => setMode(mode === "draw-ceiling" ? "select" : "draw-ceiling")}
              >
                天井を描く
              </button>
              <button
                className={mode === "draw-wall" ? "active" : ""}
                onClick={() => setMode(mode === "draw-wall" ? "select" : "draw-wall")}
              >
                壁を描く
              </button>
              <button onClick={() => doc && loadAndExtract(doc, pageIndex, true)}>
                再自動検出
              </button>
            </div>

            <span className="spacer" />
            <button
              className="primary"
              disabled={regions.length === 0}
              onClick={() => downloadCsv(result)}
            >
              CSV出力
            </button>
          </>
        )}
      </div>

      {mode === "calibrate" && (
        <div className="calibrate-bar">
          ⚠ 校正モード: 図面上で<strong>既知寸法の2点</strong>をクリックしてください。
          <button onClick={() => setMode("select")}>キャンセル</button>
        </div>
      )}
      {(mode === "draw-ceiling" || mode === "draw-wall") && (
        <div className="banner info">
          {mode === "draw-ceiling"
            ? "天井作図: ドラッグで矩形を描いてください。"
            : "壁作図: 始点と終点を順にクリックしてください。"}
        </div>
      )}
      {status && <div className="banner info">{status}</div>}

      <div className="main">
        <div className="viewer">
          {hasDoc ? (
            <PdfViewer
              page={page!}
              renderScale={renderScale}
              regions={regions}
              mode={mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onViewport={() => {}}
              onCalibrate={onCalibrate}
              onAddRegion={addRegion}
            />
          ) : (
            <div className="empty" style={{ marginTop: 80 }}>
              {busy ? "処理中…" : "「PDFを開く」から図面を読み込んでください。"}
              <br />
              <span className="hint">
                ベクター（CADエクスポート）PDFで自動検出の精度が高くなります。
              </span>
            </div>
          )}
        </div>

        <div className="sidebar">
          <div className="tabbar">
            <button className={tab === "regions" ? "active" : ""} onClick={() => setTab("regions")}>
              領域
            </button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
              仕様設定
            </button>
            <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>
              積算結果
            </button>
          </div>

          {tab === "regions" && (
            <RoomList
              regions={regions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateRegion}
              onDelete={deleteRegion}
            />
          )}
          {tab === "settings" && (
            <SettingsPanel settings={settings} onChange={setSettings} />
          )}
          {tab === "results" && <ResultsTable result={result} />}
        </div>
      </div>
    </div>
  );
}
