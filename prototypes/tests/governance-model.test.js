const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Workflow, normalizeHex } = require("../governance-model.js");
const data = require("../governance-data.js");
const create = () => new Workflow(data);
const ready = () => { const m = create(); m.scan(); m.generatePreview(); return m; };
const values = (m, title) => m.draft().find(group => group.title === title).rows.map(item => item.value);

test("steps unlock only after their actual prerequisites", () => {
  const m = create();
  assert.deepEqual([1, 2, 3, 4, 5].map(step => Boolean(m.canStep(step))), [true, false, false, false, false]);
  assert.throws(() => m.generatePreview());
  assert.throws(() => m.bind());
  assert.throws(() => m.applySkin("#123456"));
  m.scan();
  assert.equal(m.canStep(2), true);
  assert.equal(m.canStep(3), false);
  assert.equal(m.canStep(4), false);
  assert.equal(m.canStep(5), false);
  m.generatePreview();
  assert.equal(m.canStep(4), true);
  assert.equal(m.canStep(5), false);
  m.bind();
  assert.equal(m.canStep(5), true);
});

test("fidelity keeps integers and rounds only decimal sizes and radii", () => {
  const m = create();
  assert.equal(values(m, "圆角").length, 25);
  assert.equal(values(m, "字号").length, 11);
  assert.ok(values(m, "圆角").includes(64));
  assert.ok(values(m, "字号").includes(17));
  assert.ok(!values(m, "字号").includes(32));
  m.setPlan("radius", true);
  m.setPlan("type", true);
  assert.deepEqual(values(m, "圆角"), [0, 2, 4, 6, 8, 12, 999]);
  assert.equal(values(m, "字号").length, 8);
  m.setPlan("radius", false);
  assert.equal(values(m, "圆角").length, 25);
});

test("every scanned color is represented without introducing unrelated colors", () => {
  const m = create();
  const actual = new Set(m.tokens().filter(item => item.type === "color").map(item => item.value));
  assert.deepEqual(actual, new Set(data.details.color.chips.map(raw => raw.split(" ")[0])));
});

test("spacing and shadow choices change the draft and execution summary", () => {
  const m = ready();
  assert.equal(values(m, "阴影样式").length, 7);
  m.setPlan("space", false);
  m.setPlan("shadow", false);
  m.setPlan("color", false);
  assert.equal(values(m, "间距").length, 34);
  assert.equal(values(m, "阴影样式").length, 9);
  m.generatePreview(); m.bind();
  assert.equal(m.bound.expectedBindings, 28);
  assert.equal(m.bound.skipped, 69);
  assert.equal(m.bound.shadowCount, 9);
});

test("font plans drive the draft before copy binding", () => {
  const m = ready();
  m.setFont("SF Pro", "PingFang SC");
  assert.equal(m.tokens().find(item => item.name === "font.family.apple").value, "PingFang SC");
  assert.equal(m.previewCurrent(), false);
  assert.throws(() => m.bind());
  m.generatePreview(); m.bind();
  assert.equal(m.bound.changedFonts, 3);
  assert.equal(m.fonts["SF Pro"].count, 3);
});

test("direct font replacement updates usage and cannot be queued twice", () => {
  const m = ready();
  m.setFont("SF Pro", "PingFang SC");
  m.replaceFonts();
  assert.equal(m.fonts["SF Pro"], undefined);
  assert.equal(m.fonts["PingFang SC"].count, 129);
  assert.equal(Object.values(m.fonts).reduce((n, item) => n + item.count, 0), 179);
  assert.equal(m.selections().length, 0);
  assert.equal(m.replaceFonts(), false);
  m.generatePreview(); m.bind();
  assert.equal(m.bound.changedFonts, 0);
  assert.equal(m.fontHistory.count, 3);
});

test("simultaneous font replacement does not cascade across mappings", () => {
  const m = ready();
  m.setFont("Arial", "Inter"); m.setFont("Inter", "PingFang SC");
  m.replaceFonts();
  assert.equal(m.fonts.Inter.count, 8);
  assert.equal(m.fonts["PingFang SC"].count, 168);
});

test("manual weights disable automatic mode and automatic mode restores mapping", () => {
  const m = ready();
  m.setFont("SF Pro", "PingFang SC");
  m.setWeight("SF Pro", "Medium", "Semibold");
  assert.equal(m.fonts["SF Pro"].weight, "map");
  m.autoWeights(m.fonts["SF Pro"]);
  assert.equal(m.fonts["SF Pro"].weightMap.Medium, "Medium");
});

test("unavailable fonts block writes and recover on a new selection", () => {
  const m = ready();
  m.setFont("SF Pro", "HarmonyOS Sans");
  delete m.availableFonts["HarmonyOS Sans"];
  assert.equal(m.fontErrors().length, 1);
  assert.throws(() => m.generatePreview());
  assert.throws(() => m.replaceFonts());
  m.setFont("SF Pro", "PingFang SC");
  assert.equal(m.fontErrors().length, 0);
  m.generatePreview(); m.bind();
});

test("rescans and edits invalidate outputs without creating another copy", () => {
  const m = ready(); m.bind();
  const previewId = m.preview.id;
  const boundId = m.bound.id;
  m.scan();
  assert.equal(m.previewCurrent(), false);
  assert.equal(m.boundCurrent(), false);
  assert.equal(m.canStep(5), false);
  assert.throws(() => m.applySkin("#123456"));
  m.generatePreview(); m.bind();
  assert.equal(m.preview.id, previewId);
  assert.equal(m.bound.id, boundId);
  assert.equal(m.copyCount, 1);
  m.bind();
  assert.equal(m.copyCount, 1);
  m.bind({ newCopy: true });
  assert.equal(m.copyCount, 2);
});

test("four-way diff names changes and protects unmanaged variables and originals", () => {
  const m = ready();
  const originals = JSON.stringify(m.originalVariables);
  const diff = m.diff();
  assert.equal(diff.modified.length, 6);
  assert.equal(diff.unchanged.length, 2);
  assert.equal(diff.stale.length, 2);
  assert.equal(diff.external.length, 1);
  assert.equal(diff.added.length + diff.modified.length + diff.unchanged.length, m.variableTokens().length);
  assert.ok(diff.modified.every(item => item.before !== item.value));
  m.bind();
  assert.ok(m.bound.variables.some(item => item.name === "legacy.radius"));
  assert.equal(m.diff().modified.length, 0);
  m.bind({ removeStale: true });
  assert.ok(!m.bound.variables.some(item => item.name === "legacy.radius"));
  assert.ok(m.bound.variables.some(item => item.name === "team.external"));
  assert.equal(JSON.stringify(m.originalVariables), originals);
});

test("skin validates hex and restores the full original palette exactly", () => {
  const m = ready(); m.bind();
  const initial = JSON.stringify(m.primary());
  const functional = m.bound.variables.filter(item => !item.name.startsWith("primary."));
  assert.equal(m.primary().find(item => item.name === "primary.500").value, "#F3BA65");
  assert.deepEqual(m.palette("#F3BA65"), m.primary());
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex("#ZZZZZZ"), null);
  assert.throws(() => m.applySkin("#ZZZZZZ"));
  assert.equal(JSON.stringify(m.primary()), initial);
  m.applySkin("#2F80ED");
  const blue = JSON.stringify(m.primary());
  assert.notEqual(blue, initial);
  assert.equal(m.primary().length, 8);
  assert.deepEqual(m.bound.variables.filter(item => !item.name.startsWith("primary.")), functional);
  m.applySkin("#E05A72"); m.restoreSkin();
  assert.equal(JSON.stringify(m.primary()), blue);
  const original = ready(); original.bind(); original.applySkin("#2F80ED"); original.restoreSkin();
  assert.equal(JSON.stringify(original.primary()), initial);
});

test("missing selection and failed scan are recoverable without stale success", () => {
  const m = ready();
  m.selection = { frames: 0, layers: 0 };
  assert.throws(() => m.scan());
  m.selection = { frames: 3, layers: 160 }; m.failNextScan = true;
  assert.throws(() => m.scan());
  assert.equal(m.scanned, false);
  m.scan();
  assert.equal(m.scanned, true);
  assert.equal(m.previewCurrent(), false);
});

test("retry only resolves the failed item without creating a new copy", () => {
  const m = ready(); m.bind();
  const before = JSON.stringify(m.bound.variables);
  m.retryBinding(); m.retryBinding();
  assert.equal(m.bound.failed, 0);
  assert.equal(m.copyCount, 1);
  assert.equal(JSON.stringify(m.bound.variables), before);
  m.scan(); m.generatePreview(); m.bind();
  assert.equal(m.bound.failed, 0);
});

test("updating a copy never reapplies its unchanged font plan", () => {
  const m = ready(); m.setFont("Arial", "Inter"); m.generatePreview(); m.bind();
  assert.equal(m.bound.changedFonts, 8);
  m.setPlan("radius", true); m.generatePreview(); m.bind();
  assert.equal(m.bound.changedFonts, 0);
  m.setFont("Arial", ""); m.generatePreview(); m.bind();
  assert.equal(m.bound.changedFonts, 8);
});

test("JSON import stays unchanged and scripts parse", () => {
  const html = fs.readFileSync(path.join(__dirname, "../figma-governance-workflow.html"), "utf8");
  assert.ok(html.includes('<textarea class="paste-box" readonly>粘贴 Web 端生成的 JSON</textarea>'));
  assert.ok(html.includes('<button class="main-btn">生成预览页</button>'));
  assert.ok(html.includes('<button class="ghost-btn">同步 Figma 变量</button>'));
  new Function(fs.readFileSync(path.join(__dirname, "../governance-workflow.js"), "utf8"));
});
