/*
 * Faithful-enough Figma Plugin API mock for Node regression tests.
 *
 * Models the specific real-Figma behaviors the reverse-binding code depends on
 * (and that bit us during development):
 *   - setBoundVariableForPaint returns a NEW *frozen* (read-only) paint that
 *     carries boundVariables.color = VARIABLE_ALIAS and preserves the input
 *     paint's opacity  → catches any code that tries to mutate the returned paint.
 *   - color variables hold RGBA via setValueForMode; alpha lives in the variable.
 *   - collections have Light/Dark modes (renameMode / addMode).
 *   - node.clone() deep-clones fills/strokes/children (figma.mixed preserved).
 *
 * Usage:
 *   const M = require('./figma-mock').setup();   // installs global.figma + __html__
 *   ...build M.N(...) trees, set M.figma.currentPage.selection, then eval code.js
 *   M helpers: N, solid, grad, rgb, MIXED, varValue(name), PAGES, COLS
 */
function setup() {
  var idc = 0;
  var COLS = [], _vid = {}, PAGES = [];

  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  function solid(hex, opacity) { return { type: 'SOLID', visible: true, opacity: (opacity == null ? 1 : opacity), color: rgb(hex) }; }
  function grad(h1, h2, type) {
    var c1 = rgb(h1), c2 = rgb(h2); c1.a = 1; c2.a = 1;
    return { type: type || 'GRADIENT_LINEAR', visible: true, opacity: 1, gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: c1 }, { position: 1, color: c2 }] };
  }
  var MIXED = Symbol('figma.mixed');

  function mkVar(name, col) {
    return { id: 'v' + (idc++), name: name, scopes: [], resolvedType: 'COLOR', variableCollectionId: col.id, valuesByMode: {}, setValueForMode: function (m, v) { this.valuesByMode[m] = v; }, remove: function () {} };
  }
  function mkCol(name) {
    return {
      id: 'c' + (idc++), name: name, modes: [{ modeId: 'mode-' + (idc++), name: 'Mode 1' }], variableIds: [],
      renameMode: function (id, nm) { var x = this.modes.find(function (z) { return z.modeId === id; }); if (x) x.name = nm; },
      addMode: function (nm) { var id = 'mode-' + (idc++); this.modes.push({ modeId: id, name: nm }); return id; },
      removeMode: function (id) { if (this.modes.length <= 1) throw new Error('cannot remove last mode'); this.modes = this.modes.filter(function (m) { return m.modeId !== id; }); },
    };
  }

  function N(props) {
    var node = {
      children: [], _bound: {}, _ranges: [],
      appendChild: function (c) { this.children.push(c); },
      _explicitModes: {},
      setBoundVariable: function (field, v) { this._bound[field] = v; },
      setExplicitVariableModeForCollection: function (col, modeId) { this._explicitModes[col.id || col] = modeId; },
      setRangeFills: function (s, e, f) { this._ranges.push({ start: s, end: e, fills: f }); },
      getStyledTextSegments: function () { return this._segments || []; },
      clone: function () {
        var src = Object.assign({}, this);
        ['children', 'appendChild', 'setBoundVariable', 'setRangeFills', 'getStyledTextSegments', 'clone', '_bound', '_ranges', '_segments', 'fills', 'strokes'].forEach(function (k) { delete src[k]; });
        var c = N(JSON.parse(JSON.stringify(src)));
        c.fills = (this.fills === MIXED) ? MIXED : (this.fills ? JSON.parse(JSON.stringify(this.fills)) : this.fills);
        if (this.strokes) c.strokes = JSON.parse(JSON.stringify(this.strokes));
        c._segments = this._segments;
        c.children = (this.children || []).map(function (x) { return x.clone(); });
        return c;
      },
    };
    return Object.assign(node, props);
  }

  var figma = {
    mixed: MIXED,
    showUI: function () {}, ui: { postMessage: function () {}, set onmessage(v) {} },
    notify: function () {},
    loadFontAsync: function () { return Promise.resolve(); },
    variables: {
      getLocalVariableCollectionsAsync: function () { return Promise.resolve(COLS); },
      getVariableByIdAsync: function (id) { return Promise.resolve(_vid[id] || null); },
      createVariableCollection: function (n) { var c = mkCol(n); COLS.push(c); return c; },
      createVariable: function (n, col) { var v = mkVar(n, col); col.variableIds.push(v.id); _vid[v.id] = v; return v; },
      // 真机：返回新的「只读」paint，带 boundVariables.color，保留输入 opacity
      setBoundVariableForPaint: function (p, field, v) {
        return Object.freeze({ type: 'SOLID', color: p.color, visible: p.visible, opacity: p.opacity, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id, __name: v.name } } });
      },
      createVariableAlias: function (v) { return { type: 'VARIABLE_ALIAS', id: v.id, __name: v.name }; },
    },
    createPage: function () { var pg = N({ type: 'PAGE', name: '' }); PAGES.push(pg); return pg; },
    currentPage: { selection: [], appendChild: function () {} },
    viewport: { center: { x: 0, y: 0 }, scrollAndZoomIntoView: function () {} },
  };

  global.__html__ = '<x>';
  global.figma = figma;

  function rawValue(v, modeName) {
    var col = COLS.find(function (c) { return c.id === v.variableCollectionId; });
    var mode = col && (modeName ? col.modes.find(function (m) { return m.name === modeName; }) : col.modes[0]);
    return mode ? v.valuesByMode[mode.modeId] : undefined;
  }
  function varValue(name, modeName) {
    var v = varByName(name); if (!v) return undefined;
    var val = rawValue(v, modeName), guard = 0;
    while (val && val.type === 'VARIABLE_ALIAS' && _vid[val.id] && guard++ < 16) val = rawValue(_vid[val.id], modeName); // 跟随别名链解析到真值
    return val;
  }
  function varByName(name) { for (var id in _vid) { if (_vid[id].name === name) return _vid[id]; } return null; }

  function varRaw(name, modeName) { var v = varByName(name); return v ? rawValue(v, modeName) : undefined; } // 不跟随别名，看原始值（判断是否为 alias）
  function varById(id) { return _vid[id] || null; }
  return { figma: figma, N: N, solid: solid, grad: grad, rgb: rgb, MIXED: MIXED, COLS: COLS, PAGES: PAGES, varValue: varValue, varRaw: varRaw, varByName: varByName, varById: varById };
}
module.exports = { setup: setup };
