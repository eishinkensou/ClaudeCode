import type {
  AppSettings,
  BoardType,
  CeilingBoardLayer,
  Opening,
  Room,
  Scale,
  Wall,
  WallBoardLayer,
} from "../types";
import { ceilingAreaM2, wallLengthM } from "../estimate";

interface Props {
  rooms: Room[];
  selectedRoomId: string | null;
  scale: Scale;
  settings: AppSettings;
  onSelectRoom: (id: string | null) => void;
  onChangeRoom: (id: string, patch: Partial<Room>) => void;
  onDeleteRoom: (id: string) => void;
  onAddRoom: () => void;
  onGenerateWalls: (id: string) => void;
}

let uid = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${uid++}`;

export default function RoomPanel(props: Props) {
  const { rooms, selectedRoomId, scale, settings } = props;
  const room = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const bt = settings.boardTypes;

  const patch = (p: Partial<Room>) => room && props.onChangeRoom(room.id, p);

  return (
    <div className="panel">
      <div className="row-between">
        <div className="section-title">室一覧（{rooms.length}）</div>
        <button onClick={props.onAddRoom}>＋室を追加</button>
      </div>

      <div className="room-tabs">
        {rooms.map((r) => (
          <button
            key={r.id}
            className={r.id === selectedRoomId ? "room-tab active" : "room-tab"}
            onClick={() => props.onSelectRoom(r.id)}
          >
            {r.name}
            {r.source === "auto" && <span className="dot" title="自動検出" />}
          </button>
        ))}
      </div>

      {!room ? (
        <div className="empty">
          室がありません。PDFを開くと自動検出されます。<br />
          手動なら「天井を描く」で矩形を描くか「＋室を追加」してください。
        </div>
      ) : (
        <div className="room-editor">
          <div className="fld">
            <label>室名</label>
            <input value={room.name} onChange={(e) => patch({ name: e.target.value })} />
            <button className="danger" onClick={() => props.onDeleteRoom(room.id)}>
              室を削除
            </button>
          </div>

          {/* ── 天井 ── */}
          <fieldset>
            <legend>天井</legend>
            <div className="fld">
              <label>
                <input
                  type="checkbox"
                  checked={room.includeCeiling}
                  onChange={(e) => patch({ includeCeiling: e.target.checked })}
                />{" "}
                天井下地を計上
              </label>
            </div>
            <div className="fld">
              <label>天井面積</label>
              {room.polygon.length >= 3 ? (
                <span className="readout">
                  {ceilingAreaM2(room, scale).toFixed(2)} m²
                  <span className="hint"> （図面から自動）</span>
                </span>
              ) : (
                <>
                  <input
                    type="number"
                    step={0.01}
                    value={room.ceilingAreaM2Manual ?? ""}
                    onChange={(e) =>
                      patch({
                        ceilingAreaM2Manual: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  <span className="hint">m²（手入力）</span>
                </>
              )}
            </div>
            <div className="fld">
              <label>天井高</label>
              <input
                type="number"
                placeholder={String(settings.defaultCeilingHeightMm)}
                value={room.ceilingHeightMm ?? ""}
                onChange={(e) =>
                  patch({ ceilingHeightMm: e.target.value ? Number(e.target.value) : undefined })
                }
              />
              <span className="hint">mm</span>
            </div>

            <div className="sub">天井ボード（重ね貼り可）</div>
            {room.ceilingBoards.map((layer, i) => (
              <div className="fld" key={i}>
                <select
                  value={layer.boardTypeId}
                  onChange={(e) => {
                    const next = [...room.ceilingBoards];
                    next[i] = { boardTypeId: e.target.value };
                    patch({ ceilingBoards: next });
                  }}
                >
                  {bt.map((b: BoardType) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    patch({ ceilingBoards: room.ceilingBoards.filter((_, j) => j !== i) })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const layer: CeilingBoardLayer = { boardTypeId: bt[0]?.id ?? "" };
                patch({ ceilingBoards: [...room.ceilingBoards, layer] });
              }}
            >
              ＋天井ボードを追加
            </button>
          </fieldset>

          {/* ── 壁 ── */}
          <fieldset>
            <legend>壁（{room.walls.length}本）</legend>
            <div className="wall-actions">
              <button onClick={() => addWall(room, props, settings)}>＋壁を追加（手入力）</button>
              {room.polygon.length >= 3 && (
                <button onClick={() => props.onGenerateWalls(room.id)}>周長から壁生成</button>
              )}
              <span className="hint">図面上で「壁を描く」でも追加できます</span>
            </div>
            {room.walls.map((wall, i) => (
              <WallCard
                key={wall.id}
                wall={wall}
                index={i}
                scale={scale}
                settings={settings}
                onChange={(w) => {
                  const next = [...room.walls];
                  next[i] = w;
                  patch({ walls: next });
                }}
                onDelete={() => patch({ walls: room.walls.filter((_, j) => j !== i) })}
              />
            ))}
            {room.walls.length === 0 && <div className="hint">壁がありません。</div>}
          </fieldset>

          {/* ── 開口 ── */}
          <fieldset>
            <legend>開口（建具）／開口補強</legend>
            {room.openings.map((op, i) => (
              <OpeningCard
                key={op.id}
                op={op}
                onChange={(o) => {
                  const next = [...room.openings];
                  next[i] = o;
                  patch({ openings: next });
                }}
                onDelete={() => patch({ openings: room.openings.filter((_, j) => j !== i) })}
              />
            ))}
            <button
              onClick={() => {
                const op: Opening = {
                  id: nid("op"),
                  name: `建具${room.openings.length + 1}`,
                  kind: "door",
                  widthMm: 900,
                  heightMm: room.ceilingHeightMm ?? settings.defaultWallHeightMm,
                  count: 1,
                };
                patch({ openings: [...room.openings, op] });
              }}
            >
              ＋開口を追加
            </button>
            <p className="hint">
              ドア＝2×高さ＋幅、窓＝2×高さ＋2×幅 で補強延長を算出します。
            </p>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function addWall(room: Room, props: Props, settings: AppSettings) {
  const w: Wall = {
    id: nid("w"),
    name: `W${room.walls.length + 1}`,
    lengthMmManual: 3000,
    heightMm: settings.defaultWallHeightMm,
    boards: [],
    includeFraming: true,
  };
  props.onChangeRoom(room.id, { walls: [...room.walls, w] });
}

function WallCard(props: {
  wall: Wall;
  index: number;
  scale: Scale;
  settings: AppSettings;
  onChange: (w: Wall) => void;
  onDelete: () => void;
}) {
  const { wall, scale, settings } = props;
  const set = (p: Partial<Wall>) => props.onChange({ ...wall, ...p });
  const lenM = wallLengthM(wall, scale);
  const bt = settings.boardTypes;

  return (
    <div className="card">
      <div className="fld">
        <input
          className="grow"
          value={wall.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <button onClick={props.onDelete}>✕</button>
      </div>
      <div className="fld">
        <label>延長</label>
        {wall.segment ? (
          <span className="readout">
            {lenM.toFixed(2)} m<span className="hint"> （作図）</span>
          </span>
        ) : (
          <>
            <input
              type="number"
              value={wall.lengthMmManual ?? ""}
              onChange={(e) =>
                set({ lengthMmManual: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <span className="hint">mm（= {lenM.toFixed(2)}m）</span>
          </>
        )}
      </div>
      <div className="fld">
        <label>高さ</label>
        <input
          type="number"
          placeholder={String(settings.defaultWallHeightMm)}
          value={wall.heightMm ?? ""}
          onChange={(e) => set({ heightMm: e.target.value ? Number(e.target.value) : undefined })}
        />
        <span className="hint">mm</span>
      </div>
      <div className="fld">
        <label>
          <input
            type="checkbox"
            checked={wall.includeFraming}
            onChange={(e) => set({ includeFraming: e.target.checked })}
          />{" "}
          壁下地を計上
        </label>
      </div>
      <div className="sub">壁ボード（種類・面数）</div>
      {wall.boards.map((b, i) => (
        <div className="fld" key={i}>
          <select
            value={b.boardTypeId}
            onChange={(e) => {
              const next = [...wall.boards];
              next[i] = { ...b, boardTypeId: e.target.value };
              set({ boards: next });
            }}
          >
            {bt.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={b.faces}
            onChange={(e) => {
              const next = [...wall.boards];
              next[i] = { ...b, faces: Number(e.target.value) };
              set({ boards: next });
            }}
          >
            <option value={1}>片面</option>
            <option value={2}>両面</option>
          </select>
          <button onClick={() => set({ boards: wall.boards.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <button
        onClick={() => {
          const layer: WallBoardLayer = { boardTypeId: bt[0]?.id ?? "", faces: 2 };
          set({ boards: [...wall.boards, layer] });
        }}
      >
        ＋壁ボードを追加
      </button>
    </div>
  );
}

function OpeningCard(props: { op: Opening; onChange: (o: Opening) => void; onDelete: () => void }) {
  const { op } = props;
  const set = (p: Partial<Opening>) => props.onChange({ ...op, ...p });
  return (
    <div className="card">
      <div className="fld">
        <input className="grow" value={op.name} onChange={(e) => set({ name: e.target.value })} />
        <select value={op.kind} onChange={(e) => set({ kind: e.target.value as Opening["kind"] })}>
          <option value="door">ドア</option>
          <option value="window">窓</option>
        </select>
        <button onClick={props.onDelete}>✕</button>
      </div>
      <div className="fld">
        <label>幅</label>
        <input type="number" value={op.widthMm} onChange={(e) => set({ widthMm: Number(e.target.value) })} />
        <label>高さ</label>
        <input type="number" value={op.heightMm} onChange={(e) => set({ heightMm: Number(e.target.value) })} />
        <label>数</label>
        <input
          type="number"
          style={{ width: 56 }}
          value={op.count}
          onChange={(e) => set({ count: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
