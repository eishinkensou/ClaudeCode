import { useEffect, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { Point, Room } from "../types";
import { renderPage, type PdfPage } from "../pdf/loader";

export type ViewerMode = "select" | "calibrate" | "draw-ceiling" | "draw-wall";

interface Props {
  page: PdfPage;
  renderScale: number;
  rooms: Room[];
  mode: ViewerMode;
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onCalibrate: (a: Point, b: Point) => void;
  onAddCeiling: (poly: Point[]) => void;
  onAddWall: (a: Point, b: Point) => void;
}

const CEIL = "#2563eb";
const WALL = "#dc2626";

export default function PdfViewer(props: Props) {
  const { page, renderScale, rooms, mode, selectedRoomId } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  const [firstPt, setFirstPt] = useState<Point | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPage(page, canvas, renderScale).then((viewport) => {
      if (!cancelled) setVp(viewport);
    });
    return () => {
      cancelled = true;
    };
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
        else props.onAddWall(a, b);
        setFirstPt(null);
        setDrag(null);
      }
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (mode === "draw-ceiling" && drag) setDrag({ ...drag, end: localXY(e) });
    else if ((mode === "calibrate" || mode === "draw-wall") && firstPt)
      setDrag({ start: firstPt, end: localXY(e) });
  };

  const onUp = (e: React.MouseEvent) => {
    if (mode === "draw-ceiling" && drag) {
      const end = localXY(e);
      const x1 = Math.min(drag.start.x, end.x);
      const y1 = Math.min(drag.start.y, end.y);
      const x2 = Math.max(drag.start.x, end.x);
      const y2 = Math.max(drag.start.y, end.y);
      if (x2 - x1 > 6 && y2 - y1 > 6) {
        props.onAddCeiling([toPdf(x1, y1), toPdf(x2, y1), toPdf(x2, y2), toPdf(x1, y2)]);
      }
      setDrag(null);
    }
  };

  const w = vp?.width ?? 0;
  const h = vp?.height ?? 0;

  return (
    <div className="canvas-wrap" style={{ width: w, height: h }}>
      <canvas ref={canvasRef} />
      <svg
        className="overlay"
        width={w}
        height={h}
        style={{ cursor: mode === "select" ? "default" : "crosshair" }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
      >
        {vp &&
          rooms.map((room) => {
            const selected = room.id === selectedRoomId;
            const pts = room.polygon.map(toScreen);
            const d =
              pts.length >= 3
                ? pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + "Z"
                : "";
            return (
              <g key={room.id} onClick={() => props.onSelectRoom(room.id)} style={{ cursor: "pointer" }}>
                {d && (
                  <path
                    d={d}
                    fill={CEIL}
                    fillOpacity={selected ? 0.26 : 0.12}
                    stroke={CEIL}
                    strokeWidth={selected ? 2.5 : 1.5}
                  />
                )}
                {pts[0] && (
                  <text x={pts[0][0] + 4} y={pts[0][1] + 14} fontSize={12} fill={CEIL} fontWeight={700}>
                    {room.name}
                  </text>
                )}
                {room.walls.map((wall) =>
                  wall.segment ? (
                    <line
                      key={wall.id}
                      x1={toScreen(wall.segment.a)[0]}
                      y1={toScreen(wall.segment.a)[1]}
                      x2={toScreen(wall.segment.b)[0]}
                      y2={toScreen(wall.segment.b)[1]}
                      stroke={WALL}
                      strokeWidth={selected ? 5 : 3.5}
                      strokeOpacity={0.85}
                    />
                  ) : null
                )}
              </g>
            );
          })}

        {drag && mode === "draw-ceiling" && (
          <rect
            x={Math.min(drag.start.x, drag.end.x)}
            y={Math.min(drag.start.y, drag.end.y)}
            width={Math.abs(drag.end.x - drag.start.x)}
            height={Math.abs(drag.end.y - drag.start.y)}
            fill={CEIL}
            fillOpacity={0.2}
            stroke={CEIL}
            strokeDasharray="4 3"
          />
        )}
        {drag && (mode === "calibrate" || mode === "draw-wall") && firstPt && (
          <line
            x1={drag.start.x}
            y1={drag.start.y}
            x2={drag.end.x}
            y2={drag.end.y}
            stroke={mode === "calibrate" ? "#b45309" : WALL}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}
