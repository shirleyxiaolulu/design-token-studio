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
function fresh() { M = require('./figma-mock').setup(); } // reset figma + state between tests

// --- helpers ---------------------------------------------------------------
function ref(p) { return (p && p.boundVariables && p.boundVariables.color && p.boundVariables.color.type === 'VARIABLE_ALIAS') ? p.boundVariables.color.__name : null; }
function hex(c) { function h(x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); } return ('#' + h(c.r) + h(c.g) + h(c.b)).toUpperCase(); }
function boundCopyRoot() { return M.PAGES[M.PAGES.length - 1].children[0]; }
async function bind(root) { M.figma.currentPage.selection = [root]; await bindReverseVariables(buildRebuildPlan(harvestSelection([root], 20000))); return boundCopyRoot(); }

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
  const g = root.children[8].fills[0];
  assert(ref(g.gradientStops[0]), '浅橙色标应绑上(已纳入采集)');
  assert(ref(g.gradientStops[1]), '深橙色标应绑上');
  eq(hex(g.gradientStops[0].color), '#FFA559', '浅橙原色不变');
  eq(hex(g.gradientStops[1].color), '#FF6B00', '深橙原色不变');
});

test('渐变：非品牌蓝紫色标也能经聚类绑上、颜色不变', async () => {
  fresh(); const { N, solid, grad } = M;
  const tags = []; for (let i = 0; i < 8; i++) tags.push(N({ type: 'FRAME', width: 120, height: 40, y: i * 50, characters: '', fills: [solid('#FF6B00')], strokes: [] }));
  const btn = N({ type: 'FRAME', width: 1200, height: 90, y: 2100, characters: '', fills: [grad('#3B82F6', '#A855F7')], strokes: [], cornerRadius: 16 });
  const page = N({ type: 'FRAME', width: 1440, height: 2400, characters: '', fills: [solid('#1A1A1A')], strokes: [], children: tags.concat([btn]) });
  const root = await bind(page);
  const g = root.children[8].fills[0];
  assert(ref(g.gradientStops[0]) && ref(g.gradientStops[1]), '蓝、紫色标都应绑上');
  eq(hex(g.gradientStops[1].color), '#A855F7', '紫色原色不变');
});

test('角色路由：背景填充→bg、描边→border、文字→text', async () => {
  fresh(); const root = await bind(darkBusyPage());
  const page = root; // 顶层暗底
  assert((ref(page.fills[0]) || '').indexOf('color/bg') === 0, '页面暗底应绑 bg 角色, got ' + ref(page.fills[0]));
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

// --- run -------------------------------------------------------------------
(async function () {
  for (const t of tests) {
    try { await t.fn(); passed++; }
    catch (e) { failed++; console.log('  ✗ ' + t.name + '\n      ' + e.message); }
  }
  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total) [binding]`);
  process.exit(failed ? 1 : 0);
})();
