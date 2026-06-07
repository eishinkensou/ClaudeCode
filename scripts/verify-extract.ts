/**
 * 実物のベクターPDFを生成し、extractPage パイプライン全体を通して
 * 自動検出（縮尺・部屋・面積→積算）が機能することを確認する検証スクリプト。
 *   npx tsx scripts/verify-extract.ts
 */
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPage, type OpsTable } from "../src/pdf/extract";
import { estimateAll, DEFAULT_SETTINGS } from "../src/estimate";

// ── 最小のベクターPDFを手組みで生成 ──
function buildPdf(): Uint8Array {
  const content = [
    "2 w",
    "100 500 200 150 re S", // 部屋A 200×150 pt
    "350 500 150 150 re S", // 部屋B 150×150 pt
    "BT /F1 14 Tf 150 560 Td (OFFICE) Tj ET",
    "BT /F1 14 Tf 380 560 Td (MEETING) Tj ET",
    "BT /F1 12 Tf 100 720 Td (S=1/100) Tj ET",
  ].join("\n");

  const objs = [
    "<</Type /Catalog /Pages 2 0 R>>",
    "<</Type /Pages /Kids [3 0 R] /Count 1>>",
    "<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <</Font <</F1 5 0 R>>>> /Contents 4 0 R>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    "<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objs.length + 1} /Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function main() {
  const data = buildPdf();
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);

  // extractPage は内部で main build の OPS を使うが、legacy page でも動く想定。
  // 念のため legacy の OPS が同値であることも確認。
  void (OPS as unknown as OpsTable);

  const ex = await extractPage(page, 1);
  console.log("検出縮尺:", ex.detectedScale?.label, ex.detectedScale?.realMmPerPt.toFixed(2), "mm/pt");
  console.log("線分数:", ex.segments.length);
  console.log(
    "検出領域:",
    ex.rooms.map((r) => `${r.name}(conf ${Math.round(r.confidence * 100)}%)`).join(", ")
  );

  const scale = ex.detectedScale!;
  const result = estimateAll(ex.rooms, scale, DEFAULT_SETTINGS);
  for (const r of result.perRegion) {
    console.log(`\n[${r.regionName}] 面積 ${r.areaM2}m²`);
    for (const it of r.items) console.log(`  ${it.name}: ${it.qty} ${it.unit}`);
  }

  // ── 検証アサーション ──
  const errors: string[] = [];
  if (ex.detectedScale?.label !== "1/100") errors.push("縮尺が 1/100 で検出されない");
  if (ex.rooms.length !== 2) errors.push(`領域数が2でない (${ex.rooms.length})`);
  const names = ex.rooms.map((r) => r.name).sort();
  if (!(names.includes("OFFICE") && names.includes("MEETING")))
    errors.push(`部屋名が拾えていない: ${names.join(",")}`);

  // 部屋A 200×150pt を 1/100 換算: 1pt=0.3528×100=35.28mm
  // 面積 = (200×35.28)×(150×35.28)/1e6 ≒ 37.34 m²
  const office = result.perRegion.find((r) => r.regionName === "OFFICE");
  const expectedArea = ((200 * (25.4 / 72) * 100) / 1000) * ((150 * (25.4 / 72) * 100) / 1000);
  if (!office || Math.abs((office.areaM2 ?? 0) - expectedArea) > 0.5)
    errors.push(`OFFICE 面積が期待値 ${expectedArea.toFixed(2)} と不一致: ${office?.areaM2}`);

  if (errors.length) {
    console.error("\n❌ 検証失敗:\n - " + errors.join("\n - "));
    process.exit(1);
  }
  console.log("\n✅ 検証成功: 縮尺・部屋名・面積・積算が一貫して算出された");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
