import { useCallback, useMemo, useRef, useState } from "react";
import type { AppSettings, Point, Room, Scale, Wall } from "./types";
import { loadPdf, type PdfDocument, type PdfPage } from "./pdf/loader";
import { extractPage, scaleFromDenominator, scaleFromTwoPoints } from "./pdf/extract";
import { takeoffAll, DEFAULT_SETTINGS } from "./estimate";
import { roomColor } from "./colors";
import { downloadCsv } from "./export/csv";
import PdfViewer, { type ViewerMode } from "./components/PdfViewer";
import RoomPanel from "./components/RoomPanel";
import BoardTypesPanel from "./components/BoardTypesPanel";
import SettingsPanel from "./components/SettingsPanel";
import ResultsTable from "./components/ResultsTable";

let seq = 0;
const newId = (p = "m") => `${p}${Date.now().toString(36)}_${seq++}`;
const DEFAULT_SCALE = scaleFromDenominator(100);

type Tab = "rooms" | "boards" | "settings" | "results";

export default function App() {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [page, setPage] = useState<PdfPage | null>(null);
  // 室は全ページ通して保持（room.page でどのページのジオメトリか区別）
  const [rooms, setRooms] = useState<Room[]>([]);
  // 縮尺はページごと
  const [scales, setScales] = useState<Record<number, Scale>>({});
  const [detectedPages, setDetectedPages] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [renderScale, setRenderScale] = useState(1.3);
  const [mode, setMode] = useState<ViewerMode>("select");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rooms");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentScale = scales[pageIndex] ?? DEFAULT_SCALE;

  // 室ごとに自ページの縮尺で拾い出し、全ページ合算
  const result = useMemo(
    () => takeoffAll(rooms, (room) => scales[room.page] ?? DEFAULT_SCALE, settings),
    [rooms, scales, settings]
  );

  const loadPage = useCallback(
    async (document: PdfDocument, idx: number, detect: boolean) => {
      setBusy(true);
      try {
        const p = await document.getPage(idx);
        setPage(p);
        if (detect) {
          const ex = await extractPage(p, idx);
          // このページの室を入れ替え（他ページの室は保持）
          setRooms((prev) => [...prev.filter((r) => r.page !== idx), ...ex.rooms]);
          setScales((prev) => ({ ...prev, [idx]: ex.detectedScale ?? prev[idx] ?? DEFAULT_SCALE }));
          setDetectedPages((prev) => new Set(prev).add(idx));
          setSelectedRoomId(ex.rooms[0]?.id ?? null);
          setStatus(
            ex.detectedScale
              ? `P${idx}: 縮尺 ${ex.detectedScale.label}、室 ${ex.rooms.length}件を検出`
              : `P${idx}: 室 ${ex.rooms.length}件を検出（縮尺は要校正）`
          );
        }
        setMode("select");
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
      setRooms([]);
      setScales({});
      setDetectedPages(new Set());
      await loadPage(d, 1, true);
    } catch (err) {
      setStatus(`PDF読み込み失敗: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const gotoPage = async (idx: number) => {
    if (!doc || idx < 1 || idx > numPages) return;
    setPageIndex(idx);
    await loadPage(doc, idx, !detectedPages.has(idx));
  };

  const redetect = () => doc && loadPage(doc, pageIndex, true);

  // 室を選択（別ページの室ならそのページへ移動）
  const selectRoom = (id: string | null) => {
    setSelectedRoomId(id);
    if (!id) return;
    const r = rooms.find((x) => x.id === id);
    if (r && r.page !== pageIndex) gotoPage(r.page);
  };

  const updateRoom = (id: string, patch: Partial<Room>) =>
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRoom = (id: string) =>
    setRooms((rs) => {
      const next = rs.filter((r) => r.id !== id);
      if (selectedRoomId === id) setSelectedRoomId(next[0]?.id ?? null);
      return next;
    });

  const emptyRoom = (name: string, polygon: Point[]): Room => ({
    id: newId("room"),
    name,
    page: pageIndex,
    color: roomColor(rooms.length),
    polygon,
    ceilingAreaM2Manual: polygon.length >= 3 ? undefined : 0,
    ceilingBoards: [],
    includeCeiling: true,
    walls: [],
    openings: [],
    source: "manual",
    confidence: 1,
  });

  const addRoom = () => {
    const r = emptyRoom(`室${rooms.length + 1}`, []);
    setRooms((rs) => [...rs, r]);
    setSelectedRoomId(r.id);
  };

  const addCeiling = (poly: Point[]) => {
    const r = emptyRoom(`室${rooms.length + 1}`, poly);
    setRooms((rs) => [...rs, r]);
    setSelectedRoomId(r.id);
    setMode("select");
    setTab("rooms");
  };

  const addWall = (a: Point, b: Point) => {
    const wall: Wall = {
      id: newId("w"),
      name: "W?",
      segment: { a, b },
      framingReach: "slab",
      boardReach: "ceiling",
      boards: [],
      includeFraming: true,
    };
    setRooms((rs) => {
      let targetId = selectedRoomId;
      // 選択中の室が他ページなら、当ページに新規室を作る
      const sel = rs.find((r) => r.id === targetId);
      let next = rs;
      if (!sel || sel.page !== pageIndex) {
        const room = emptyRoom(`室${rs.length + 1}`, []);
        next = [...rs, room];
        targetId = room.id;
        setSelectedRoomId(room.id);
      }
      return next.map((r) => {
        if (r.id !== targetId) return r;
        wall.name = `W${r.walls.length + 1}`;
        return { ...r, walls: [...r.walls, wall] };
      });
    });
    setMode("select");
    setTab("rooms");
  };

  const generateWalls = (roomId: string) => {
    setRooms((rs) =>
      rs.map((r) => {
        if (r.id !== roomId || r.polygon.length < 3) return r;
        const walls: Wall[] = r.polygon.map((p, i) => {
          const q = r.polygon[(i + 1) % r.polygon.length];
          return {
            id: newId("w"),
            name: `W${r.walls.length + i + 1}`,
            segment: { a: p, b: q },
            framingReach: "slab" as const,
            boardReach: "ceiling" as const,
            boards: [],
            includeFraming: true,
          };
        });
        return { ...r, walls: [...r.walls, ...walls] };
      })
    );
  };

  const onCalibrate = (a: Point, b: Point) => {
    const input = window.prompt("この2点間の実寸法を mm で入力してください", "1000");
    if (!input) {
      setMode("select");
      return;
    }
    const mm = Number(input);
    if (mm > 0) {
      setScales((prev) => ({ ...prev, [pageIndex]: scaleFromTwoPoints(a, b, mm) }));
      setStatus(`P${pageIndex}: 2点校正で縮尺を設定（${mm}mm）`);
    }
    setMode("select");
  };

  const setDenom = (denom: number) => {
    if (denom > 0) setScales((prev) => ({ ...prev, [pageIndex]: scaleFromDenominator(denom) }));
  };

  const hasDoc = !!doc && !!page;
  const pageRooms = rooms.filter((r) => r.page === pageIndex);

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">軽天拾い出し</span>
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
              <span className="hint">縮尺(P{pageIndex})</span>
              <span>{currentScale.label}</span>
              <span className="hint">1/</span>
              <input
                type="number"
                style={{ width: 60 }}
                defaultValue={100}
                key={pageIndex}
                onBlur={(e) => setDenom(Number(e.target.value))}
                title="このページの縮尺分母（PDFが正寸の場合）"
              />
              <button
                className={mode === "calibrate" ? "active" : ""}
                onClick={() => setMode(mode === "calibrate" ? "select" : "calibrate")}
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
                title="選択中の室に壁を追加します"
              >
                壁を描く
              </button>
              <button onClick={redetect}>再自動検出</button>
            </div>

            <span className="spacer" />
            <span className="hint">全{rooms.length}室</span>
            <button className="primary" disabled={rooms.length === 0} onClick={() => downloadCsv(result)}>
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
      {mode === "draw-ceiling" && <div className="banner info">天井作図: ドラッグで矩形を描いてください（このページの新しい室になります）。</div>}
      {mode === "draw-wall" && (
        <div className="banner info">
          壁作図: 始点と終点をクリック。
          {selectedRoomId ? "選択中の室に追加されます。" : "室が未選択のため新規室を作成します。"}
        </div>
      )}
      {status && <div className="banner info">{status}</div>}

      <div className="main">
        <div className="viewer">
          {hasDoc ? (
            <PdfViewer
              page={page!}
              renderScale={renderScale}
              rooms={pageRooms}
              mode={mode}
              selectedRoomId={selectedRoomId}
              onSelectRoom={selectRoom}
              onCalibrate={onCalibrate}
              onAddCeiling={addCeiling}
              onAddWall={addWall}
            />
          ) : (
            <div className="empty" style={{ marginTop: 80 }}>
              {busy ? "処理中…" : "「PDFを開く」から図面を読み込んでください。"}
              <br />
              <span className="hint">
                天井は天伏図ページ、壁は平面図ページで拾えます（ページをまたいで合算）。
              </span>
            </div>
          )}
        </div>

        <div className="sidebar">
          <div className="tabbar">
            <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>
              室・壁・開口
            </button>
            <button className={tab === "boards" ? "active" : ""} onClick={() => setTab("boards")}>
              ボード種類
            </button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
              設定
            </button>
            <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>
              拾い出し
            </button>
          </div>

          {tab === "rooms" && (
            <RoomPanel
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              currentPage={pageIndex}
              scale={currentScale}
              scales={scales}
              settings={settings}
              onSelectRoom={selectRoom}
              onChangeRoom={updateRoom}
              onDeleteRoom={deleteRoom}
              onAddRoom={addRoom}
              onGenerateWalls={generateWalls}
            />
          )}
          {tab === "boards" && (
            <BoardTypesPanel
              boardTypes={settings.boardTypes}
              onChange={(boardTypes) => setSettings((s) => ({ ...s, boardTypes }))}
            />
          )}
          {tab === "settings" && <SettingsPanel settings={settings} onChange={setSettings} />}
          {tab === "results" && <ResultsTable result={result} />}
        </div>
      </div>
    </div>
  );
}
