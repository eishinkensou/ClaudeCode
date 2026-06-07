import type { BoardArea, Opening, Room, Takeoff, WallBoard } from "../types";
import { computeTotals } from "../totals";
import { roomColor } from "../colors";

interface Props {
  takeoff: Takeoff;
  onChange: (t: Takeoff) => void;
  onExport: () => void;
  selectedRoom?: number | null;
  onLocate?: (i: number) => void;
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const num = (v: string) => (v === "" ? 0 : Number(v));

export default function ResultEditor({ takeoff, onChange, onExport, selectedRoom, onLocate }: Props) {
  const totals = computeTotals(takeoff);

  const setRoom = (i: number, patch: Partial<Room>) => {
    const rooms = takeoff.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange({ ...takeoff, rooms });
  };
  const deleteRoom = (i: number) =>
    onChange({ ...takeoff, rooms: takeoff.rooms.filter((_, j) => j !== i) });
  const addRoom = () =>
    onChange({
      ...takeoff,
      rooms: [
        ...takeoff.rooms,
        {
          name: `室${takeoff.rooms.length + 1}`,
          floorAreaM2: 0,
          ceilingTakeoff: true,
          ceilingAreaM2: 0,
          ceilingHeightMm: 2700,
          ceilingBoards: [],
          wallLengthM: 0,
          wallFramingHeightMm: 0,
          wallFramingAreaM2: 0,
          wallBoards: [],
          openings: [],
          openingReinforceM: 0,
          notes: "",
          regionPage: 0,
          bbox: { x: 0, y: 0, w: 0, h: 0 },
        },
      ],
    });

  return (
    <div className="result">
      <div className="result-head">
        <div>
          <span className="chip">{takeoff.drawingType || "図面"}</span>
          <span className="chip">縮尺 {takeoff.scale || "?"}</span>
          <span className={`chip conf-${takeoff.confidence}`}>信頼度 {takeoff.confidence}</span>
        </div>
        <div className="grow" />
        <button onClick={addRoom}>＋室を追加</button>
        <button className="primary" onClick={onExport}>CSV出力</button>
      </div>

      {takeoff.warnings.length > 0 && (
        <div className="warn-box">
          <strong>注意 / 要確認</strong>
          <ul>
            {takeoff.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 合計 */}
      <div className="totals">
        <div className="section-title">合計</div>
        <table className="tbl">
          <tbody>
            <tr><th>天井下地</th><td className="num">{f2(totals.ceilingFramingM2)} m²</td></tr>
            {totals.ceilingBoards.map((b, i) => (
              <tr key={`ct${i}`}><th className="indent">天井ボード {b.type}</th><td className="num">{f2(b.areaM2)} m²</td></tr>
            ))}
            <tr><th>壁下地</th><td className="num">{f2(totals.wallFramingM2)} m²</td></tr>
            {totals.wallBoards.map((b, i) => (
              <tr key={`wt${i}`}><th className="indent">壁ボード {b.type}</th><td className="num">{f2(b.areaM2)} m²</td></tr>
            ))}
            <tr><th>開口補強</th><td className="num">{f2(totals.openingReinforceM)} m</td></tr>
          </tbody>
        </table>
      </div>

      {/* 室別（編集可） */}
      <div className="section-title">室別（AIの下拾い — 確認・修正してください）</div>
      <div className="hint" style={{ marginBottom: 8 }}>各室の色は図面上の色枠と対応。📍で図面の位置へ移動します。</div>
      {takeoff.rooms.map((room, i) => (
        <RoomCard
          key={i}
          room={room}
          color={roomColor(i)}
          selected={i === selectedRoom}
          onLocate={onLocate ? () => onLocate(i) : undefined}
          onChange={(p) => setRoom(i, p)}
          onDelete={() => deleteRoom(i)}
        />
      ))}
    </div>
  );
}

function RoomCard({
  room,
  color,
  selected,
  onLocate,
  onChange,
  onDelete,
}: {
  room: Room;
  color: string;
  selected: boolean;
  onLocate?: () => void;
  onChange: (patch: Partial<Room>) => void;
  onDelete: () => void;
}) {
  const setCeilingBoard = (idx: number, patch: Partial<BoardArea>) =>
    onChange({ ceilingBoards: room.ceilingBoards.map((b, j) => (j === idx ? { ...b, ...patch } : b)) });
  const setWallBoard = (idx: number, patch: Partial<WallBoard>) =>
    onChange({ wallBoards: room.wallBoards.map((b, j) => (j === idx ? { ...b, ...patch } : b)) });
  const setOpening = (idx: number, patch: Partial<Opening>) =>
    onChange({ openings: room.openings.map((o, j) => (j === idx ? { ...o, ...patch } : o)) });

  return (
    <div className="card" style={selected ? { outline: `2px solid ${color}` } : undefined}>
      <div className="card-head">
        <span className="swatch" style={{ background: color }} />
        <input className="room-name" value={room.name} onChange={(e) => onChange({ name: e.target.value })} />
        {onLocate && (
          <button className="locate" onClick={onLocate} title="図面の位置へ" disabled={room.regionPage <= 0}>
            📍図面
          </button>
        )}
        <button className="danger" onClick={onDelete}>削除</button>
      </div>

      <div className="grid2">
        <label>天井面積<input type="number" value={room.ceilingAreaM2} onChange={(e) => onChange({ ceilingAreaM2: num(e.target.value) })} />m²</label>
        <label>天井高<input type="number" value={room.ceilingHeightMm} onChange={(e) => onChange({ ceilingHeightMm: num(e.target.value) })} />mm</label>
        <label>壁延長<input type="number" value={room.wallLengthM} onChange={(e) => onChange({ wallLengthM: num(e.target.value) })} />m</label>
        <label>壁下地高<input type="number" value={room.wallFramingHeightMm} onChange={(e) => onChange({ wallFramingHeightMm: num(e.target.value) })} />mm</label>
        <label>壁下地面積<input type="number" value={room.wallFramingAreaM2} onChange={(e) => onChange({ wallFramingAreaM2: num(e.target.value) })} />m²</label>
        <label>開口補強計<input type="number" value={room.openingReinforceM} onChange={(e) => onChange({ openingReinforceM: num(e.target.value) })} />m</label>
      </div>

      <div className="sub">天井ボード</div>
      {room.ceilingBoards.map((b, j) => (
        <div className="line" key={j}>
          <input className="grow" value={b.type} onChange={(e) => setCeilingBoard(j, { type: e.target.value })} />
          <input type="number" value={b.areaM2} onChange={(e) => setCeilingBoard(j, { areaM2: num(e.target.value) })} />m²
          <button onClick={() => onChange({ ceilingBoards: room.ceilingBoards.filter((_, k) => k !== j) })}>✕</button>
        </div>
      ))}
      <button className="add" onClick={() => onChange({ ceilingBoards: [...room.ceilingBoards, { type: "せっこうボード 9.5mm", areaM2: room.ceilingAreaM2 }] })}>＋天井ボード</button>

      <div className="sub">壁ボード</div>
      {room.wallBoards.map((b, j) => (
        <div className="line" key={j}>
          <input className="grow" value={b.type} onChange={(e) => setWallBoard(j, { type: e.target.value })} />
          <select value={b.faces} onChange={(e) => setWallBoard(j, { faces: Number(e.target.value) })}>
            <option value={1}>片面</option>
            <option value={2}>両面</option>
          </select>
          <input type="number" value={b.areaM2} onChange={(e) => setWallBoard(j, { areaM2: num(e.target.value) })} />m²
          <button onClick={() => onChange({ wallBoards: room.wallBoards.filter((_, k) => k !== j) })}>✕</button>
        </div>
      ))}
      <button className="add" onClick={() => onChange({ wallBoards: [...room.wallBoards, { type: "せっこうボード 12.5mm", faces: 2, areaM2: 0 }] })}>＋壁ボード</button>

      <div className="sub">開口（建具）</div>
      {room.openings.map((o, j) => (
        <div className="line" key={j}>
          <input className="grow" value={o.name} onChange={(e) => setOpening(j, { name: e.target.value })} />
          <select value={o.kind} onChange={(e) => setOpening(j, { kind: e.target.value as Opening["kind"] })}>
            <option value="door">ドア</option>
            <option value="window">窓</option>
            <option value="other">他</option>
          </select>
          <input type="number" title="幅mm" value={o.widthMm} onChange={(e) => setOpening(j, { widthMm: num(e.target.value) })} />
          <input type="number" title="高mm" value={o.heightMm} onChange={(e) => setOpening(j, { heightMm: num(e.target.value) })} />
          <input type="number" title="数" style={{ width: 48 }} value={o.count} onChange={(e) => setOpening(j, { count: num(e.target.value) })} />
          <span className="hint">補強{f2(o.reinforceM)}m</span>
          <button onClick={() => onChange({ openings: room.openings.filter((_, k) => k !== j) })}>✕</button>
        </div>
      ))}
      <button className="add" onClick={() => onChange({ openings: [...room.openings, { name: `建具${room.openings.length + 1}`, kind: "door", widthMm: 900, heightMm: 2000, count: 1, reinforceM: 4.9 }] })}>＋開口</button>

      {room.notes && <div className="notes">📝 {room.notes}</div>}
    </div>
  );
}
