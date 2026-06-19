#!/usr/bin/env node
/*
 * Regression tests for the 2.0 reverse *binding* path (bindReverseVariables /
 * resolveColor / bindSolid / gradient harvest / theme detection).
 *
 * Unlike run-tests.js (which slices the pure AUDIT/REBUILD cores), this loads the
 * FULL figma-plugin/code.js under a faithful Figma mock and exercises the async
 * binding end-to-end — the logic we iterated on heavily and that real Figma, not
 * unit tests, kept catching. Locks in: transparent→variable-alpha, gradient strict
 * match + harvest, theme detection, role routing, opaque text, read-only paints.
 *
 * Run:  node tests/binding-tests.js   (exit 1 on any failure)
 */
const fs = require('fs');
const path = require('path');
const CODE = fs.readFileSync(path.resolve(__dirname, '../figma-plugin/code.js'), 'utf8');

// install a first mock so the top-level figma.showUI/onmessage assignment in code.js works,
// then define all plugin functions as globals.
let M = require('./figma-mock').setup();
(0, eval)(CODE);
const pluginOnMessage = M.figma.ui.onmessage; // 捕获 onmessage 处理器（闭包按调用时的 global.figma 解析，fresh 后仍可用）
function fresh() { M = require('./figma-mock').setup(); } // reset figma + state between tests

// --- helpers ---------------------------------------------------------------
function ref(p) { return (p && p.boundVariables && p.boundVariables.color && p.boundVariables.color.type === 'VARIABLE_ALIAS') ? p.boundVariables.color.__name : null; }
function hex(c) { function h(x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); } return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase(); }
function boundCopyRoot() { return M.PAGES[M.PAGES.length - 1].children[0]; }
async function bind(root) { M.figma.currentPage.selection = [root]; await bindReverseVariables(buildRebuildPlan(harvestSelection([root], 20000))); return boundCopyRoot(); }
async function bindResult(root) { M.figma.currentPage.selection = [root]; return bindReverseVariables(buildRebuildPlan(harvestSelection([root], 20000))); }

// --- async harness ---------------------------------------------------------
let passed = 0, failed = 0; const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ' — ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function near(a, b, m) { if (Math.abs(a - b) > 0.001) throw new Error((m ? m + ' — ' : '') + 'expected ~' + b + ' got ' + a); }

// a busy dark design: dark page + several opaque bg colors + white@5% box (fill) with white@10% stroke
function darkBusyPage() {
  const { N, solid } = M;
  const bgs = ['#222222', '#262626', '#2A2A2A', '#303030', '#0E0E0E'].map((h, i) => N({ type: 'FRAME', width: 1400, height: 200, y: i * 210, characters: '', fills: [solid(h)], strokes: [] }));
  const box = N({ type: 'FRAME', width: 1000, height: 80, y: 1100, characters: '', fills: [solid('#FFFFFF', 0.05)], strokes: [solid('#FFFFFF', 0.10)], strokeWeight: 1, cornerRadius: 999 });
  const txt = N({ type: 'TEXT', width: 300, height: 30, y: 1200, characters: '标题', fontSize: 24, fontName: { family: 'Inter', style: 'Bold' }, lineHeight: { unit: 'AUTO' }, fills: [solid('#FFFFFF')] });
  box.children = [txt];
  return N({ type: 'FRAME', width: 1440, height: 2000, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: bgs.concat([box]) });
}

// ---------------------------------------------------------------------------
test('半透明填充绑到带 alpha 的变量、引用生效、paint.opacity=1', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const box = root.children[5], fill = box.fills[0];
  assert(ref(fill), 'fill 必须引用变量, got ' + ref(fill));
  eq(fill.opacity, 1, 'paint.opacity 置 1（透明度在变量里）');
  near(M.varValue(ref(fill)).a, 0.05, '变量值 alpha = 0.05');
});

test('半透明描边绑到 border 变量且 alpha 保真', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const stroke = root.children[5].strokes[0];
  assert(ref(stroke) && ref(stroke).indexOf('color/border') === 0, '描边引用 border 变量, got ' + ref(stroke));
  near(M.varValue(ref(stroke)).a, 0.10, '变量值 alpha = 0.10');
});

test('不透明文字仍绑到 text 变量、opacity=1', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const txt = root.children[5].children[0].fills[0];
  assert(ref(txt) && ref(txt).indexOf('color/text') === 0, '文字引用 text 变量, got ' + ref(txt));
  eq(txt.opacity, 1, 'opacity=1');
});

test('两层模型：半透明语义色别名引用半透明基础色（palette *-alpha）', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const semName = ref(root.children[5].fills[0]); // 白@5% 填充绑到的 bg 语义色
  const raw = M.varRaw(semName);
  assert(raw && raw.type === 'VARIABLE_ALIAS', '半透明语义色应是别名(两层联动), got ' + JSON.stringify(raw));
  const prim = M.varById(raw.id);
  assert(prim && prim.name.indexOf('color/palette/') === 0 && prim.name.indexOf('-alpha') >= 0, '应别名到半透明 palette 基础色, got ' + (prim && prim.name));
  near(M.varValue(semName).a, 0.05, '解析后 alpha=0.05');
});

test('返回的绑定 paint 是只读冻结对象（代码不得依赖其可变性）', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const fill = root.children[5].fills[0];
  assert(Object.isFrozen(fill), '绑定 paint 应为冻结对象');
});

test('渐变：同色色标绑各自变量、颜色不变；无近似色标保留原色', async () => {
  fresh(); const { N, solid, grad } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const btn = N({ type: 'FRAME', width: 1200, height: 90, y: 2100, characters: '', fills: [grad('#FFA559', '#FF6B00')], strokes: [], cornerRadius: 16 });
  const page = N({ type: 'FRAME', width: 1440, height: 2400, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([btn]) });
  const root = await bind(page);
  const ps = M.PAINT_STYLES.find(function (s) { return s.name.indexOf('反推渐变/') === 0; });
  assert(ps, '本地渐变应提升成共享样式');
  const g = ps.paints[0];
  assert(ref(g.gradientStops[0]), '浅橙色标应绑上(已纳入采集)');
  assert(ref(g.gradientStops[1]), '深橙色标应绑上');
  eq(hex(g.gradientStops[0].color), '#FFA559', '浅橙原色不变');
  eq(hex(g.gradientStops[1].color), '#FF6B00', '深橙原色不变');
  eq(root.children[8].fillStyleId, ps.id, '渐变图层应应用该样式');
});

test('渐变：非品牌蓝紫色标也能经聚类绑上、颜色不变', async () => {
  fresh(); const { N, solid, grad } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const btn = N({ type: 'FRAME', width: 1200, height: 90, y: 2100, characters: '', fills: [grad('#3B82F6', '#A855F7')], strokes: [], cornerRadius: 16 });
  const page = N({ type: 'FRAME', width: 1440, height: 2400, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([btn]) });
  await bind(page);
  const g = M.PAINT_STYLES.find(function (s) { return s.name.indexOf('反推渐变/') === 0; }).paints[0];
  assert(ref(g.gradientStops[0]) && ref(g.gradientStops[1]), '蓝、紫色标都应绑上');
  eq(hex(g.gradientStops[1].color), '#A855F7', '紫色原色不变');
});

test('角色路由：背景填充→bg、描边→border、文字→text', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const page = root; // 顶层暗底
  assert((ref(page.fills[0]) || '').indexOf('color/bg') === 0, '页面暗底应绑 bg 角色, got ' + ref(page.fills[0]));
});

test('大圆角(≥100)绑 radius.full，不被数值最近的小圆角刻度吸走', async () => {
  fresh(); const { N, solid } = M;
  const small = []; for (let i = 0; i < 4; i++) small.push(N({ type: 'FRAME', width: 200, height: 100, y: i * 110, characters: '', fills: [solid('#222222')], strokes: [], cornerRadius: 16 }));
  const pill = N({ type: 'FRAME', width: 300, height: 60, y: 900, characters: '', fills: [solid('#262626')], strokes: [], cornerRadius: 999 });
  const mid = N({ type: 'FRAME', width: 300, height: 120, y: 1000, characters: '', fills: [solid('#2A2A2A')], strokes: [], cornerRadius: 150 });
  const page = N({ type: 'FRAME', width: 1440, height: 1400, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: small.concat([pill, mid]) });
  const root = await bind(page);
  const midV = root.children[5]._bound.topLeftRadius;       // 150（胶囊）
  const smallV = root.children[0]._bound.topLeftRadius;     // 16（小圆角）
  eq(midV && midV.name, 'radius/full', '150 应绑 radius.full');
  eq(smallV && smallV.name, 'radius/sm', '16 应绑 radius.sm');
});

test('主题检测：暗底+满屏半透明白蒙层+白字 → dark；白底深字 → light', async () => {
  fresh();
  const darkObs = { fills: [
    { hex: '#1A1A1A', opacity: 1, nodeType: 'FRAME', area: 1440 * 3000 },
    { hex: '#FFFFFF', opacity: 0.05, nodeType: 'FRAME', area: 1440 * 3000 },
    { hex: '#FFFFFF', opacity: 1, nodeType: 'TEXT', area: 300 * 40 },
    { hex: '#FFA559', opacity: 1, nodeType: 'FRAME', area: 1200 * 90, fromGradient: true },
  ], strokes: [] };
  eq(rebuildDetectTheme(darkObs), 'dark', '暗底应判 dark');
  const lightObs = { fills: [ { hex: '#FFFFFF', opacity: 1, nodeType: 'FRAME', area: 1440 * 3000 }, { hex: '#111111', opacity: 1, nodeType: 'TEXT', area: 300 * 40 } ], strokes: [] };
  eq(rebuildDetectTheme(lightObs), 'light', '白底应判 light');
});

test('绑定小结：统计图片填充 / 特效节点 / 绑定计数', async () => {
  fresh(); const { N, solid } = M;
  const imageNode = N({ type: 'FRAME', width: 400, height: 200, y: 0, characters: '', fills: [{ type: 'IMAGE', visible: true, scaleMode: 'FILL', imageHash: 'abc' }], strokes: [] });
  const shadowCard = N({ type: 'FRAME', width: 300, height: 120, y: 220, characters: '', fills: [solid('#222222')], strokes: [], effects: [{ type: 'DROP_SHADOW', visible: true, radius: 20, color: { r: 0, g: 0, b: 0, a: 0.4 }, offset: { x: 0, y: 4 } }] });
  const page = N({ type: 'FRAME', width: 1440, height: 800, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: [imageNode, shadowCard] });
  const b = await bindResult(page);
  assert(b.skipped, '应返回 skipped 小结');
  eq(b.skipped.image, 1, '应统计到 1 个图片填充');
  assert(b.skipped.effect >= 1, '应统计到带特效的节点');
  assert(typeof b.fills === 'number', 'bound.fills 仍为数值');
});

test('双模式：中性语义色对侧模式镜像明度(别名不同)、品牌色两模式相同、副本锁检测模式', async () => {
  fresh(); const { N, solid } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const title = N({ type: 'TEXT', width: 300, height: 30, y: 500, characters: '标题', fontSize: 24, fontName: { family: 'Inter', style: 'Bold' }, lineHeight: { unit: 'AUTO' }, fills: [solid('#FFFFFF')] });
  const card = N({ type: 'FRAME', width: 400, height: 200, y: 600, characters: '', fills: [solid('#888888')], strokes: [] });
  const page = N({ type: 'FRAME', width: 1440, height: 1200, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([title, card]) });
  const root = await bind(page);
  const bgL = M.varRaw('color/bg/page', 'Light'), bgD = M.varRaw('color/bg/page', 'Dark');
  assert(bgL && bgD && bgL.type === 'VARIABLE_ALIAS' && bgD.type === 'VARIABLE_ALIAS', 'bg/page 两模式都应是别名');
  assert(bgL.id !== bgD.id, '中性色 bg/page 对侧模式应镜像到不同基础色, L=' + JSON.stringify(bgL) + ' D=' + JSON.stringify(bgD));
  const brL = M.varRaw('color/brand/primary', 'Light'), brD = M.varRaw('color/brand/primary', 'Dark');
  assert(brL && brD && brL.id === brD.id, '品牌色两模式应指向相同基础色');
  assert(Object.keys(root._explicitModes).length > 0, '副本应锁定到检测主题的模式');
});

test('防堆积：重复绑定只保留最新的「绑定副本」页', async () => {
  fresh();
  await bind(darkBusyPage());
  await bind(darkBusyPage());
  const copies = M.PAGES.filter(function (p) { return p.type === 'PAGE' && p.name === '反推规范 · 绑定副本'; });
  eq(copies.length, 1, '重复绑定后应只剩一个绑定副本页');
});

test('基础色单值：Primitives 收成单模式，语义色 Tokens 仍双模式', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const prim = M.COLS.find(function (c) { return c.name === 'Primitives'; });
  const tok = M.COLS.find(function (c) { return c.name === 'Tokens'; });
  assert(prim, '应有 Primitives 集合');
  eq(prim.modes.length, 1, '基础色集合应收成单模式(单值)');
  assert(tok && tok.modes.length === 2, '语义色集合应保持 Light/Dark 双模式');
  // 收成单模式后语义色双模式仍可用（绑定/别名不受影响）
  assert(ref(root.children[5].fills[0]), '半透明填充仍绑着变量');
});

test('主题覆盖：手动指定浅/深，自动回到检测值，预览 chrome 跟随', async () => {
  fresh();
  const darkObs = { fills: [{ hex: '#1A1A1A', opacity: 1, nodeType: 'FRAME', area: 1440 * 3000 }], strokes: [], texts: [{ size: 14 }], radii: [8], spacings: [8], shadows: [] };
  const plan = buildRebuildPlan(darkObs);
  eq(plan.detectedTheme, 'dark', '自动检测为 dark');
  applyReverseTheme(plan, 'light'); eq(plan.theme, 'light', '手动覆盖 light');
  applyReverseTheme(plan, 'dark'); eq(plan.theme, 'dark', '手动覆盖 dark');
  applyReverseTheme(plan, 'auto'); eq(plan.theme, 'dark', 'auto 回到检测值(不残留上次覆盖)');
  applyReverseTheme(plan, undefined); eq(plan.theme, 'dark', '未传 theme 也回到检测值');
  applyReverseTheme(plan, 'light');
  eq(rebuildToData(plan).seed.defaultMode, 'light', '预览/绑定主模式跟随覆盖');
});

test('一键换主色(纯函数)：以输入色为锚的标准色阶，输入色本身一定出现、全档同色相', async () => {
  fresh();
  const ramp = ['#FFD793', '#FFBD00', '#E1BD83', '#FFB075', '#FFA900', '#F9A602', '#FA9A02', '#EC9758', '#FF6F00']; // 9 档橙
  const target = '#F73BD4';                        // 目标玫红
  const out = reverseRecolorRamp(ramp, target);
  assert(out && out.length === 9, '返回同长度(9)');
  const tOk = rcRgbToOklch(rcHexToRgb255(target));
  // 全档同色相（玫红）
  out.forEach(function (c, i) {
    const o = rcRgbToOklch({ r: c.r * 255, g: c.g * 255, b: c.b * 255 });
    const dh = Math.min(Math.abs(o.H - tOk.H), 360 - Math.abs(o.H - tOk.H));
    assert(dh < 12, '第' + i + '档色相应接近玫红(差 ' + dh.toFixed(1) + '°)');
  });
  // 输入色 #F73BD4 本身应作为某一档出现（ΔE 很小）
  function hx(c) { function h(x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); } return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase(); }
  const hit = out.some(function (c) { return auditDeltaE(hx(c), target) < 3; });
  assert(hit, '色阶里应包含输入主色 ' + target + '（最接近的: ' + out.map(hx).join(',') + '）');
});

test('一键换主色(handler)：palette/primary/* 的值被换到新主色色相', async () => {
  fresh(); const { N, solid } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const page = N({ type: 'FRAME', width: 1440, height: 600, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags });
  await bind(page); // 建出 color/palette/primary/*
  await pluginOnMessage({ type: 'reverse-recolor', color: '#3B82F6' });
  const tH = rcRgbToOklch(rcHexToRgb255('#3B82F6')).H;
  const primNames = M.COLS.flatMap(function (c) { return c.variableIds.map(function (id) { return M.varById(id); }); })
    .filter(Boolean).map(function (v) { return v.name; }).filter(function (n) { return n.indexOf('color/palette/primary/') === 0; });
  assert(primNames.length > 0, '应有主色变量');
  primNames.forEach(function (n) {
    const val = M.varValue(n);
    const o = rcRgbToOklch({ r: val.r * 255, g: val.g * 255, b: val.b * 255 });
    const dh = Math.min(Math.abs(o.H - tH), 360 - Math.abs(o.H - tH));
    assert(dh < 15, n + ' 换主色后应是蓝色相(差 ' + dh.toFixed(1) + '°)');
  });
});

test('绑定 paint 样式：样式渐变色标绑变量；用样式的图层不再本地绑(留给样式跟随换主色)', async () => {
  fresh(); const { N, solid, grad, mkPaintStyle } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const style = mkPaintStyle('brand-grad', [grad('#FF6B00', '#FF6B00')]);
  const styledBtn = N({ type: 'FRAME', width: 300, height: 80, y: 500, characters: '', fills: [grad('#FF6B00', '#FF6B00')], fillStyleId: style.id, strokes: [] });
  const page = N({ type: 'FRAME', width: 1440, height: 700, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([styledBtn]) });
  await bind(page);
  const sg = M.PAINT_STYLES[0].paints[0];
  assert(sg.gradientStops[0].boundVariables && sg.gradientStops[0].boundVariables.color, '样式里的渐变色标应绑到变量');
  const clBtn = boundCopyRoot().children[8];
  assert(!(clBtn.fills[0].gradientStops[0] && clBtn.fills[0].gradientStops[0].boundVariables), '用样式的图层不应本地绑定（留给样式）');
});

test('换主色：散落到其它色族的同色相品牌色跟随；功能色引用的基础色不变', async () => {
  fresh();
  const prim = M.figma.variables.createVariableCollection('Primitives');
  prim.renameMode(prim.modes[0].modeId, 'Light'); const pm = prim.modes[0].modeId;
  function mkc(name, hex) { const v = M.figma.variables.createVariable(name, prim); const c = M.rgb(hex); v.setValueForMode(pm, { r: c.r, g: c.g, b: c.b, a: 1 }); return v; }
  ['#FFD8A0', '#FFA900', '#FF6F00'].forEach((h, i) => mkc('color/palette/primary/' + i, h));
  const red = mkc('color/palette/red/1', '#FF6B00');     // 散落的品牌橙（red 族）
  const warnPrim = mkc('color/palette/orange/0', '#F5A623'); // 功能色(警告)引用的基础色 → 受保护
  const tok = M.figma.variables.createVariableCollection('Tokens'); tok.renameMode(tok.modes[0].modeId, 'Light');
  const warnSem = M.figma.variables.createVariable('color/function/warning', tok);
  warnSem.setValueForMode(tok.modes[0].modeId, M.figma.variables.createVariableAlias(warnPrim));
  await pluginOnMessage({ type: 'reverse-recolor', color: '#3B82F6' }); // 换蓝
  const tH = rcRgbToOklch(rcHexToRgb255('#3B82F6')).H;
  function hueDist(v) { const val = Object.values(v.valuesByMode)[0]; const o = rcRgbToOklch({ r: val.r * 255, g: val.g * 255, b: val.b * 255 }); return Math.min(Math.abs(o.H - tH), 360 - Math.abs(o.H - tH)); }
  assert(hueDist(red) < 15, '散落的品牌橙 palette/red/1 应跟随换成蓝, 差 ' + hueDist(red).toFixed(1) + '°');
  assert(hueDist(warnPrim) > 40, '功能色引用的基础色应保持橙(不变), 差 ' + hueDist(warnPrim).toFixed(1) + '°');
});

test('本地渐变提升成共享样式：相同渐变的多个图层共用一个样式', async () => {
  fresh(); const { N, solid, grad } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const btnA = N({ type: 'FRAME', width: 400, height: 80, y: 500, characters: '', fills: [grad('#FFA559', '#FF6B00')], strokes: [] });
  const btnB = N({ type: 'FRAME', width: 400, height: 80, y: 600, characters: '', fills: [grad('#FFA559', '#FF6B00')], strokes: [] }); // 同款渐变
  const page = N({ type: 'FRAME', width: 1440, height: 800, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([btnA, btnB]) });
  const root = await bind(page);
  const styles = M.PAINT_STYLES.filter(function (s) { return s.name.indexOf('反推渐变/') === 0; });
  eq(styles.length, 1, '相同渐变应只建一个共享样式');
  const a = root.children[8], b = root.children[9];
  assert(a.fillStyleId && a.fillStyleId === b.fillStyleId && a.fillStyleId === styles[0].id, '两个图层应应用同一个样式');
});

// --- run -------------------------------------------------------------------
(async function () {
  for (const t of tests) {
    try { await t.fn(); passed++; }
    catch (e) { failed++; console.log('  ✗ ' + t.name + '\n      ' + e.message); }
  }
  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total) [binding]`);
  process.exit(failed ? 1 : 0);
})();
