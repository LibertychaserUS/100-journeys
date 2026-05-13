import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const fallbackRoot = path.resolve(path.dirname(scriptPath), "../..");
const root = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : fallbackRoot;
const csvPath = path.join(root, "docs/generated/app-test-cases.csv");
const sampleCsvPath = path.join(root, "docs/generated/sample-journeys.csv");
const outputPath = path.join(root, "app.xlsx");
const stableTimestamp = "2026-05-14T00:00:00.000Z";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function countBy(rows, index) {
  const counts = new Map();
  for (const row of rows) {
    const key = row[index] || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => stableCompare(a[0], b[0]));
}

function stableCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function cellXml(value, rowIndex, colIndex, isHeader = false) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;
  const style = isHeader ? ' s="1"' : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xml(value)}</t></is></c>`;
}

function sheetXml(rows, { mergeTitle = false } = {}) {
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  const cols = Array.from({ length: maxColumns }, (_, index) => {
    const col = index + 1;
    return `<col min="${col}" max="${col}" width="${index === 0 ? 32 : 24}" customWidth="1"/>`;
  }).join("");
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: maxColumns }, (_, colIndex) => {
      const value = row[colIndex] ?? "";
      return cellXml(value, rowIndex, colIndex, rowIndex === 0 || rowIndex === 2);
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const merges = mergeTitle ? '<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  ${merges}
</worksheet>`;
}

function workbookXml(sheetNames) {
  const sheets = sheetNames.map((name, index) =>
    `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRels(sheetNames) {
  const sheetRels = sheetNames.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function contentTypes(sheetNames) {
  const sheetOverrides = sheetNames.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetOverrides}
</Types>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" applyFont="1" applyFill="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function coreProps() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>100 Journeys Test Cases</dc:title>
  <dc:creator>100 Journeys docs generator</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${stableTimestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${stableTimestamp}</dcterms:modified>
</cp:coreProperties>`;
}

function appProps(sheetNames) {
  const titles = sheetNames.map((name) => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>100 Journeys</Application>
  <TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts>
</Properties>`;
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp() {
  const date = new Date(stableTimestamp);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosTimestamp();

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(time, 12);
    directory.writeUInt16LE(day, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, ...central, end]);
}

const csvText = await fs.readFile(csvPath, "utf8");
const sampleCsvText = await fs.readFile(sampleCsvPath, "utf8");
const sourceRows = parseCsv(csvText);
const sampleRows = parseCsv(sampleCsvText);
const [headers, ...cases] = sourceRows;
const [sampleHeaders, ...samples] = sampleRows;
const typeCounts = countBy(cases, headers.indexOf("Category"));

const summaryRows = [
  ["100种不可思议的旅行 - 测试用例总览"],
  [],
  ["指标", "值", "", "类别", "数量"],
  ["测试用例总数", cases.length, "", typeCounts[0]?.[0] ?? "", typeCounts[0]?.[1] ?? ""],
  ["样例旅程总数", samples.length, "", "", ""],
  ["来源", "docs/generated/app-test-cases.csv", "", typeCounts[1]?.[0] ?? "", typeCounts[1]?.[1] ?? ""],
  ["样例数据来源", "docs/generated/sample-journeys.csv", "", typeCounts[2]?.[0] ?? "", typeCounts[2]?.[1] ?? ""],
  ["生成方式", "由代码路由、schema、seed、测试文件生成后汇总", "", typeCounts[3]?.[0] ?? "", typeCounts[3]?.[1] ?? ""],
  ["适用分支", "codex/tencent-cloud-deploy -> main", "", typeCounts[4]?.[0] ?? "", typeCounts[4]?.[1] ?? ""],
];

const verificationRows = [
  ["验证项", "命令或证据", "当前状态"],
  ["生成图表/矩阵", "python3 scripts/docs/generate_project_artifacts.py", "通过，docs/generated/* 已生成"],
  ["Go 单元/集成测试", "go test ./...", "通过"],
  ["Go vet", "go vet ./...", "通过"],
  ["JS 语法检查", "find web/js -name '*.js' -exec node --check {} \\;", "通过"],
  ["Go stress", "go test -tags stress ./tests/stress -run TestStress -count=1 -timeout=360s", "目标组合档通过：ok .../tests/stress 1.660s"],
  ["Nginx 本地代理", "nginx -t / curl /api/health / curl -I static assets", "通过，详见 docs/ops/LOAD_TEST_RESULTS.md"],
  ["本地一键部署", "scripts/deploy/local-one-click.sh", "初始化 SQLite、演示用户、管理员并自动选择空闲端口"],
  ["k6 负载脚本", "tests/load/*.k6.js", "基线通过，auth/admin 重压边界已记录"],
  ["浏览器视觉审查", "tmp/visual-review/*.png", "已捕获桌面/移动、用户页、充值页和后台页；22 张截图，0 破图/溢出/控制台错误"],
  ["Playwright E2E", "cd e2e && npx playwright test", "通过，29/29"],
  ["CI/CD", ".github/workflows/ci.yml", "workflow 已新增，远端运行待 push 后确认"],
];

const sheetNames = ["Summary", "Test Cases", "Seed Samples", "Verification"];
const entries = [
  ["[Content_Types].xml", contentTypes(sheetNames)],
  ["_rels/.rels", rootRels()],
  ["docProps/core.xml", coreProps()],
  ["docProps/app.xml", appProps(sheetNames)],
  ["xl/workbook.xml", workbookXml(sheetNames)],
  ["xl/_rels/workbook.xml.rels", workbookRels(sheetNames)],
  ["xl/styles.xml", stylesXml()],
  ["xl/worksheets/sheet1.xml", sheetXml(summaryRows, { mergeTitle: true })],
  ["xl/worksheets/sheet2.xml", sheetXml([headers, ...cases])],
  ["xl/worksheets/sheet3.xml", sheetXml([sampleHeaders, ...samples])],
  ["xl/worksheets/sheet4.xml", sheetXml(verificationRows)],
];

await fs.writeFile(outputPath, zip(entries));
console.log(outputPath);
