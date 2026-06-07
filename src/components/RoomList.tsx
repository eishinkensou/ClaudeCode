import type { Region, RegionKind } from "../types";

interface Props {
  regions: Region[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Region>) => void;
  onDelete: (id: string) => void;
}

const kindLabel: Record<RegionKind, string> = {
  ceiling: "天井",
  wall: "間仕切壁",
  board: "ボードのみ",
};

export default function RoomList({ regions, selectedId, onSelect, onChange, onDelete }: Props) {
  if (regions.length === 0) {
    return (
      <div className="empty">
        領域がありません。<br />
        PDFを開くと自動検出されます。検出されない場合は上部の「天井を描く／壁を描く」で
        手動追加してください。
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="section-title">検出・登録領域（{regions.length}）</div>
      {regions.map((r) => (
        <div
          key={r.id}
          className="region-card"
          style={{
            outline: r.id === selectedId ? "2px solid var(--accent)" : "none",
          }}
          onClick={() => onSelect(r.id)}
        >
          <div className="row">
            <span className={`badge ${r.kind}`}>{kindLabel[r.kind]}</span>
            <input
              className="name-input"
              value={r.name}
              onChange={(e) => onChange(r.id, { name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r.id);
              }}
              title="削除"
            >
              ✕
            </button>
          </div>
          <div className="row">
            <label>種別</label>
            <select
              value={r.kind}
              onChange={(e) => onChange(r.id, { kind: e.target.value as RegionKind })}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="ceiling">天井（軽天）</option>
              <option value="wall">間仕切壁（LGS）</option>
              <option value="board">ボードのみ</option>
            </select>
            {r.source === "auto" && (
              <span className="conf">自動 信頼度{Math.round(r.confidence * 100)}%</span>
            )}
          </div>
          {r.kind === "wall" && (
            <div className="row">
              <label>壁高さ</label>
              <input
                type="number"
                value={r.heightMm ?? ""}
                placeholder="既定値"
                onChange={(e) =>
                  onChange(r.id, {
                    heightMm: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                onClick={(e) => e.stopPropagation()}
              />
              <span className="hint">mm（空欄=設定値）</span>
            </div>
          )}
          {r.kind !== "board" && (
            <div className="row">
              <label>
                <input
                  type="checkbox"
                  checked={r.includeBoard !== false}
                  onChange={(e) => onChange(r.id, { includeBoard: e.target.checked })}
                  onClick={(e) => e.stopPropagation()}
                />{" "}
                ボード貼り共
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
