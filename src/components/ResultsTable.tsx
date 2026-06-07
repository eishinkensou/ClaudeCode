import type { EstimateResult, RegionKind } from "../types";

interface Props {
  result: EstimateResult;
}

const kindLabel: Record<RegionKind, string> = {
  ceiling: "天井",
  wall: "間仕切壁",
  board: "ボード",
};

export default function ResultsTable({ result }: Props) {
  if (result.perRegion.length === 0) {
    return <div className="empty">領域を登録すると積算結果が表示されます。</div>;
  }
  return (
    <div className="panel">
      <div className="section-title">材料別 合計</div>
      <table className="results">
        <thead>
          <tr>
            <th>材料</th>
            <th>数量</th>
            <th>単位</th>
          </tr>
        </thead>
        <tbody>
          {result.totals.map((it, i) => (
            <tr key={i}>
              <td>{it.name}</td>
              <td className="num">{it.qty.toLocaleString()}</td>
              <td>{it.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title" style={{ marginTop: 18 }}>
        領域別 明細
      </div>
      {result.perRegion.map((r) => (
        <div className="region-result" key={r.regionId}>
          <h4>
            <span className={`badge ${r.kind}`}>{kindLabel[r.kind]}</span>
            {r.regionName}
            <span className="measure">
              {r.kind === "wall"
                ? `延長 ${r.wallLengthM ?? 0}m`
                : `面積 ${r.areaM2 ?? 0}m²`}
            </span>
          </h4>
          <table className="results">
            <thead>
              <tr>
                <th>材料</th>
                <th>数量</th>
                <th>単位</th>
                <th>根拠</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.name}</td>
                  <td className="num">{it.qty.toLocaleString()}</td>
                  <td>{it.unit}</td>
                  <td className="hint">{it.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
