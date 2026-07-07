#!/usr/bin/env node
/* 预览页冒烟测试：在 Node 里完整跑 'generate'（syncVariables→textStyles→effectStyles→generatePreview）。
 * generatePreview 依赖 createFrame 等真机 API、常规 mock 跑不到，是历史盲区——此脚本补齐这些 API 后端到端复跑。
 * 卡死时最后一条 progress 指向出事区段；结果必须含「预览页已生成」否则退出 1。 */
const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'figma-plugin/code.js'), 'utf8');

const M = require(path.join(ROOT, 'tests/figma-mock')).setup();
const figma = M.figma;
let idc = 90000;

// ---- 补齐 generate 路径缺的 API ----
function mkNode(type) {
  const n = M.N({ type: type, name: '', x: 0, y: 0, width: 0, height: 0, fills: [], strokes: [], effects: [] });
  n.resize = function (w, h) { this.width = w; this.height = h; };
  return n;
}
figma.createFrame = () => mkNode('FRAME');
figma.createRectangle = () => mkNode('RECTANGLE');
figma.createEllipse = () => mkNode('ELLIPSE');
figma.createText = () => mkNode('TEXT');
const TEXT_STYLES = [], EFFECT_STYLES = [];
figma.getLocalTextStylesAsync = () => Promise.resolve(TEXT_STYLES);
figma.createTextStyle = () => { const s = { id: 'ts' + (idc++), name: '', fontName: null, fontSize: 12 }; TEXT_STYLES.push(s); return s; };
figma.moveLocalTextStyleAfter = () => {};
figma.getLocalEffectStylesAsync = () => Promise.resolve(EFFECT_STYLES);
figma.createEffectStyle = () => { const s = { id: 'es' + (idc++), name: '', effects: [] }; EFFECT_STYLES.push(s); return s; };
// currentPage 用真节点（带 children/appendChild），generatePreview 要遍历它找旧预览页
const pageNode = M.N({ type: 'PAGE', name: 'Page 1' });
pageNode.selection = [];
figma.currentPage = pageNode;
M.PAGES.push(pageNode);
figma.variables.getLocalVariablesAsync = (type) => {
  const out = [];
  return figma.variables.getLocalVariableCollectionsAsync().then(cols => {
    const jobs = [];
    cols.forEach(c => c.variableIds.forEach(id => jobs.push(figma.variables.getVariableByIdAsync(id))));
    return Promise.all(jobs).then(vs => vs.filter(v => v && (!type || v.resolvedType === type || true)));
  });
};

(0, eval)(CODE);
const onmessage = figma.ui.onmessage;

// progress 实时打印 + 节点创建计数（每 300 个报一次，看是否停在某段疯狂建节点）
const rawPost = figma.ui.postMessage.bind(figma.ui);
figma.ui.postMessage = (m) => { console.log('[ui]', m.type, (m.message || '').slice(0, 90)); rawPost(m); };

// ---- 构造真实 payload：tokens.js 生成 + 复刻 normalizeData(Format 1) ----
global.window = global;
require(path.join(ROOT, 'tokens.js'));
const DT = global.DesignTokens;
const seed = { specName: '冒烟规范', platform: 'app-web', primaryColor: '#FF4886', defaultMode: 'light',
  neutralStrategy: 'neutral', paletteEngine: 'oklch', radiusScale: 'balanced', shadowStrength: 'medium',
  localFont: 'source', fontStack: 'x', baseFontSize: 16 };
const tokens = DT.generateTokens(seed).tokens;
function normalize(data) { // 复刻 ui.html normalizeData Format 1
  const colorTokens = {}, dimTokens = {};
  for (const [key, token] of Object.entries(data.tokens)) {
    const figmaName = (token.figma && token.figma.variable) || key.replace(/\./g, '/');
    const tier = token.tier || 'primitive';
    if (token.type === 'color' && token.value && typeof token.value === 'object') {
      const resolveAlias = (val) => {
        const m = typeof val === 'string' ? val.match(/^\{(.+)\.(light|dark)\}$/) : null;
        if (m && data.tokens[m[1]]) return resolveAlias(data.tokens[m[1]].value[m[2]]);
        return val;
      };
      const l = resolveAlias(token.value.light), d = resolveAlias(token.value.dark);
      if (typeof l === 'string' && typeof d === 'string') colorTokens[key] = { figmaName, tier, light: l, dark: d, usage: token.usage || '' };
    } else if (['dimension', 'number', 'fontFamily'].includes(token.type)) {
      dimTokens[key] = { figmaName, tier, value: token.value, type: token.type, usage: token.usage || '', role: token.role, weight: token.weight, lineHeight: token.lineHeight };
    } else if (token.type === 'shadow') {
      dimTokens[key] = { figmaName, tier, value: token.value, type: 'shadow', usage: token.usage || '' };
    }
  }
  return { name: data.name, platform: data.platform, defaultMode: data.seed.defaultMode, version: data.version,
    seed: data.seed, colorTokens, dimTokens, colorCount: Object.keys(colorTokens).length, dimCount: Object.keys(dimTokens).length };
}
const payload = normalize({ name: seed.specName, platform: seed.platform, version: 'v1', generator: '2.1.0', seed, tokens });
console.log('payload: 颜色', payload.colorCount, '尺寸', payload.dimCount);

(async () => {
  const t0 = Date.now();
  await onmessage({ type: 'generate', data: payload });
  const resultMsg = figma.ui.messages.find(m => m.type === 'result');
  const errMsg = figma.ui.messages.find(m => m.type === 'error');
  if (errMsg) { console.error('❌ 流程报错:', errMsg.message); process.exit(1); }
  if (!resultMsg || resultMsg.message.indexOf('预览页已生成') < 0) { console.error('❌ 未收到「预览页已生成」result'); process.exit(1); }
  console.log('1 passed, 0 failed (1 total) [preview-smoke] · ' + (Date.now() - t0) + 'ms');
  process.exit(0);
})().catch(e => { console.error('❌ 抛错:', e && e.stack || e); process.exit(1); });
