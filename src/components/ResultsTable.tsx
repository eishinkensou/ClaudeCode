import type { TakeoffResult, TypedArea } from "../types";

interface Props {
  result: TakeoffResult;
}

const f2 = (n: number) => n.toFixed(2);

function TypedRows({ items, unit = "m²" }: { items: TypedArea[]; unit?: string }) {
  if (items.length === 0) return <span className="hint">―</span>;
  return (
    <>
      {items.map((t, i) => (
        <div key={i} className="typed-row">
          <span className="typed-name">{t.name}</span>
          <span className="typed-val">
            {f2(t.areaM2)} {unit}
          </span>
        </div>
      ))}
    </>
  );
}

export default function ResultsTable({ result }: Props) {
  if (result.rooms.length === 0) {
    return <div className="empty">室を登録すると拾い出し結果が表示されます。</div>;
  }
  const t = result.totals;
  return (
    <div className="panel">
      {/* ── 合計 ── */}
      <div className="section-title">合計</div>
      <table className="results">
        <tbody>
          <tr>
            <th>天井下地</th>
            <td className="num">{f2(t.ceilingFramingAreaM2)} m²</td>
          </tr>
          <tr>
            <th>壁下地</th>
            <td className="num">{f2(t.wallFramingAreaM2)} m²</td>
          </tr>
          <tr>
            <th>開口補強</th>
            <td className="num">{f2(t.openingReinforceM)} m</td>
          </tr>
        </tbody>
      </table>

      <div className="sub2">天井ボード 種類別合計</div>
      <table className="results">
        <tbody>
          {t.ceilingBoards.length === 0 ? (
            <tr>
              <td className="hint">―</td>
            </tr>
          ) : (
            t.ceilingBoards.map((b, i) => (
              <tr key={i}>
                <th>{b.name}</th>
                <td className="num">{f2(b.areaM2)} m²</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="sub2">壁ボード 種類別合計</div>
      <table className="results">
        <tbody>
          {t.wallBoards.length === 0 ? (
            <tr>
              <td className="hint">―</td>
            </tr>
          ) : (
            t.wallBoards.map((b, i) => (
              <tr key={i}>
                <th>{b.name}</th>
                <td className="num">{f2(b.areaM2)} m²</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ── 室別明細 ── */}
      <div className="section-title" style={{ marginTop: 20 }}>
        室別 拾い出し
      </div>
      {result.rooms.map((r) => (
        <div className="room-result" key={r.roomId}>
          <h4>{r.roomName}</h4>

          <div className="rr-line">
            <span className="rr-label">天井下地</span>
            <span className="rr-val">{f2(r.ceilingFramingAreaM2)} m²</span>
            <span className="rr-note">
              {r.ceilingHeightMm ? `天井高 ${r.ceilingHeightMm}mm` : ""}
            </span>
          </div>
          <div className="rr-line">
            <span className="rr-label">天井ボード</span>
            <span className="rr-multi">
              <TypedRows items={r.ceilingBoards} />
            </span>
          </div>

          <div className="rr-line">
            <span className="rr-label">壁下地</span>
            <span className="rr-val">{f2(r.wallFramingAreaM2)} m²</span>
          </div>
          {r.wallDetails.length > 0 && (
            <table className="results sub-table">
              <thead>
                <tr>
                  <th>壁</th>
                  <th>延長</th>
                  <th>高さ</th>
                  <th>下地</th>
                  <th>ボード（根拠）</th>
                </tr>
              </thead>
              <tbody>
                {r.wallDetails.map((w, i) => (
                  <tr key={i}>
                    <td>{w.name}</td>
                    <td className="num">{f2(w.lengthM)}m</td>
                    <td className="num">{f2(w.heightM)}m</td>
                    <td className="num">{f2(w.framingAreaM2)}m²</td>
                    <td className="hint">
                      {w.boards.length === 0
                        ? "―"
                        : w.boards
                            .map(
                              (b) =>
                                `${b.name} ${f2(b.areaM2)}m²(${f2(w.lengthM)}×${f2(
                                  w.heightM
                                )}×${b.faces}面)`
                            )
                            .join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="rr-line">
            <span className="rr-label">壁ボード計</span>
            <span className="rr-multi">
              <TypedRows items={r.wallBoards} />
            </span>
          </div>

          {r.openingDetails.length > 0 && (
            <>
              <div className="rr-line">
                <span className="rr-label">開口補強</span>
                <span className="rr-val">{f2(r.openingReinforceM)} m</span>
              </div>
              <table className="results sub-table">
                <thead>
                  <tr>
                    <th>建具</th>
                    <th>種別</th>
                    <th>幅×高</th>
                    <th>数</th>
                    <th>延長（根拠）</th>
                  </tr>
                </thead>
                <tbody>
                  {r.openingDetails.map((o, i) => (
                    <tr key={i}>
                      <td>{o.name}</td>
                      <td>{o.kind === "door" ? "ドア" : "窓"}</td>
                      <td className="num">
                        {f2(o.widthM)}×{f2(o.heightM)}
                      </td>
                      <td className="num">{o.count}</td>
                      <td className="hint">
                        {f2(o.totalM)}m ＝ {o.formula}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
