import type { AppSettings } from "../types";

interface Props {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const set = (p: Partial<AppSettings>) => onChange({ ...settings, ...p });
  return (
    <div className="panel">
      <div className="section-title">既定値・算定設定</div>
      <div className="spec-grid">
        <label>既定の壁高さ</label>
        <span>
          <input
            type="number"
            value={settings.defaultWallHeightMm}
            onChange={(e) => set({ defaultWallHeightMm: Number(e.target.value) })}
          />{" "}
          mm
        </span>
        <label>既定の天井高</label>
        <span>
          <input
            type="number"
            value={settings.defaultCeilingHeightMm}
            onChange={(e) => set({ defaultCeilingHeightMm: Number(e.target.value) })}
          />{" "}
          mm
        </span>
        <label>開口面積の控除</label>
        <span>
          <label>
            <input
              type="checkbox"
              checked={settings.deductOpenings}
              onChange={(e) => set({ deductOpenings: e.target.checked })}
            />{" "}
            壁下地・壁ボードから開口分を差し引く
          </label>
        </span>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        ※ 既定では開口を差し引かない総面積で拾います。仕様に応じて切り替えてください。
        面積拾いにロス率は掛けていません（材料数量へ換算する際に別途見込んでください）。
      </p>
    </div>
  );
}
