import { useEffect, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { Point, Region } from "../types";
import { renderPage, type PdfPage } from "../pdf/loader";

export type ViewerMode = "select" | "calibrate" | "draw-ceiling" | "draw-wall";

interface Props {
  page: PdfPage;
  renderScale: number;
  regions: Region[];
  mode: ViewerMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewport: (vp: PageViewport) => void;
  onCalibrate: (a: Point, b: Point) => void;
  onAddRegion: (poly: Point[], isWall: boolean) => void;
}

const kindColor: Record<string, string> = {
  ceiling: "#2563eb",
  wall: "#dc2626",
  board: "#059669",
};

export default function PdfViewer(props: Props) {
  const { page, renderScale, regions, mode, selectedId } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const [firstPt, setFirstPt] = useState<Point | null>(null); // calibrate / wall の1点目（画面座標）

  // ページ描画
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPage(page, canvas, renderScale).then((viewport) => {
      if (cancelled) return;
      setVp(viewport);
      props.onViewport(viewport);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, renderScale]);

  const toPdf = (sx: number, sy: number): Point => {
    if (!vp) return { x: sx, y: sy };
    const [x, y] = vp.convertToPdfPoint(sx, sy);
    return { x, y };
  };
  const toScreen = (p: Point): [number, number] => {
    if (!vp) return [p.x, p.y];
    const [x, y] = vp.convertToViewportPoint(p.x, p.y);
    return [x, y];
  };

  const localXY = (e: React.MouseEvent): Point => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.MouseEvent) => {
    const p = localXY(e);
    if (mode === "draw-ceiling") {
      setDrag({ start: p, end: p });
    } else if (mode === "calibrate" || mode === "draw-wall") {
      if (!firstPt) {
        setFirstPt(p);
      } else {
        const a = toPdf(firstPt.x, firstPt.y);
        const b = toPdf(p.x, p.y);
        if (mode === "calibrate") props.onCalibrate(a, b);
        else props.onAddRegion([a, b], true);
        setFirstPt(null);
      }
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (mode === "draw-ceiling" && drag) {
      setDrag({ ...drag, end: localXY(e) });
    } else if ((mode === "calibrate" || mode === "draw-wall") && firstPt) {
      setDrag({ start: firstPt, end: localXY(e) });
    }
  };

  const onUp = (e: React.MouseEvent) => {
    if (mode === "draw-ceiling" && drag) {
      const end = localXY(e);
      const x1 = Math.min(drag.start.x, end.x);
      const y1 = Math.min(drag.start.y, end.y);
      const x2 = Math.max(drag.start.x, end.x);
      const y2 = Math.max(drag.start.y, end.y);
      if (x2 - x1 > 6 && y2 - y1 > 6) {
        const poly = [
          toPdf(x1, y1),
          toPdf(x2, y1),
          toPdf(x2, y2),
          toPdf(x1, y2),
        ];
        props.onAddRegion(poly, false);
      }
      setDrag(null);
    }
  };

  const cursor =
    mode === "select" ? "default" : mode === "calibrate" ? "crosshair" : "crosshair";

  const w = vp?.width ?? 0;
  const h = vp?.height ?? 0;

  return (
    <div className="canvas-wrap" style={{ width: w, height: h }}>
      <canvas ref={canvasRef} />
      <svg
        className="overlay"
        width={w}
        height={h}
        style={{ cursor }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
      >
        {vp &&
          regions.map((r) => {
            const pts = r.polygon.map(toScreen);
            const color = kindColor[r.kind];
            const selected = r.id === selectedId;
            if (r.kind === "wall" && r.polygon.length === 2) {
              const [a, b] = pts;
              return (
                <g key={r.id} onClick={() => props.onSelect(r.id)}>
                  <line
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                    stroke={color}
                    strokeWidth={selected ? 5 : 3}
                    strokeOpacity={0.85}
                  />
                </g>
              );
            }
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + "Z";
            return (
              <g key={r.id} onClick={() => props.onSelect(r.id)} style={{ cursor: "pointer" }}>
                <path
                  d={d}
                  fill={color}
                  fillOpacity={selected ? 0.28 : 0.14}
                  stroke={color}
                  strokeWidth={selected ? 2.5 : 1.5}
                />
                {pts[0] && (
                  <text x={pts[0][0] + 4} y={pts[0][1] + 14} fontSize={12} fill={color} fontWeight={600}>
                    {r.name}
                  </text>
                )}
              </g>
            );
          })}

        {/* 作図中のプレビュー */}
        {drag && mode === "draw-ceiling" && (
          <rect
            x={Math.min(drag.start.x, drag.end.x)}
            y={Math.min(drag.start.y, drag.end.y)}
            width={Math.abs(drag.end.x - drag.start.x)}
            height={Math.abs(drag.end.y - drag.start.y)}
            fill="#2563eb"
            fillOpacity={0.2}
            stroke="#2563eb"
            strokeDasharray="4 3"
          />
        )}
        {drag && (mode === "calibrate" || mode === "draw-wall") && firstPt && (
          <line
            x1={drag.start.x}
            y1={drag.start.y}
            x2={drag.end.x}
            y2={drag.end.y}
            stroke={mode === "calibrate" ? "#b45309" : "#dc2626"}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}
