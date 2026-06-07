import type { BoardType } from "../types";

interface Props {
  boardTypes: BoardType[];
  onChange: (next: BoardType[]) => void;
}

let uid = 0;
const nid = () => `bt${Date.now().toString(36)}${uid++}`;

export default function BoardTypesPanel({ boardTypes, onChange }: Props) {
  return (
    <div className="panel">
      <div className="section-title">ボード種類マスター</div>
      <p className="hint">
        ここで登録した種類を、各室の天井ボード・壁ボードで選択します。種類別に面積が集計されます。
      </p>
      {boardTypes.map((b, i) => (
        <div className="fld" key={b.id}>
          <input
            className="grow"
            value={b.name}
            onChange={(e) => {
              const next = [...boardTypes];
              next[i] = { ...b, name: e.target.value };
              onChange(next);
            }}
          />
          <button onClick={() => onChange(boardTypes.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...boardTypes, { id: nid(), name: "新しいボード" }])}>
        ＋種類を追加
      </button>
    </div>
  );
}
