import type { EstimateSettings } from "../types";

interface Props {
  settings: EstimateSettings;
  onChange: (next: EstimateSettings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const num = (
    section: keyof EstimateSettings,
    key: string,
    value: number
  ) =>
    onChange({
      ...settings,
      [section]: { ...settings[section], [key]: value },
    });

  const Row = (p: {
    label: string;
    section: keyof EstimateSettings;
    field: string;
    value: number;
    step?: number;
    suffix?: string;
  }) => (
    <>
      <label>{p.label}</label>
      <span>
        <input
          type="number"
          step={p.step ?? 1}
          value={p.value}
          onChange={(e) => num(p.section, p.field, Number(e.target.value))}
        />{" "}
        {p.suffix}
      </span>
    </>
  );

  return (
    <div className="panel">
      <div className="spec-grid">
        <div className="grp">天井（軽天）</div>
        <Row label="野縁ピッチ" section="ceiling" field="noburiPitchMm" value={settings.ceiling.noburiPitchMm} suffix="mm" />
        <Row label="野縁受けピッチ" section="ceiling" field="noburiUkePitchMm" value={settings.ceiling.noburiUkePitchMm} suffix="mm" />
        <Row label="吊りボルトピッチ" section="ceiling" field="hangerPitchMm" value={settings.ceiling.hangerPitchMm} suffix="mm" />
        <Row label="定尺材長さ" section="ceiling" field="barLengthMm" value={settings.ceiling.barLengthMm} suffix="mm" />
        <Row label="ロス率" section="ceiling" field="wasteRatio" value={settings.ceiling.wasteRatio} step={0.01} suffix="(0.05=5%)" />

        <div className="grp">間仕切壁（LGS）</div>
        <Row label="スタッドピッチ" section="wall" field="studPitchMm" value={settings.wall.studPitchMm} suffix="mm" />
        <Row label="振れ止め段ピッチ" section="wall" field="braceRowPitchMm" value={settings.wall.braceRowPitchMm} suffix="mm" />
        <Row label="スペーサーピッチ" section="wall" field="spacerPitchMm" value={settings.wall.spacerPitchMm} suffix="mm" />
        <Row label="標準階高" section="wall" field="defaultHeightMm" value={settings.wall.defaultHeightMm} suffix="mm" />
        <Row label="定尺材長さ" section="wall" field="barLengthMm" value={settings.wall.barLengthMm} suffix="mm" />
        <Row label="ロス率" section="wall" field="wasteRatio" value={settings.wall.wasteRatio} step={0.01} suffix="(0.05=5%)" />

        <div className="grp">ボード</div>
        <Row label="幅" section="board" field="widthMm" value={settings.board.widthMm} suffix="mm" />
        <Row label="長さ" section="board" field="lengthMm" value={settings.board.lengthMm} suffix="mm" />
        <Row label="壁の面数" section="board" field="layers" value={settings.board.layers} suffix="(両面=2)" />
        <Row label="ビス本数/枚" section="board" field="screwsPerBoard" value={settings.board.screwsPerBoard} suffix="本" />
        <Row label="ロス率" section="board" field="wasteRatio" value={settings.board.wasteRatio} step={0.01} suffix="(0.1=10%)" />
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        ※ 初期値は一般的な標準仕様です。確定積算では物件の仕様書に合わせて調整してください。
      </p>
    </div>
  );
}
