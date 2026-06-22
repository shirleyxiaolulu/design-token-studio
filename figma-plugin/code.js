// Design System v2 — Figma Plugin
// 功能 1: 同步变量（从 Web 端 JSON 更新 Figma Variables）
// 功能 2: 生成预览页（基于 JSON 数据创建可视化文档）
// 对照实验(2026-06-20)：本行为无害注释，零功能，仅用于验证「改动 code.js 后能否正常加载」。

figma.showUI(__html__, { width: 360, height: 640 });

// =============================================
// Helpers
// =============================================
function hexToFigmaRgb(hex) {
  if (!hex || !hex.startsWith('#')) return null;
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function figmaRgbToHex(c) {
  const toH = n => Math.round(Math.min(Math.max(n, 0), 1) * 255).toString(16).padStart(2, '0');
  return `#${toH(c.r)}${toH(c.g)}${toH(c.b)}`.toUpperCase();
}

// =============================================
// Sync: Update Figma Variables from JSON
// =============================================
// ---------------------------------------------------------------------------
// Variable reconcile planners — pure (no Figma API) so they're unit-testable.
// ---------------------------------------------------------------------------
// Plan in-place renames for font/size variables: match a stale-named existing
// font/size var to an expected name by EQUAL value. Returns [{from, to}].
function planFontSizeRenames(existingFontSizeVars, expectedFontSize) {
  var existingNames = {};
  for (var i = 0; i < existingFontSizeVars.length; i++) existingNames[existingFontSizeVars[i].name] = true;
  var used = {};
  var plan = [];
  for (var to in expectedFontSize) {
    if (existingNames[to]) continue;                       // correct name already present
    var size = expectedFontSize[to];
    for (var k = 0; k < existingFontSizeVars.length; k++) {
      var ev = existingFontSizeVars[k];
      if (used[ev.name]) continue;
      if (expectedFontSize[ev.name] !== undefined) continue; // its name is itself expected → keep
      if (ev.value === size) { plan.push({ from: ev.name, to: to }); used[ev.name] = true; break; }
    }
  }
  return plan;
}
// Plan orphan removals: existing names not in the expected set — but ONLY within
// namespaces the plugin manages this run (first "/" segment of an expected name).
// User-authored variables in other namespaces are never returned.
function planVarOrphans(existingNames, expectedNames) {
  var exp = {}, pref = {};
  for (var i = 0; i < expectedNames.length; i++) {
    exp[expectedNames[i]] = true;
    pref[String(expectedNames[i]).split('/')[0]] = true;
  }
  var out = [];
  for (var j = 0; j < existingNames.length; j++) {
    var n = existingNames[j];
    if (exp[n]) continue;
    if (pref[String(n).split('/')[0]]) out.push(n);
  }
  return out;
}

async function syncVariables(data) {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  // Find or create Primitives and Tokens collections
  var primCol = collections.find(function(c) { return c.name === 'Primitives'; });
  var tokCol = collections.find(function(c) { return c.name === 'Tokens'; });

  if (!primCol) {
    primCol = figma.variables.createVariableCollection('Primitives');
    primCol.renameMode(primCol.modes[0].modeId, 'Light');
    primCol.addMode('Dark');
  }
  if (!tokCol) {
    tokCol = figma.variables.createVariableCollection('Tokens');
    tokCol.renameMode(tokCol.modes[0].modeId, 'Light');
    tokCol.addMode('Dark');
  }

  // Ensure both collections have Light + Dark modes
  var primLightMode = primCol.modes.find(function(m) { return m.name === 'Light'; });
  var primDarkMode = primCol.modes.find(function(m) { return m.name === 'Dark'; });
  if (!primDarkMode) { primCol.addMode('Dark'); primDarkMode = primCol.modes.find(function(m) { return m.name === 'Dark'; }); }

  var tokLightMode = tokCol.modes.find(function(m) { return m.name === 'Light'; });
  var tokDarkMode = tokCol.modes.find(function(m) { return m.name === 'Dark'; });
  if (!tokDarkMode) { tokCol.addMode('Dark'); tokDarkMode = tokCol.modes.find(function(m) { return m.name === 'Dark'; }); }

  // Clean up old iOS variables (removed from spec)
  var cleaned = 0;
  for (var ci = 0; ci < collections.length; ci++) {
    var cleanCol = collections[ci];
    for (var vi = cleanCol.variableIds.length - 1; vi >= 0; vi--) {
      var cleanVar = await figma.variables.getVariableByIdAsync(cleanCol.variableIds[vi]);
      if (cleanVar && cleanVar.name.indexOf('ios') === 0) {
        cleanVar.remove();
        cleaned++;
      }
    }
  }

  // Build variable lookup from existing variables
  var varMap = {};
  for (var ci = 0; ci < collections.length; ci++) {
    var col = collections[ci];
    for (var vi = 0; vi < col.variableIds.length; vi++) {
      var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]);
      if (v) varMap[v.name] = v;
    }
  }
  // Also index newly created collections (if they were just created, they're empty)

  // Reconcile (existing files): migrate renamed font/size variables IN PLACE so a
  // re-run on an old file (e.g. font/size/15 → font/size/callout) preserves their
  // bindings + panel position instead of leaving stale duplicates. Match by value.
  var renamed = 0;
  var expectedFontSize = {};
  Object.values(data.dimTokens || {}).forEach(function (t) {
    if (t && t.figmaName && t.figmaName.indexOf('font/size/') === 0) {
      var fv = (typeof t.value === 'string') ? parseInt(t.value, 10) : t.value;
      if (fv && !isNaN(fv)) expectedFontSize[t.figmaName] = fv;
    }
  });
  var existingFs = [];
  for (var fsName in varMap) {
    if (fsName.indexOf('font/size/') !== 0) continue;
    var fsVal = null;
    try { fsVal = Object.values(varMap[fsName].valuesByMode)[0]; } catch (e) {}
    existingFs.push({ name: fsName, value: fsVal });
  }
  var fsRenames = planFontSizeRenames(existingFs, expectedFontSize);
  for (var rr = 0; rr < fsRenames.length; rr++) {
    var fromN = fsRenames[rr].from, toN = fsRenames[rr].to;
    try {
      varMap[fromN].name = toN;        // rename in place — keeps bindings + position
      varMap[toN] = varMap[fromN];
      delete varMap[fromN];
      renamed++;
    } catch (e) { /* rename rejected — syncVar will just create the new name */ }
  }

  var created = 0;
  var updated = 0;
  var skipped = 0;

  // Build collection ID → modes lookup (works for ANY collection)
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var colModesById = {};
  for (var ci2 = 0; ci2 < allCollections.length; ci2++) {
    var c = allCollections[ci2];
    var lm = c.modes.find(function(m) { return m.name === 'Light'; });
    var dm = c.modes.find(function(m) { return m.name === 'Dark'; });
    colModesById[c.id] = {
      light: lm ? lm.modeId : c.modes[0].modeId,
      dark: dm ? dm.modeId : (c.modes[1] ? c.modes[1].modeId : c.modes[0].modeId)
    };
  }

  // Helper: get modes for a variable by reading its own collectionId
  function getVarModes(variable) {
    return colModesById[variable.variableCollectionId];
  }

  // Helper: find or create a variable, return { variable, modes }
  function syncVar(name, type, tier) {
    var existing = varMap[name];
    if (existing) {
      return { variable: existing, modes: getVarModes(existing) };
    }

    var isSemantic = (tier === 'semantic');
    var targetCol = isSemantic ? tokCol : primCol;
    var resolvedType = type === 'FLOAT' ? 'FLOAT' : type === 'STRING' ? 'STRING' : 'COLOR';

    var newVar = figma.variables.createVariable(name, targetCol, resolvedType);

    if (resolvedType === 'COLOR') {
      newVar.scopes = ['ALL_FILLS', 'STROKE_COLOR'];
    } else if (name.indexOf('radius') >= 0) {
      newVar.scopes = ['CORNER_RADIUS'];
    } else if (name.indexOf('space') >= 0) {
      newVar.scopes = ['GAP', 'WIDTH_HEIGHT'];
    } else if (name.indexOf('font/size') >= 0) {
      newVar.scopes = ['FONT_SIZE'];
    } else if (name.indexOf('font/lineHeight') >= 0) {
      newVar.scopes = ['LINE_HEIGHT'];
    } else {
      newVar.scopes = ['ALL_SCOPES'];
    }

    varMap[name] = newVar;
    // Update colModesById for the new variable's collection
    colModesById[targetCol.id] = colModesById[targetCol.id] || {
      light: primLightMode.modeId,
      dark: primDarkMode.modeId
    };
    created++;
    return { variable: newVar, modes: getVarModes(newVar) };
  }

  // Sync color tokens
  // Order color categories so the Figma library groups appear as:
  // brand → auxiliary → function → text → constant → bg → border → (others)
  // Figma orders variable groups by creation order, so we sort before creating.
  var CAT_ORDER = ['brand', 'auxiliary', 'function', 'text', 'constant', 'bg', 'border'];
  function catRank(figmaName) {
    var parts = String(figmaName || '').split('/');
    var ci = parts.indexOf('color');     // works for color/<cat>/.. and semantic/color/<cat>/..
    var cat = ci >= 0 ? (parts[ci + 1] || '') : '';
    var idx = CAT_ORDER.indexOf(cat);
    return idx === -1 ? CAT_ORDER.length : idx;
  }
  var colorEntries = Object.entries(data.colorTokens || {}).map(function(e, idx) {
    return [e[0], e[1], idx];            // keep original index for stable sort
  });
  colorEntries.sort(function(a, b) {
    var ra = catRank(a[1].figmaName), rb = catRank(b[1].figmaName);
    if (ra !== rb) return ra - rb;
    return a[2] - b[2];                  // preserve original order within a category
  });
  for (var i = 0; i < colorEntries.length; i++) {
    var token = colorEntries[i][1];
    var lightRgb = hexToFigmaRgb(token.light);
    var darkRgb = hexToFigmaRgb(token.dark);
    if (!lightRgb || !darkRgb) { skipped++; continue; }

    var result = syncVar(token.figmaName, 'COLOR', token.tier);
    result.variable.setValueForMode(result.modes.light, lightRgb);
    result.variable.setValueForMode(result.modes.dark, darkRgb);
    updated++;
  }

  // Sync dimension tokens
  var dimEntries = Object.entries(data.dimTokens || {});
  for (var j = 0; j < dimEntries.length; j++) {
    var dToken = dimEntries[j][1];
    var val = dToken.value;
    if (typeof val === 'string' && val.endsWith('px')) val = parseFloat(val);

    if (typeof val === 'number') {
      var numResult = syncVar(dToken.figmaName, 'FLOAT', dToken.tier);
      numResult.variable.setValueForMode(numResult.modes.light, val);
      numResult.variable.setValueForMode(numResult.modes.dark, val);
      updated++;
    } else if (typeof val === 'string') {
      var strResult = syncVar(dToken.figmaName, 'STRING', dToken.tier);
      strResult.variable.setValueForMode(strResult.modes.light, val);
      updated++;
    } else {
      skipped++;
    }
  }

  // Reconcile (existing files): remove stale/duplicate plugin variables that are
  // no longer in the token set — but ONLY within namespaces the plugin manages
  // this run, so user-authored variables are never touched. font/size renames
  // above already preserved those, so this mainly clears removed tokens.
  var orphaned = 0;
  try {
    var expectedNames = [];
    Object.values(data.colorTokens || {}).forEach(function (t) { if (t && t.figmaName) expectedNames.push(t.figmaName); });
    Object.values(data.dimTokens || {}).forEach(function (t) { if (t && t.figmaName && t.type !== 'shadow') expectedNames.push(t.figmaName); });
    var reCols = await figma.variables.getLocalVariableCollectionsAsync();
    for (var rcI = 0; rcI < reCols.length; rcI++) {
      var ownCol = reCols[rcI];
      if (ownCol.id !== primCol.id && ownCol.id !== tokCol.id) continue; // only plugin-owned collections
      var ownNames = [];
      var ownById = {};
      for (var oi = 0; oi < ownCol.variableIds.length; oi++) {
        var ov = await figma.variables.getVariableByIdAsync(ownCol.variableIds[oi]);
        if (ov) { ownNames.push(ov.name); ownById[ov.name] = ov; }
      }
      var orphans = planVarOrphans(ownNames, expectedNames);
      for (var op = 0; op < orphans.length; op++) {
        try { ownById[orphans[op]].remove(); orphaned++; } catch (e) {}
      }
    }
  } catch (e) { /* reconcile is best-effort */ }

  // Verify: read back a sample variable to confirm values were written
  var verifyMsg = '';
  var sampleEntries = Object.entries(data.colorTokens || {}).slice(0, 1);
  if (sampleEntries.length > 0) {
    var sampleToken = sampleEntries[0][1];
    var sampleVar = varMap[sampleToken.figmaName];
    if (sampleVar) {
      var sampleModes = getVarModes(sampleVar);
      var actualValues = sampleVar.valuesByMode;
      var writtenLight = actualValues[sampleModes.light];
      var writtenDark = actualValues[sampleModes.dark];
      var wlHex = writtenLight ? ('#' + Math.round(writtenLight.r*255).toString(16).padStart(2,'0') + Math.round(writtenLight.g*255).toString(16).padStart(2,'0') + Math.round(writtenLight.b*255).toString(16).padStart(2,'0')).toUpperCase() : 'N/A';
      verifyMsg = ' | 验证 ' + sampleToken.figmaName + ': Light=' + wlHex + ' 期望=' + sampleToken.light;
      verifyMsg += ' | modeIds: L=' + sampleModes.light + ' D=' + sampleModes.dark;
      verifyMsg += ' | allModeKeys=' + Object.keys(actualValues).join(',');
    }
  }

  return { created: created, updated: updated, skipped: skipped, cleaned: cleaned, renamed: renamed, orphaned: orphaned, verify: verifyMsg };
}

// ---------------------------------------------------------------------------
// Type scale helpers — DERIVE everything from the exported font.size tokens so
// the plugin never re-hardcodes the scale. tokens.js (web app) is the single
// source of truth; each font.size token carries role / weight / lineHeight.
// ---------------------------------------------------------------------------
function tsFontSizeEntries(data) {
  var dt = (data && data.dimTokens) || {};
  var list = [];
  for (var key in dt) {
    if (key.indexOf('font.size.') !== 0) continue;
    var t = dt[key];
    var size = (typeof t.value === 'string') ? parseInt(t.value, 10) : t.value;
    if (!size || isNaN(size)) continue;
    list.push({
      tokenKey: key,
      roleKey: key.slice('font.size.'.length),
      size: size,
      role: t.role,
      weight: (typeof t.weight === 'number') ? t.weight : null,
      lineHeight: t.lineHeight,
      usage: t.usage || '',
    });
  }
  list.sort(function (a, b) { return a.size - b.size; }); // ascending
  return list;
}

function tsFallbackRole(roleKey) {
  // Legacy exports (pre single-source) lack role metadata — title-case the key.
  return roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
}

// [tokenKey, styleName, 'bold'|'regular', description] — consumed by syncTextStyles.
function buildFontSizeSpecs(data) {
  return tsFontSizeEntries(data).map(function (e) {
    var styleName = e.role || tsFallbackRole(e.roleKey);
    var weight = (e.weight != null && e.weight >= 600) ? 'bold' : 'regular';
    return [e.tokenKey, styleName, weight, e.usage];
  });
}

// [displayName, size, weightString, usage], descending — consumed by the spec page.
function buildTypeScaleRows(data) {
  return tsFontSizeEntries(data)
    .slice()
    .sort(function (a, b) { return b.size - a.size; }) // descending (large → small)
    .map(function (e) {
      return ['text.' + e.roleKey, e.size, String(e.weight != null ? e.weight : 400), e.usage];
    });
}

// =============================================
// Sync: Text Styles from font tokens
// =============================================
async function syncTextStyles(data) {
  // Resolve the CJK family from the font selected in the web app (default 思源黑体 → Noto
  // Sans SC), instead of hard-coding PingFang SC. Falls back through candidates → Inter.
  var TS_FONT_CANDIDATES = {
    pingfang: ['PingFang SC'],
    sf: ['PingFang SC'],
    harmony: ['HarmonyOS Sans SC', 'HarmonyOS Sans'],
    misans: ['MiSans'],
    alimama: ['Alimama FangYuanTi VF', 'Alimama FangYuanTi'],
    source: ['Noto Sans SC', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Source Han Sans CN'],
    system: ['PingFang SC'],
  };
  var tsFontKey = (data.seed && data.seed.localFont) ? data.seed.localFont : 'source';
  var tsCandidates = (TS_FONT_CANDIDATES[tsFontKey] || TS_FONT_CANDIDATES.source).concat(['PingFang SC', 'Inter']);

  var FONT_FAMILY = 'Inter';
  for (var _tci = 0; _tci < tsCandidates.length; _tci++) {
    try {
      await figma.loadFontAsync({ family: tsCandidates[_tci], style: 'Regular' });
      FONT_FAMILY = tsCandidates[_tci];
      break;
    } catch (e) { /* try next candidate */ }
  }
  // Heading weight: prefer a real Semibold; otherwise fall to Medium (NOT Bold) so the
  // text styles match the AI JSON's fontWeightMapping (Semibold → Medium for fonts like
  // Noto Sans SC that ship no standalone Semibold).
  var FONT_BOLD = 'Regular';
  var tsBoldCandidates = ['Semibold', 'SemiBold', 'Semi Bold', 'DemiBold', 'Medium'];
  for (var _tbi = 0; _tbi < tsBoldCandidates.length; _tbi++) {
    try {
      await figma.loadFontAsync({ family: FONT_FAMILY, style: tsBoldCandidates[_tbi] });
      FONT_BOLD = tsBoldCandidates[_tbi];
      break;
    } catch (e) { /* try next weight */ }
  }

  // Text style specs are DERIVED from the exported font.size tokens (single
  // source of truth in tokens.js). Each spec: [tokenKey, styleName, weight, desc].
  // weight: 'bold' (→ Semibold/Medium fallback) when token weight >= 600, else 'regular'.
  var styleSpecs = buildFontSizeSpecs(data);

  // Get existing text styles
  var existingStyles = await figma.getLocalTextStylesAsync();
  var styleMap = {};
  for (var i = 0; i < existingStyles.length; i++) {
    styleMap[existingStyles[i].name] = existingStyles[i];
  }

  // Build a name -> variable map so each text style's fontSize can be bound
  // to the matching font/size/* variable (instead of a hard-coded number).
  var varByName = {};
  try {
    var allVars = await figma.variables.getLocalVariablesAsync('FLOAT');
    for (var vi = 0; vi < allVars.length; vi++) {
      varByName[allVars[vi].name] = allVars[vi];
    }
  } catch (e) { /* binding is best-effort; fall back to raw fontSize */ }

  var created = 0;
  var updated = 0;
  var bound = 0;
  var managed = []; // {style, size} per spec — used to re-sort the panel by font size

  for (var si = 0; si < styleSpecs.length; si++) {
    var spec = styleSpecs[si];
    var tokenKey = spec[0];
    var styleName = spec[1]; // semantic role name, e.g. "Large Title" / "Callout"
    var weight = spec[2];
    var desc = spec[3];

    // Find font size from dimTokens
    var dimToken = data.dimTokens[tokenKey];
    if (!dimToken) continue;

    var fontSize = typeof dimToken.value === 'string' ? parseInt(dimToken.value) : dimToken.value;
    if (!fontSize || isNaN(fontSize)) continue;

    // Line height from the tokenized value (single source); fall back for legacy exports.
    var lineHeight = (typeof dimToken.lineHeight === 'number') ? dimToken.lineHeight : Math.round(fontSize * 1.5);
    var fontStyle = weight === 'bold' ? FONT_BOLD : 'Regular';

    // Find or create style. Match by the semantic name first; fall back to a
    // size-named style (left by an earlier numeric naming) so it gets renamed in
    // place (migrated) to the semantic name instead of leaving a duplicate behind.
    var style = styleMap[styleName] || styleMap[String(fontSize)];
    if (!style) {
      style = figma.createTextStyle();
      created++;
    } else {
      updated++;
    }
    style.name = styleName;

    style.fontName = { family: FONT_FAMILY, style: fontStyle };
    style.fontSize = fontSize;
    style.lineHeight = { value: lineHeight, unit: 'PIXELS' };
    style.description = desc;

    // Bind the style's font size to its font/size/* variable so the text style
    // tracks the token instead of carrying a frozen number. dimToken.figmaName
    // is the variable name created by syncVariables (e.g. "font/size/body").
    var sizeVar = dimToken.figmaName ? varByName[dimToken.figmaName] : null;
    if (sizeVar) {
      try {
        // Modern API: pass the Variable object.
        style.setBoundVariable('fontSize', sizeVar);
        bound++;
      } catch (e1) {
        try {
          // Deprecated fallback: older runtimes expect a variable id string.
          style.setBoundVariable('fontSize', sizeVar.id);
          bound++;
        } catch (e2) { /* leave the raw fontSize if binding is rejected */ }
      }
    }

    managed.push({ style: style, size: fontSize });
  }

  // Re-sort the panel so text styles read small → large, top → bottom.
  // Figma lists styles in their stored order and appends newly created ones to
  // the end, so freshly added sizes (15/17/19) otherwise pile up at the bottom.
  // moveLocalTextStyleAfter(target, null) moves to first; passing the previous
  // style chains them into ascending order on every run.
  try {
    var ordered = managed.slice().sort(function (a, b) { return a.size - b.size; });
    var prev = null;
    for (var oi = 0; oi < ordered.length; oi++) {
      figma.moveLocalTextStyleAfter(ordered[oi].style, prev);
      prev = ordered[oi].style;
    }
  } catch (eOrder) { /* reordering is best-effort; older API versions may lack moveLocalTextStyleAfter */ }

  return { created: created, updated: updated, bound: bound };
}

// =============================================
// Sync: Effect Styles from shadow tokens
// =============================================
async function syncEffectStyles(data) {
  // Shadow levels to sync
  var shadowLevels = ['shadow.sm', 'shadow.md', 'shadow.lg', 'shadow.overlay'];
  var styleNames = {
    'shadow.sm': 'Shadow/SM',
    'shadow.md': 'Shadow/MD',
    'shadow.lg': 'Shadow/LG',
    'shadow.overlay': 'Shadow/Overlay',
  };
  var styleDescs = {
    'shadow.sm': '卡片、按钮悬停',
    'shadow.md': '下拉菜单、弹出层',
    'shadow.lg': '弹窗、对话框',
    'shadow.overlay': '全屏浮层、模态',
  };

  // Get existing effect styles
  var existingStyles = await figma.getLocalEffectStylesAsync();
  var styleMap = {};
  for (var i = 0; i < existingStyles.length; i++) {
    styleMap[existingStyles[i].name] = existingStyles[i];
  }

  var created = 0;
  var updated = 0;

  // Determine mode
  var defaultMode = 'dark';
  if (data.seed && data.seed.defaultMode) {
    defaultMode = data.seed.defaultMode;
  } else if (data.defaultMode) {
    defaultMode = data.defaultMode;
  }

  for (var si = 0; si < shadowLevels.length; si++) {
    var key = shadowLevels[si];
    var token = data.dimTokens[key];
    if (!token || token.type !== 'shadow') continue;

    var styleName = styleNames[key];
    var shadowValue = token.value;
    if (!shadowValue || typeof shadowValue !== 'object') continue;

    // Get layers for default mode
    var layers = shadowValue[defaultMode];
    if (!layers || layers === 'none') continue;
    if (!Array.isArray(layers)) continue;

    // Convert shadow layers to Figma effects
    var effects = [];
    for (var li = 0; li < layers.length; li++) {
      var layer = layers[li];
      // Parse "r,g,b" color string
      var colorParts = layer.color.split(',');
      var r = parseInt(colorParts[0]) / 255;
      var g = parseInt(colorParts[1]) / 255;
      var b = parseInt(colorParts[2]) / 255;

      effects.push({
        type: 'DROP_SHADOW',
        color: { r: r, g: g, b: b, a: layer.alpha },
        offset: { x: layer.x, y: layer.y },
        radius: layer.blur,
        spread: layer.spread,
        visible: true,
        blendMode: 'NORMAL',
      });
    }

    // Find or create style
    var style = styleMap[styleName];
    if (!style) {
      style = figma.createEffectStyle();
      style.name = styleName;
      created++;
    } else {
      updated++;
    }

    style.effects = effects;
    style.description = styleDescs[key] || '';
  }

  return { created: created, updated: updated };
}

// =============================================
// Generate Preview Page
// =============================================
async function generatePreview(data) {
  // Pick the CJK font family to match the font selected in the web app
  var fontKey = (data.seed && data.seed.localFont) ? data.seed.localFont : 'pingfang';
  // Each font shows the weight ladder that font actually ships ([label, numeric]).
  var W_PINGFANG = [['Light', '300'], ['Regular', '400'], ['Medium', '500'], ['Semibold', '600']];
  var W_HARMONY  = [['Light', '300'], ['Regular', '400'], ['Medium', '500'], ['Bold', '700']];
  var W_MISANS   = [['Light', '300'], ['Regular', '400'], ['Medium', '500'], ['Semibold', '600'], ['Bold', '700']];
  var W_SOURCE   = [['Light', '300'], ['Regular', '400'], ['Medium', '500'], ['SemiBold', '600'], ['Bold', '700']];
  var W_ALIMAMA  = [['Light', '300'], ['Regular', '400'], ['Medium', '500'], ['Bold', '700']];
  var FONT_MAP = {
    pingfang: { name: '苹方',          stack: 'PingFang SC, system-ui',            cjk: ['PingFang SC'], weights: W_PINGFANG },
    sf:       { name: '苹方',          stack: 'PingFang SC · SF Pro',              cjk: ['PingFang SC'], weights: W_PINGFANG },
    harmony:  { name: '鸿蒙黑体',       stack: 'HarmonyOS Sans SC',                 cjk: ['HarmonyOS Sans SC', 'HarmonyOS Sans'], weights: W_HARMONY },
    misans:   { name: 'MiSans',        stack: 'MiSans',                            cjk: ['MiSans'], weights: W_MISANS },
    alimama:  { name: '阿里妈妈方圆体',  stack: 'Alimama FangYuanTi',                cjk: ['Alimama FangYuanTi VF', 'Alimama FangYuanTi'], weights: W_ALIMAMA },
    source:   { name: '思源黑体',       stack: 'Noto Sans SC · Source Han Sans SC', cjk: ['Noto Sans SC', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Source Han Sans CN'], weights: W_SOURCE },
    system:   { name: '系统默认',       stack: 'system-ui',                         cjk: ['PingFang SC'], weights: W_PINGFANG }
  };
  var fontConf = FONT_MAP[fontKey] || FONT_MAP.pingfang;

  var loadedStyles = {};
  async function tryLoadFont(family, style) {
    try { await figma.loadFontAsync({ family: family, style: style }); loadedStyles[family + '||' + style] = true; return true; }
    catch (e) { return false; }
  }
  // Resolve CJK family: first candidate whose Regular loads, then fall back to PingFang SC / Inter
  var cjkCandidates = fontConf.cjk.concat(['PingFang SC', 'Inter']);
  var CJK_FAMILY = 'Inter';
  for (var _cf = 0; _cf < cjkCandidates.length; _cf++) {
    if (await tryLoadFont(cjkCandidates[_cf], 'Regular')) { CJK_FAMILY = cjkCandidates[_cf]; break; }
  }
  var LAT_FAMILY = 'Inter';
  await tryLoadFont('Inter', 'Regular');
  // Load multiple weights for the chosen families (best effort)
  var _cjkStyleList = ['ExtraLight', 'Light', 'Normal', 'Regular', 'Medium', 'SemiBold', 'Semibold', 'Semi Bold', 'DemiBold', 'Bold', 'Heavy'];
  for (var _csi = 0; _csi < _cjkStyleList.length; _csi++) { await tryLoadFont(CJK_FAMILY, _cjkStyleList[_csi]); }
  var _latStyleList = ['Regular', 'Medium', 'Semi Bold', 'Bold'];
  for (var _lsi = 0; _lsi < _latStyleList.length; _lsi++) { await tryLoadFont(LAT_FAMILY, _latStyleList[_lsi]); }
  var FONT_FAMILY = CJK_FAMILY;
  var FONT_BOLD = loadedStyles[CJK_FAMILY + '||Semibold'] ? 'Semibold'
                : loadedStyles[CJK_FAMILY + '||Semi Bold'] ? 'Semi Bold'
                : loadedStyles[CJK_FAMILY + '||Bold'] ? 'Bold'
                : loadedStyles[CJK_FAMILY + '||Medium'] ? 'Medium'
                : 'Regular';
  function weightCandidates(w) {
    var k = String(w).toLowerCase().replace(/[\s_-]/g, ''); // "Semi Bold" -> "semibold"
    if (k === 'light' || k === 'extralight' || k === 'thin') return ['Light', 'ExtraLight', 'Thin', 'Normal', 'Regular'];
    if (k === 'medium') return ['Medium', 'Normal', 'Regular'];
    if (k === 'semibold' || k === 'demibold') return ['SemiBold', 'Semibold', 'Semi Bold', 'DemiBold', 'Bold', 'Medium', 'Regular'];
    if (k === 'bold') return ['Bold', 'SemiBold', 'Semibold', 'Heavy', 'Medium', 'Regular'];
    if (k === 'heavy' || k === 'black') return ['Heavy', 'Black', 'Bold', 'SemiBold', 'Medium', 'Regular'];
    return ['Regular', 'Normal'];
  }
  function resolveWeightStyle(family, weightLabel) {
    var candidates = weightCandidates(weightLabel);
    for (var i = 0; i < candidates.length; i++) {
      if (loadedStyles[family + '||' + candidates[i]]) return candidates[i];
    }
    return 'Regular';
  }
  // Add text rendered in a specific (already-loaded) weight, with fallback
  function addWeightText(parent, x, y, text, size, family, weightLabel, color) {
    var style = resolveWeightStyle(family, weightLabel);
    var t = figma.createText();
    parent.appendChild(t); t.x = x; t.y = y;
    try { t.fontName = { family: family, style: style }; }
    catch (e) { try { t.fontName = { family: FONT_FAMILY, style: 'Regular' }; } catch (e2) {} }
    t.fontSize = size;
    t.characters = String(text);
    t.fills = [{ type: 'SOLID', color: color }];
    var varName = colorVarMap.get(color);
    if (varName && allVars[varName]) { t.fills = [figma.variables.setBoundVariableForPaint(t.fills[0], 'color', allVars[varName])]; }
    return t;
  }

  const W = { r: 1, g: 1, b: 1 };

  // Variable lookup for binding
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const allVars = {};
  for (const col of collections) {
    for (const vid of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vid);
      if (v) allVars[v.name] = v;
    }
  }

  // Get brand color for accent
  const brandToken = data.colorTokens['color.brand.primary'] || data.colorTokens['color.palette.primary.5'];
  const brandHex = brandToken ? brandToken.light : '#5314FF';
  const brandRgb = hexToFigmaRgb(brandHex) || { r: 0.33, g: 0.08, b: 1 };

  // Determine mode from seed or data
  var defaultMode = 'dark';
  if (data.seed && data.seed.defaultMode) {
    defaultMode = data.seed.defaultMode;
  } else if (data.defaultMode) {
    defaultMode = data.defaultMode;
  }
  var IS_LIGHT = (defaultMode === 'light');

  // Position away from existing content
  const page = figma.currentPage;
  let maxX = 0;
  for (const child of page.children) {
    const right = child.x + child.width;
    if (right > maxX) maxX = right;
  }

  const frame = figma.createFrame();
  frame.name = 'Token Preview / ' + data.name + ' / v' + data.version;
  frame.x = maxX + 200;
  frame.y = 0;
  frame.resize(1180, 100);

  // Mode-aware color palette
  var CANVAS_BG, CARD_BG, CARD_BORDER, SWATCH_INNER, TEXT_BRIGHT, TEXT_DIM, TEXT_MUTED, TEXT_SHADOW, BAR_GREEN, SWATCH_BORDER;

  if (IS_LIGHT) {
    // Light mode colors
    CANVAS_BG   = { r: 248/255, g: 249/255, b: 251/255 }; // #F8F9FB
    CARD_BG     = { r: 1, g: 1, b: 1 };                    // #FFFFFF
    CARD_BORDER = { r: 228/255, g: 231/255, b: 236/255 };  // #E4E7EC
    SWATCH_INNER = { r: 243/255, g: 244/255, b: 246/255 }; // #F3F4F6
    TEXT_BRIGHT = { r: 17/255, g: 24/255, b: 39/255 };     // #111827
    TEXT_DIM    = { r: 107/255, g: 114/255, b: 128/255 };  // #6B7280
    TEXT_MUTED  = { r: 156/255, g: 163/255, b: 175/255 };  // #9CA3AF
    TEXT_SHADOW = { r: 75/255, g: 85/255, b: 99/255 };     // #4B5563
    BAR_GREEN   = { r: 16/255, g: 185/255, b: 129/255 };   // #10B981
    SWATCH_BORDER = { r: 229/255, g: 231/255, b: 235/255 };// #E5E7EB
  } else {
    // Dark mode colors (from source Figma file)
    CANVAS_BG   = { r: 7/255, g: 8/255, b: 10/255 };      // #07080A
    CARD_BG     = { r: 16/255, g: 21/255, b: 27/255 };     // #10151B
    CARD_BORDER = { r: 32/255, g: 38/255, b: 47/255 };     // #20262F
    SWATCH_INNER = { r: 21/255, g: 27/255, b: 35/255 };    // #151B23
    TEXT_BRIGHT = { r: 248/255, g: 250/255, b: 252/255 };   // #F8FAFC
    TEXT_DIM    = { r: 167/255, g: 176/255, b: 190/255 };   // #A7B0BE
    TEXT_MUTED  = { r: 104/255, g: 115/255, b: 132/255 };   // #687384
    TEXT_SHADOW = { r: 182/255, g: 193/255, b: 206/255 };   // #B6C1CE
    BAR_GREEN   = { r: 87/255, g: 241/255, b: 168/255 };    // #57F1A8
    SWATCH_BORDER = { r: 17/255, g: 24/255, b: 39/255 };    // #111827
  }

  frame.fills = [{ type: 'SOLID', color: CANVAS_BG }];
  frame.clipsContent = true;

  // Pin the preview frame to the spec's default mode. All swatches/text/bg below
  // are bound to variables; without an explicit mode the frame resolves them in
  // the collection's first mode (Light), so a dark-mode spec would render light.
  var targetModeName = IS_LIGHT ? 'Light' : 'Dark';
  for (var _ci = 0; _ci < collections.length; _ci++) {
    var _col = collections[_ci];
    var _modes = _col.modes || [];
    var _mode = _modes.find(function (m) { return m.name === targetModeName; });
    if (!_mode && _modes.length) {
      // Fallback by position: Light = first mode, Dark = second (or first) mode.
      _mode = IS_LIGHT ? _modes[0] : (_modes[1] || _modes[0]);
    }
    if (_mode) {
      try {
        frame.setExplicitVariableModeForCollection(_col, _mode.modeId);
      } catch (e1) {
        try { frame.setExplicitVariableModeForCollection(_col.id, _mode.modeId); } catch (e2) {}
      }
    }
  }

  // ===== Variable Binding Helpers =====
  // Map color object references → semantic variable names for auto-binding
  var colorVarMap = new Map();
  colorVarMap.set(CANVAS_BG, 'color/bg/page');
  colorVarMap.set(CARD_BG, 'color/bg/surface');
  colorVarMap.set(CARD_BORDER, 'color/border/subtle');
  colorVarMap.set(TEXT_BRIGHT, 'color/text/primary');
  colorVarMap.set(TEXT_DIM, 'color/text/secondary');
  colorVarMap.set(TEXT_MUTED, 'color/text/tertiary');
  colorVarMap.set(TEXT_SHADOW, 'color/text/secondary');
  colorVarMap.set(SWATCH_BORDER, 'color/border/subtle');
  colorVarMap.set(brandRgb, 'color/brand/primary');

  function bindFill(node, colorRef) {
    var varName = colorVarMap.get(colorRef);
    if (varName && allVars[varName] && node.fills && node.fills.length > 0) {
      node.fills = [figma.variables.setBoundVariableForPaint(node.fills[0], 'color', allVars[varName])];
    }
  }

  function bindStroke(node, colorRef) {
    var varName = colorVarMap.get(colorRef);
    if (varName && allVars[varName] && node.strokes && node.strokes.length > 0) {
      node.strokes = [figma.variables.setBoundVariableForPaint(node.strokes[0], 'color', allVars[varName])];
    }
  }

  // Bind main frame background
  bindFill(frame, CANVAS_BG);

  figma.ui.postMessage({ type: 'progress', message: '框架已创建，正在生成色彩系统...' });

  // ===== Helpers =====
  function addText(parent, x, y, text, size, style, color, opacity) {
    const t = figma.createText();
    parent.appendChild(t); t.x = x; t.y = y;
    var fontStyle = style || 'Regular';
    if (fontStyle === 'Semi Bold' || fontStyle === 'Bold' || fontStyle === 'Semibold') {
      fontStyle = FONT_BOLD;
    } else {
      fontStyle = 'Regular';
    }
    t.fontName = { family: FONT_FAMILY, style: fontStyle };
    t.fontSize = size || 14;
    t.characters = String(text);
    var resolvedColor = color || TEXT_BRIGHT;
    t.fills = [{ type: 'SOLID', color: resolvedColor, opacity: opacity !== undefined ? opacity : 1 }];
    // Auto-bind text fill to semantic variable
    var varName = colorVarMap.get(resolvedColor);
    if (varName && allVars[varName]) {
      t.fills = [figma.variables.setBoundVariableForPaint(t.fills[0], 'color', allVars[varName])];
    }
    return t;
  }

  function addLine(parent, x, y, w) {
    const r = figma.createRectangle();
    parent.appendChild(r); r.x = x; r.y = y; r.resize(w, 1);
    r.fills = [{ type: 'SOLID', color: CARD_BORDER }];
    bindFill(r, CARD_BORDER);
  }

  // Section header: pill kicker badge + title + description (matching web)
  function addSection(parent, y, num, title, desc) {
    // Kicker pill badge: rounded bg + dot + uppercase label
    var kickerW = 120;
    var kickerBg = figma.createRectangle();
    parent.appendChild(kickerBg);
    kickerBg.x = 64; kickerBg.y = y;
    kickerBg.resize(kickerW, 22);
    kickerBg.cornerRadius = 999;
    kickerBg.fills = [{ type: 'SOLID', color: brandRgb }];
    bindFill(kickerBg, brandRgb);
    // Use node opacity for the tint (paint opacity is lost when a color variable is bound)
    kickerBg.opacity = 0.12;
    // Kicker dot
    var kickerDot = figma.createEllipse();
    parent.appendChild(kickerDot);
    kickerDot.x = 72; kickerDot.y = y + 8.5;
    kickerDot.resize(5, 5);
    kickerDot.fills = [{ type: 'SOLID', color: brandRgb }];
    bindFill(kickerDot, brandRgb);
    // Kicker text
    addText(parent, 83, y + 3, 'section · ' + num, 11, 'Semi Bold', brandRgb);

    // Title
    addText(parent, 64, y + 32, title, 22, 'Semi Bold', TEXT_BRIGHT);
    // Description
    if (desc) addText(parent, 64, y + 64, desc, 13, 'Regular', TEXT_DIM);
    return y + (desc ? 100 : 64);
  }

  async function makeSwatch(parent, x, y, w, h, label, hex, varName, lightText) {
    const rgb = hexToFigmaRgb(hex);
    if (!rgb) return;
    const sf = figma.createFrame();
    parent.appendChild(sf);
    sf.name = label; sf.x = x; sf.y = y;
    sf.resize(w, h); sf.cornerRadius = 8;
    sf.fills = [{ type: 'SOLID', color: rgb }];
    const v = allVars[varName];
    if (v) { sf.fills = [figma.variables.setBoundVariableForPaint(sf.fills[0], 'color', v)]; }
    const tc = lightText ? { r: 0.1, g: 0.1, b: 0.1 } : W;
    addText(sf, 10, 10, label, 11, 'Regular', tc, 0.9);
    addText(sf, 10, h - 22, hex, 10, 'Regular', tc, 0.5);
  }

  async function addColorRow(parent, y, name, lightHex, darkHex, usage, varName) {
    const rgb = hexToFigmaRgb(lightHex);
    if (rgb) {
      const dot = figma.createEllipse();
      parent.appendChild(dot); dot.x = 64; dot.y = y + 4; dot.resize(20, 20);
      dot.fills = [{ type: 'SOLID', color: rgb }];
      const v = allVars[varName];
      if (v) { dot.fills = [figma.variables.setBoundVariableForPaint(dot.fills[0], 'color', v)]; }
    }
    addText(parent, 100, y + 3, name, 12, 'Regular', TEXT_BRIGHT, 0.9);
    addText(parent, 380, y + 3, lightHex || '-', 12, 'Regular', TEXT_BRIGHT, 0.5);
    addText(parent, 540, y + 3, darkHex || '-', 12, 'Regular', TEXT_BRIGHT, 0.5);
    addText(parent, 700, y + 3, usage, 12, 'Regular', TEXT_BRIGHT, 0.4);
  }

  // ===== Categorize tokens =====
  const colorsByPrefix = {};
  for (const [key, token] of Object.entries(data.colorTokens)) {
    // Determine visual category
    let cat;
    if (key.startsWith('color.palette.')) {
      const parts = key.split('.');
      cat = `palette:${parts[2]}`; // palette:primary, palette:red, etc.
    } else if (key.startsWith('color.custom.') && key.split('.').length === 4) {
      const parts = key.split('.');
      cat = `auxscale:${parts[2]}`;
    } else if (key.startsWith('color.custom.')) {
      cat = 'custom';
    } else {
      const parts = key.split('.');
      cat = parts.slice(0, 2).join('.');
    }
    if (!colorsByPrefix[cat]) colorsByPrefix[cat] = [];
    const entry = Object.assign({ key: key }, token);
    colorsByPrefix[cat].push(entry);
  }

  const swW = 194, swH = 108, gH = 14, startX = 64;

  // ===== HEADER =====
  addText(frame, 64, 64, data.name, 42, 'Bold', TEXT_BRIGHT);
  var platLabels = { 'ios-app': 'iOS App', 'web-admin': 'Web 后台', 'app-web': 'App+Web' };
  const platLabel = platLabels[data.platform] || data.platform;
  addText(frame, 64, 116, `v${data.version} · ${platLabel} · Brand: ${brandHex}`, 14, 'Regular', TEXT_BRIGHT, 0.5);
  addText(frame, 64, 146, '由 Web 端设计规范生成器导出，经 Figma 插件同步。色块已绑定 Variables。', 14, 'Regular', TEXT_BRIGHT, 0.6);

  // ===== SECTION 01: PALETTE SWATCHES =====
  let Y = addSection(frame, 220, '01', '色彩系统', '由品牌主色推导出的完整色阶，作为语义色、组件状态和插画用色的基础。');

  // Render palette families as swatch grids
  const paletteFamilies = ['primary', 'gray', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  const auxFamilies = Object.keys(colorsByPrefix).filter(k => k.startsWith('auxscale:')).map(k => k.replace('auxscale:', ''));

  for (const family of paletteFamilies) {
    const tokens = colorsByPrefix[`palette:${family}`];
    if (!tokens || tokens.length === 0) continue;
    tokens.sort((a, b) => {
      const ai = parseInt(a.key.split('.').pop());
      const bi = parseInt(b.key.split('.').pop());
      return ai - bi;
    });

    const label = family.charAt(0).toUpperCase() + family.slice(1);
    addText(frame, 64, Y, label, 14, 'Semi Bold', TEXT_BRIGHT, 0.8);
    Y += 28;

    const isExtended = family !== 'primary' && family !== 'gray';
    const sw = isExtended ? 94 : swW;
    const sh = isExtended ? 70 : swH;
    const gap = isExtended ? 8 : gH;
    const cols = isExtended ? 10 : 5;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (sw + gap);
      const y = Y + row * (sh + (isExtended ? 8 : 24));
      await makeSwatch(frame, x, y, sw, sh, `${label}/${i}`, t.light, t.figmaName, i < Math.ceil(tokens.length / 2));
    }

    const rows = Math.ceil(tokens.length / cols);
    Y += rows * (sh + (isExtended ? 8 : 24)) + 24;
  }

  // Auxiliary scales
  if (auxFamilies.length > 0) {
    addText(frame, 64, Y, 'Auxiliary Scales', 14, 'Semi Bold', TEXT_BRIGHT, 0.8);
    Y += 28;
    for (const fam of auxFamilies) {
      const tokens = colorsByPrefix[`auxscale:${fam}`];
      if (!tokens) continue;
      tokens.sort((a, b) => parseInt(a.key.split('.').pop()) - parseInt(b.key.split('.').pop()));
      addText(frame, 64, Y, fam, 11, 'Regular', TEXT_BRIGHT, 0.5);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        await makeSwatch(frame, startX + i * 102, Y + 18, 94, 70, `${fam}/${i}`, t.light, t.figmaName, i < 4);
      }
      Y += 96;
    }
  }

  figma.ui.postMessage({ type: 'progress', message: '色彩系统完成，正在生成语义色...' });

  // ===== SECTION 02: SEMANTIC COLORS — exact replica of source =====
  var CARD_W = 1052;
  var INNER_W = 1004;
  var CARD_PAD = 24;
  var ROW_H = 52;

  // Section header with pill kicker badge
  Y += 32;
  var semKickerBg = figma.createRectangle();
  frame.appendChild(semKickerBg);
  semKickerBg.x = 64; semKickerBg.y = Y;
  semKickerBg.resize(120, 22); semKickerBg.cornerRadius = 999;
  semKickerBg.fills = [{ type: 'SOLID', color: brandRgb }];
  bindFill(semKickerBg, brandRgb);
  semKickerBg.opacity = 0.12;
  var semKickerDot = figma.createEllipse();
  frame.appendChild(semKickerDot);
  semKickerDot.x = 72; semKickerDot.y = Y + 8.5;
  semKickerDot.resize(5, 5);
  semKickerDot.fills = [{ type: 'SOLID', color: brandRgb }];
  bindFill(semKickerDot, brandRgb);
  addText(frame, 83, Y + 3, 'section · 02', 11, 'Semi Bold', brandRgb);
  addText(frame, 64, Y + 32, '语义色', 22, 'Semi Bold', TEXT_BRIGHT);
  addText(frame, 64, Y + 64, '语义色描述界面角色而非具体色值，在 Light / Dark 模式之间自动切换。Figma 组件应优先引用这些变量。', 13, 'Regular', TEXT_DIM);
  Y += 100;

  // Build a category card
  async function buildCategoryCard(parentFrame, startY, title, subtitle, rows) {
    var cardH = 112 + rows.length * ROW_H;
    var card = figma.createFrame();
    parentFrame.appendChild(card);
    card.name = title;
    card.x = 64; card.y = startY;
    card.resize(CARD_W, cardH);
    card.cornerRadius = 12;
    card.fills = [{ type: 'SOLID', color: CARD_BG }];
    card.strokes = [{ type: 'SOLID', color: CARD_BORDER }];
    card.strokeWeight = 1;
    card.clipsContent = true;
    bindFill(card, CARD_BG);
    bindStroke(card, CARD_BORDER);

    // Category title + description
    addText(card, CARD_PAD, 20, title, 18, 'Regular', TEXT_BRIGHT);
    addText(card, CARD_PAD, 48, subtitle, 12, 'Regular', TEXT_DIM);

    // Inner divider
    var divLine = figma.createRectangle();
    card.appendChild(divLine);
    divLine.x = CARD_PAD; divLine.y = 78;
    divLine.resize(INNER_W, 1);
    divLine.fills = [{ type: 'SOLID', color: CARD_BORDER }];
    bindFill(divLine, CARD_BORDER);

    // Column headers
    addText(card, 68, 92, '变量', 10, 'Regular', TEXT_MUTED);
    addText(card, 524, 92, 'Light', 10, 'Regular', TEXT_MUTED);
    addText(card, 684, 92, 'Dark', 10, 'Regular', TEXT_MUTED);
    addText(card, 844, 92, '说明', 10, 'Regular', TEXT_MUTED);

    // Data rows
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var rowY = 112 + ri * ROW_H;

      // Row frame
      var rowFrame = figma.createFrame();
      card.appendChild(rowFrame);
      rowFrame.name = row.name;
      rowFrame.x = CARD_PAD; rowFrame.y = rowY;
      rowFrame.resize(INNER_W, ROW_H);
      rowFrame.fills = [];
      rowFrame.clipsContent = true;

      // Color swatch (rounded rectangle)
      var swatch = figma.createRectangle();
      rowFrame.appendChild(swatch);
      swatch.x = 0; swatch.y = 10;
      swatch.resize(28, 28);
      swatch.cornerRadius = 6;
      var swatchHex = IS_LIGHT ? row.light : row.dark;
      var swatchRgb = hexToFigmaRgb(swatchHex || row.light);
      var rowAlpha = (row.alpha != null && row.alpha < 1) ? row.alpha : 1; // 半透明 token：色块按真实透明度渲染、色值附带百分比
      if (swatchRgb) {
        swatch.fills = [{ type: 'SOLID', color: swatchRgb, opacity: rowAlpha }];
        // Bind variable if available
        var v = allVars[row.varName];
        if (v) {
          swatch.fills = [figma.variables.setBoundVariableForPaint(swatch.fills[0], 'color', v)];
        }
      } else {
        swatch.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      }
      swatch.strokes = [{ type: 'SOLID', color: SWATCH_BORDER, opacity: 0.12 }];
      swatch.strokeWeight = 1;
      bindStroke(swatch, SWATCH_BORDER);

      // Variable name — vertically centered in 52px row (52-11)/2 ≈ 18
      addText(rowFrame, 44, 18, row.name, 11, 'Regular', TEXT_BRIGHT);
      // Light / Dark value（半透明 token 附带透明度百分比，区分「同色不同透明度」，不再看着像重复）
      var pctSuffix = (row.alpha != null && row.alpha < 1) ? ('  ' + (Math.round(row.alpha * 10000) / 100) + '%') : '';
      addText(rowFrame, 500, 18, (row.light || '-') + pctSuffix, 11, 'Regular', TEXT_DIM);
      addText(rowFrame, 660, 18, (row.dark || '-') + pctSuffix, 11, 'Regular', TEXT_DIM);
      // Usage
      addText(rowFrame, 820, 18, row.usage || '', 11, 'Regular', TEXT_DIM);

      // Bottom divider
      var rowDiv = figma.createRectangle();
      rowFrame.appendChild(rowDiv);
      rowDiv.x = 0; rowDiv.y = 51;
      rowDiv.resize(INNER_W, 1);
      rowDiv.fills = [{ type: 'SOLID', color: CARD_BORDER }];
      bindFill(rowDiv, CARD_BORDER);
    }

    return startY + cardH;
  }

  // Define semantic groups with Chinese titles matching source
  var semanticGroups = [
    { prefix: 'color.brand', title: '品牌颜色 — brand', subtitle: '品牌主色及其 8 级交互梯度，从最浅底色到最深强调。覆盖按钮、标签、卡片等全部品牌表达场景。' },
    { prefix: 'color.auxiliary', title: '辅助色 — auxiliary', subtitle: '辅助色用于分类标签、数据可视化、运营活动和品牌延展，不承担系统反馈含义。' },
    { prefix: 'color.function', title: '功能色 — function', subtitle: '用于成功、警告、危险和信息反馈的状态色，包含正色和浅底色两组。' },
    { prefix: 'color.text', title: '文本 / 图标颜色 — text', subtitle: '从主文本到水印的 8 级灰度梯度，确保每层信息有清晰的视觉优先级。图标颜色直接复用本组文本色（主图标=主文本、次要图标=次文本、禁用=禁用文本，反色场景用反色文本/常量白）。' },
    { prefix: 'color.bg', title: '背景颜色 — background', subtitle: '页面、容器、浮层和遮罩四个层级的界面背景，构建完整的空间层次。' },
    { prefix: 'color.border', title: '边框颜色 — border', subtitle: '分割线、输入框描边和卡片边界的三级边框色，从弱到强逐步增加存在感。' },
    { prefix: 'color.constant', title: '常量色 — constant', subtitle: '不跟随主题和深浅模式切换的固定颜色，适用于品牌资产和特殊图形。' },
  ];

  for (var gi = 0; gi < semanticGroups.length; gi++) {
    var group = semanticGroups[gi];
    // Keep definition order from JSON (no sort), matching web display
    var tokens = Object.entries(data.colorTokens)
      .filter(function(e) { return e[0].startsWith(group.prefix) && e[1].tier === 'semantic'; });

    if (tokens.length === 0) continue;

    var rows = [];
    for (var ti = 0; ti < tokens.length; ti++) {
      var tEntry = tokens[ti];
      rows.push({ name: tEntry[0], light: tEntry[1].light, dark: tEntry[1].dark, usage: tEntry[1].usage, varName: tEntry[1].figmaName, alpha: tEntry[1].alpha });
    }

    Y = await buildCategoryCard(frame, Y, group.title, group.subtitle, rows);
    Y += 28; // gap between cards (matching source: 28px)
  }

  // Opacity tokens as a card too
  var opacityTokens = Object.entries(data.dimTokens || {}).filter(function(e) { return e[0].startsWith('opacity.'); });
  if (opacityTokens.length > 0) {
    var opRows = [];
    for (var oi = 0; oi < opacityTokens.length; oi++) {
      var oEntry = opacityTokens[oi];
      var oVal = typeof oEntry[1].value === 'number' ? oEntry[1].value : parseFloat(oEntry[1].value);
      opRows.push({ name: oEntry[0], light: Math.round(oVal * 100) + '%', dark: Math.round(oVal * 100) + '%', usage: oEntry[1].usage || '', varName: '' });
    }
    Y = await buildCategoryCard(frame, Y, '透明度 — opacity', '标准化透明度阶梯，应用于悬停、按下、禁用态和遮罩层。', opRows);
    Y += 28;
  }

  figma.ui.postMessage({ type: 'progress', message: '语义色完成，正在生成字体/圆角/间距...' });

  // ===== SECTION 03: FONT FAMILY =====
  Y = addSection(frame, Y + 16, '03', '字体家族',
    '系统默认采用苹方 PingFang SC，保持中文界面在设计稿中的清晰度与一致性。');

  // CJK font card: left half
  var cjkCard = figma.createFrame();
  frame.appendChild(cjkCard);
  cjkCard.name = 'Font Card / CJK';
  cjkCard.x = 64; cjkCard.y = Y;
  cjkCard.resize(510, 256); cjkCard.cornerRadius = 12;
  cjkCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  cjkCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; cjkCard.strokeWeight = 1;
  bindFill(cjkCard, CARD_BG); bindStroke(cjkCard, CARD_BORDER);
  addText(cjkCard, 25, 24, 'CJK · 中文', 12, 'Regular', TEXT_MUTED);
  addText(cjkCard, 25, 50, fontConf.name, 56, 'Regular', TEXT_BRIGHT);
  addText(cjkCard, 25, 132, fontConf.stack, 12, 'Regular', TEXT_MUTED);
  // Weight specimens — each font shows its own weight ladder (fontConf.weights)
  var cjkWeights = fontConf.weights || W_PINGFANG;
  for (var cwi = 0; cwi < cjkWeights.length; cwi++) {
    var cw = cjkWeights[cwi];          // [label, numeric]
    var cwx = 25 + cwi * 72;
    addWeightText(cjkCard, cwx, 164, '字', 32, CJK_FAMILY, cw[0], TEXT_BRIGHT);
    addText(cjkCard, cwx, 202, cw[0], 11, 'Regular', TEXT_DIM);
    addText(cjkCard, cwx, 218, cw[1], 11, 'Regular', TEXT_MUTED);
  }

  // Latin font card: right half
  var latCard = figma.createFrame();
  frame.appendChild(latCard);
  latCard.name = 'Font Card / Latin';
  latCard.x = 590; latCard.y = Y;
  latCard.resize(526, 256); latCard.cornerRadius = 12;
  latCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  latCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; latCard.strokeWeight = 1;
  bindFill(latCard, CARD_BG); bindStroke(latCard, CARD_BORDER);
  addText(latCard, 25, 24, 'Latin · 西文', 12, 'Regular', TEXT_MUTED);
  addWeightText(latCard, 25, 50, 'Inter', 56, LAT_FAMILY, 'Regular', TEXT_BRIGHT);
  addText(latCard, 25, 132, 'Inter, system-ui', 12, 'Regular', TEXT_MUTED);
  var latWeights = [['Aa', 'Regular', '400', 0], ['Aa', 'Medium', '500', 72], ['Aa', 'Semi Bold', '600', 144], ['Aa', 'Bold', '700', 216]];
  for (var lwi = 0; lwi < latWeights.length; lwi++) {
    var lw = latWeights[lwi];
    addWeightText(latCard, 25 + lw[3], 164, lw[0], 32, LAT_FAMILY, lw[1], TEXT_BRIGHT);
    addText(latCard, 25 + lw[3], 202, lw[1], 11, 'Regular', TEXT_DIM);
    addText(latCard, 25 + lw[3], 218, lw[2], 11, 'Regular', TEXT_MUTED);
  }

  Y += 292; // 256 + 36 gap

  // ===== SECTION 04: TYPE SCALE =====
  Y = addSection(frame, Y, '04', '字号规范',
    '字体、字号和行高共同决定信息层级。每个 token 定义从展示标题到辅助说明的完整排印体系。');

  // Type scale rows are DERIVED from the exported font.size tokens (single
  // source of truth in tokens.js), descending (large → small) for display.
  var typeScaleRows = buildTypeScaleRows(data);

  var totalScaleRows = typeScaleRows.length;

  // Per-row height adapts to the sample font size so large rows (40/32px) don't overlap
  var tsRowHeights = [];
  for (var rh = 0; rh < typeScaleRows.length; rh++) {
    tsRowHeights.push(Math.max(64, Math.round(typeScaleRows[rh][1] * 1.5) + 26));
  }
  var tsRowsTotal = 0;
  for (var rt = 0; rt < tsRowHeights.length; rt++) tsRowsTotal += tsRowHeights[rt];
  var tsCardH = 64 + tsRowsTotal + 10;

  var tsCard = figma.createFrame();
  frame.appendChild(tsCard);
  tsCard.name = 'Type Scale';
  tsCard.x = 64; tsCard.y = Y;
  tsCard.resize(CARD_W, tsCardH); tsCard.cornerRadius = 12;
  tsCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  tsCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; tsCard.strokeWeight = 1;
  tsCard.clipsContent = true;
  bindFill(tsCard, CARD_BG); bindStroke(tsCard, CARD_BORDER);

  addText(tsCard, CARD_PAD, 22, '字号规范 · Type Scale', 18, 'Regular', TEXT_BRIGHT);
  addText(tsCard, 850, 24, 'BASE · 14px', 12, 'Regular', TEXT_MUTED);
  var tsDivTop = figma.createRectangle();
  tsCard.appendChild(tsDivTop); tsDivTop.x = CARD_PAD; tsDivTop.y = 64;
  tsDivTop.resize(INNER_W, 1); tsDivTop.fills = [{ type: 'SOLID', color: CARD_BORDER }];
  bindFill(tsDivTop, CARD_BORDER);

  var tsRowY = 64;
  for (var tsi = 0; tsi < typeScaleRows.length; tsi++) {
    var tsRow = typeScaleRows[tsi];
    var tsName = tsRow[0], tsSize = tsRow[1], tsWeight = tsRow[2], tsUsage = tsRow[3];
    var rowH = tsRowHeights[tsi];
    var tsLh = Math.round(tsSize * 1.5);
    // Left label block — vertically centered in the row
    var labelTop = tsRowY + Math.round((rowH - 34) / 2);
    addText(tsCard, CARD_PAD, labelTop, tsName, 13, 'Semi Bold', TEXT_BRIGHT);
    addText(tsCard, CARD_PAD, labelTop + 20, tsSize + ' / ' + tsLh + ' · w' + tsWeight, 11, 'Regular', TEXT_MUTED);
    // Sample text + px value — vertically centered
    addText(tsCard, 230, tsRowY + Math.round((rowH - tsSize) / 2), tsUsage, tsSize, 'Regular', TEXT_BRIGHT);
    addText(tsCard, 950, tsRowY + Math.round((rowH - 14) / 2), tsSize + 'px', 11, 'Semi Bold', TEXT_DIM);
    tsRowY += rowH;
    if (tsi < typeScaleRows.length - 1) {
      var tsDiv = figma.createRectangle();
      tsCard.appendChild(tsDiv); tsDiv.x = CARD_PAD; tsDiv.y = tsRowY;
      tsDiv.resize(INNER_W, 1); tsDiv.fills = [{ type: 'SOLID', color: CARD_BORDER }];
      bindFill(tsDiv, CARD_BORDER);
    }
  }
  Y += tsCardH + 48;

  // ===== SECTION 05: RADIUS =====
  var radiusTokens = Object.entries(data.dimTokens || {}).filter(function(e) { return e[0].startsWith('radius.'); });
  if (radiusTokens.length > 0) {
    Y = addSection(frame, Y, '05', '圆角',
      '7 个圆角变量定义界面的视觉气质，柔和策略适合移动端，克制策略适合工具型产品。');
    radiusTokens.sort(function(a, b) {
      var av = typeof a[1].value === 'string' ? parseInt(a[1].value) : a[1].value;
      var bv = typeof b[1].value === 'string' ? parseInt(b[1].value) : b[1].value;
      return av - bv;
    });
    // 4 per row, card 230×92, gap 33px horizontal, 30px vertical
    var rCardW = 230, rCardH = 92, rGapH = 33, rGapV = 30;
    for (var ri = 0; ri < radiusTokens.length; ri++) {
      var rEntry = radiusTokens[ri];
      var rKey = rEntry[0], rToken = rEntry[1];
      var rVal = typeof rToken.value === 'string' ? parseInt(rToken.value) : rToken.value;
      var rCol = ri % 4, rRow = Math.floor(ri / 4);
      var rX = 64 + rCol * (rCardW + rGapH);
      var rY = Y + rRow * (rCardH + rGapV);

      var rCard = figma.createFrame();
      frame.appendChild(rCard);
      rCard.name = rKey;
      rCard.x = rX; rCard.y = rY;
      rCard.resize(rCardW, rCardH); rCard.cornerRadius = 12;
      rCard.fills = [{ type: 'SOLID', color: CARD_BG }];
      rCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; rCard.strokeWeight = 1;
      bindFill(rCard, CARD_BG); bindStroke(rCard, CARD_BORDER);

      // Preview swatch 72×40: translucent fill layer + dashed border layer.
      // (Paint opacity is lost once a color variable is bound, so we use node.opacity.)
      var rSwatchRadius = Math.min(rVal, 20);
      // Fill layer — translucent brand tint
      var rSwatch = figma.createRectangle();
      rCard.appendChild(rSwatch);
      rSwatch.x = 24; rSwatch.y = 20;
      rSwatch.resize(72, 40);
      rSwatch.cornerRadius = rSwatchRadius;
      rSwatch.fills = [{ type: 'SOLID', color: brandRgb }];
      bindFill(rSwatch, brandRgb);
      rSwatch.opacity = 0.1;
      // Border layer — dashed brand outline on top
      var rBorder = figma.createRectangle();
      rCard.appendChild(rBorder);
      rBorder.x = 24; rBorder.y = 20;
      rBorder.resize(72, 40);
      rBorder.cornerRadius = rSwatchRadius;
      rBorder.fills = [];
      rBorder.strokes = [{ type: 'SOLID', color: brandRgb }];
      bindStroke(rBorder, brandRgb);
      rBorder.strokeWeight = 1.5;
      rBorder.dashPattern = [4, 4];
      rBorder.opacity = 0.65;

      addText(rCard, 116, 20, rKey, 12, 'Regular', TEXT_BRIGHT);
      addText(rCard, 116, 42, rVal + 'px', 12, 'Regular', TEXT_DIM);
    }
    var rTotalRows = Math.ceil(radiusTokens.length / 4);
    Y += rTotalRows * (rCardH + rGapV) + 16;
  }

  // ===== SECTION 06: SHADOWS =====
  Y = addSection(frame, Y + 16, '06', '阴影',
    '阴影区分浅色和深色界面，深色模式使用高光、轮廓和投影组合来表达层级。');

  var shadowDefs = [
    { name: 'shadow.none', label: 'None', params: '无阴影', effects: [] },
    { name: 'shadow.sm', label: 'SM',
      params: '投影 · X0 Y2 B8 S0 \u03b17%',
      effects: [{ type: 'DROP_SHADOW', color: {r:0.08,g:0.12,b:0.22,a:0.07}, offset:{x:0,y:2}, radius:8, spread:0, visible:true, blendMode:'NORMAL'}] },
    { name: 'shadow.md', label: 'MD',
      params: '投影 · X0 Y8 B24 S0 \u03b116%',
      effects: [{ type: 'DROP_SHADOW', color: {r:0.08,g:0.12,b:0.22,a:0.16}, offset:{x:0,y:8}, radius:24, spread:0, visible:true, blendMode:'NORMAL'}] },
    { name: 'shadow.lg', label: 'LG',
      params: '投影 · X0 Y18 B48 S0 \u03b118%',
      effects: [{ type: 'DROP_SHADOW', color: {r:0.08,g:0.12,b:0.22,a:0.18}, offset:{x:0,y:18}, radius:48, spread:0, visible:true, blendMode:'NORMAL'}] },
    { name: 'shadow.overlay', label: 'Overlay',
      params: '投影 · X0 Y24 B64 S0 \u03b122%',
      effects: [{ type: 'DROP_SHADOW', color: {r:0,g:0,b:0,a:0.22}, offset:{x:0,y:24}, radius:64, spread:0, visible:true, blendMode:'NORMAL'}] }
  ];

  // 3 columns card grid, matching web layout
  var sCardW = 340, sCardH = 170, sGapH = 16, sGapV = 16;
  for (var si = 0; si < shadowDefs.length; si++) {
    var sd = shadowDefs[si];
    var sCol = si % 3, sRow = Math.floor(si / 3);
    var sX = 64 + sCol * (sCardW + sGapH);
    var sY = Y + sRow * (sCardH + sGapV);

    var sCard = figma.createFrame();
    frame.appendChild(sCard);
    sCard.name = sd.name;
    sCard.x = sX; sCard.y = sY;
    sCard.resize(sCardW, sCardH); sCard.cornerRadius = 12;
    sCard.fills = [{ type: 'SOLID', color: CARD_BG }];
    sCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; sCard.strokeWeight = 1;
    bindFill(sCard, CARD_BG); bindStroke(sCard, CARD_BORDER);

    // Preview box
    var sSwatch = figma.createRectangle();
    sCard.appendChild(sSwatch);
    sSwatch.x = 19; sSwatch.y = 19;
    sSwatch.resize(302, 64); sSwatch.cornerRadius = 10;
    // Bind the demo block to the page-bg variable so it follows the Figma display
    // mode (light → light, dark → dark) instead of being baked at generation time.
    sSwatch.fills = [{ type: 'SOLID', color: CANVAS_BG }];
    bindFill(sSwatch, CANVAS_BG);
    sSwatch.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; sSwatch.strokeWeight = 1;
    bindStroke(sSwatch, CARD_BORDER);
    sSwatch.effects = sd.effects;

    // Token name + label
    addText(sCard, 19, 96, sd.name, 11, 'Regular', TEXT_MUTED);
    addText(sCard, 280, 96, sd.label, 11, 'Regular', TEXT_MUTED);

    // Layer params
    addText(sCard, 19, 120, sd.params, 10, 'Regular', TEXT_MUTED);
  }
  var sTotalRows = Math.ceil(shadowDefs.length / 3);
  Y += sTotalRows * (sCardH + sGapV) + 32;

  // ===== SECTION 07: SPACING =====
  var spaceTokens = Object.entries(data.dimTokens || {}).filter(function(e) { return e[0].startsWith('space.'); });
  if (spaceTokens.length > 0) {
    Y = addSection(frame, Y, '07', '间距',
      '间距变量用于页面留白、组件内边距和列表节奏，保证界面在不同页面中保持一致密度。');

    spaceTokens.sort(function(a, b) {
      var av = typeof a[1].value === 'string' ? parseInt(a[1].value) : a[1].value;
      var bv = typeof b[1].value === 'string' ? parseInt(b[1].value) : b[1].value;
      return av - bv;
    });

    // 5 per row, card 180×68, gap 30px horizontal, 26px vertical
    var spCardW = 180, spCardH = 68, spGapH = 30, spGapV = 26;
    for (var spi = 0; spi < spaceTokens.length; spi++) {
      var spEntry = spaceTokens[spi];
      var spKey = spEntry[0], spToken = spEntry[1];
      var spVal = typeof spToken.value === 'string' ? parseInt(spToken.value) : spToken.value;
      var spCol = spi % 5, spRow = Math.floor(spi / 5);
      var spX = 64 + spCol * (spCardW + spGapH);
      var spY = Y + spRow * (spCardH + spGapV);

      var spCard = figma.createFrame();
      frame.appendChild(spCard);
      spCard.name = spKey;
      spCard.x = spX; spCard.y = spY;
      spCard.resize(spCardW, spCardH); spCard.cornerRadius = 12;
      spCard.fills = [{ type: 'SOLID', color: CARD_BG }];
      spCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; spCard.strokeWeight = 1;
      bindFill(spCard, CARD_BG); bindStroke(spCard, CARD_BORDER);

      // Token name + value
      addText(spCard, 16, 14, spKey, 12, 'Regular', TEXT_BRIGHT);
      addText(spCard, 126, 14, spVal + 'px', 12, 'Regular', TEXT_DIM);

      // Bar visualization — follows the brand/primary color
      var barW = Math.max(spVal * 2, 4);
      var spBar = figma.createRectangle();
      spCard.appendChild(spBar);
      spBar.x = 16; spBar.y = 44;
      spBar.resize(Math.min(barW, 148), 8); spBar.cornerRadius = 4;
      spBar.fills = [{ type: 'SOLID', color: brandRgb }];
      bindFill(spBar, brandRgb);
    }
    var spTotalRows = Math.ceil(spaceTokens.length / 5);
    Y += spTotalRows * (spCardH + spGapV) + 16;
  }

  // Footer
  Y += 32;
  addLine(frame, 64, Y, CARD_W);
  addText(frame, 64, Y + 16, 'Generated by Design System v2 Plugin · ' + data.name + ' · ' + platLabel + ' · v' + data.version, 12, 'Regular', TEXT_MUTED);
  addText(frame, 64, Y + 36, 'Primitives: ' + data.colorCount + ' color tokens · Dimensions: ' + data.dimCount + ' tokens', 12, 'Regular', TEXT_MUTED);

  frame.resize(1180, Y + 56);
  figma.viewport.scrollAndZoomIntoView([frame]);
  return frame.id;
}

// =============================================
// Message Handler
// =============================================
/* ==========================================================================
 * 2.0 反推设计规范 · 阶段① 审计（纯增量，不改动以上任何同步/生成逻辑）
 * 选中画板 → 采集已用样式 → 频率统计 + 近重复/不一致检测 → 审计报告（只读）
 * ========================================================================== */

// === AUDIT-CORE-START (纯函数，无 Figma API，可在 Node 中切片单测) ===
function auditHexToRgb(hex) {
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  var n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function auditSrgbToLin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function auditHexToLab(hex) {
  var rgb = auditHexToRgb(hex);
  var r = auditSrgbToLin(rgb.r), g = auditSrgbToLin(rgb.g), b = auditSrgbToLin(rgb.b);
  var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  var y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  var z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116; };
  var fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function auditDeltaE(h1, h2) {
  var a = auditHexToLab(h1), b = auditHexToLab(h2);
  var dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
// 中性判定用感知色度（Lab chroma），而非 HSL 饱和度 —— 暗色/亮色近灰在 HSL 下
// 饱和度会虚高，Lab chroma 能稳定区分「灰/微染中性」与「品牌彩色」。
function auditChroma(hex) {
  var l = auditHexToLab(hex);
  return Math.sqrt(l.a * l.a + l.b * l.b);
}
function auditIsNeutral(hex, base) {
  base = base == null ? 10 : base;
  var lab = auditHexToLab(hex);
  var C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  // 暗端（及极亮端）给更高容差：微染中性在 L 极端处 chroma 天然偏高，
  // 固定阈值会把深色 UI 背景（如 #111827 / #0F172A）误判成彩色。
  var ext = lab.L < 30 ? (30 - lab.L) * 0.5 : (lab.L > 85 ? (lab.L - 85) * 0.5 : 0);
  return C <= base + ext;
}
function auditTally(values) {
  var m = new Map();
  for (var i = 0; i < values.length; i++) { var k = values[i]; m.set(k, (m.get(k) || 0) + 1); }
  var out = []; m.forEach(function (count, value) { out.push({ value: value, count: count }); });
  out.sort(function (a, b) { return b.count - a.count; });
  return out;
}
function auditClusterNumbers(values, tol) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var clusters = [];
  for (var i = 0; i < sorted.length; i++) {
    var v = sorted[i], last = clusters[clusters.length - 1];
    if (last && Math.abs(v - last.rep) <= tol) { last.members.push(v); last.count++; }
    else clusters.push({ rep: v, members: [v], count: 1 });
  }
  clusters.forEach(function (c) { c.rep = auditTally(c.members)[0].value; });
  return clusters;
}
function auditClusterColors(hexes, thr) {
  var seen = {}, uniq = [];
  for (var i = 0; i < hexes.length; i++) { var h = hexes[i]; if (!seen[h]) { seen[h] = 0; uniq.push(h); } seen[h]++; }
  var clusters = [];
  uniq.forEach(function (h) {
    var best = null, bestD = Infinity;
    for (var j = 0; j < clusters.length; j++) { var d = auditDeltaE(h, clusters[j].rep); if (d < bestD) { bestD = d; best = clusters[j]; } }
    if (best && bestD <= thr) {
      best.members.push(h); best.count += seen[h];
      if (seen[h] > best.repCount) { best.rep = h; best.repCount = seen[h]; }
    } else clusters.push({ rep: h, repCount: seen[h], members: [h], count: seen[h] });
  });
  return clusters;
}
// 把采集到的原始样式（plain data）汇总成审计报告
function buildAuditReport(obs, opts) {
  opts = opts || {};
  var colorDelta = opts.colorDelta == null ? 2.5 : opts.colorDelta;
  var chromaNeutral = opts.chromaNeutral == null ? 10 : opts.chromaNeutral;
  var grid = opts.grid == null ? 4 : opts.grid;
  var fills = obs.fills || [], strokes = obs.strokes || [], texts = obs.texts || [],
      radii = obs.radii || [], shadows = obs.shadows || [], spacings = obs.spacings || [];

  // 颜色：填充 + 描边
  var colorHexes = fills.map(function (f) { return f.hex; }).concat(strokes.map(function (s) { return s.hex; }));
  var colorTally = auditTally(colorHexes);
  var clusters = auditClusterColors(colorHexes, colorDelta);
  var neutralCount = 0, chromaticCount = 0;
  colorTally.forEach(function (t) { if (auditIsNeutral(t.value, chromaNeutral)) neutralCount++; else chromaticCount++; });
  var nearDupes = [], maxN = Math.min(colorTally.length, 300);
  for (var i = 0; i < maxN && nearDupes.length < 40; i++) {
    for (var j = i + 1; j < maxN; j++) {
      var d = auditDeltaE(colorTally[i].value, colorTally[j].value);
      if (d > 0 && d < colorDelta) nearDupes.push({ a: colorTally[i].value, b: colorTally[j].value, deltaE: Math.round(d * 10) / 10 });
    }
  }
  nearDupes.sort(function (a, b) { return a.deltaE - b.deltaE; });

  // 字体
  var sizeTally = auditTally(texts.map(function (t) { return t.size; })).sort(function (a, b) { return a.value - b.value; });
  var familyTally = auditTally(texts.map(function (t) { return t.family; }).filter(Boolean));
  var styleTally = auditTally(texts.map(function (t) { return t.style; }).filter(Boolean));
  // 圆角 / 阴影 / 间距
  var radiusTally = auditTally(radii).sort(function (a, b) { return a.value - b.value; });
  var shadowTally = auditTally(shadows.map(function (s) {
    return s.type + ' ' + s.x + '/' + s.y + ' b' + s.blur + ' s' + s.spread + ' ' + s.hex + '@' + (Math.round((s.alpha == null ? 1 : s.alpha) * 100) / 100);
  }));
  var spacingTally = auditTally(spacings).sort(function (a, b) { return a.value - b.value; });
  var offGrid = spacingTally.filter(function (t) { return (Number(t.value) % grid) !== 0; }).map(function (t) { return t.value; });

  var flags = [];
  if (nearDupes.length) flags.push({ level: 'warn', text: '发现 ' + nearDupes.length + ' 对几乎重复的颜色（ΔE<' + colorDelta + '），建议合并' });
  if (colorTally.length) flags.push({ level: 'info', text: '颜色 ' + colorTally.length + ' 种 → 可归并为约 ' + clusters.length + ' 组（中性 ' + neutralCount + ' · 彩色 ' + chromaticCount + '）' });
  if (sizeTally.length > 6) flags.push({ level: 'warn', text: '字号 ' + sizeTally.length + ' 档偏多，建议收敛到 5–7 档' });
  if (familyTally.length > 2) flags.push({ level: 'warn', text: '字体家族 ' + familyTally.length + ' 种：' + familyTally.slice(0, 4).map(function (f) { return f.value; }).join('、') });
  if (offGrid.length) flags.push({ level: 'warn', text: '间距有 ' + offGrid.length + ' 个不在 ' + grid + 'px 网格：' + offGrid.slice(0, 10).join(', ') });
  if (radiusTally.length > 5) flags.push({ level: 'info', text: '圆角 ' + radiusTally.length + ' 种，可考虑收敛' });
  if (shadowTally.length > 4) flags.push({ level: 'info', text: '阴影 ' + shadowTally.length + ' 种' });
  if (!flags.length) flags.push({ level: 'info', text: '样式较为统一，未发现明显冗余 👍' });

  return {
    counts: { nodes: obs.nodeCount || 0, fills: fills.length, strokes: strokes.length, texts: texts.length, radii: radii.length, shadows: shadows.length, spacings: spacings.length },
    truncated: !!obs.truncated,
    colors: { uniqueCount: colorTally.length, clusterCount: clusters.length, neutralCount: neutralCount, chromaticCount: chromaticCount, top: colorTally.slice(0, 12), nearDupes: nearDupes.slice(0, 20) },
    type: { sizeCount: sizeTally.length, sizes: sizeTally, families: familyTally, styles: styleTally },
    radius: { uniqueCount: radiusTally.length, values: radiusTally },
    shadow: { uniqueCount: shadowTally.length, list: shadowTally.slice(0, 12) },
    spacing: { uniqueCount: spacingTally.length, values: spacingTally, offGrid: offGrid },
    flags: flags,
  };
}
// === AUDIT-CORE-END ===

// === REBUILD-CORE-START (纯函数；依赖 AUDIT-CORE，可在 Node 切片单测) ===
// 阶段②：把采集到的原始样式聚类、推断语义角色，重建成一套干净 token + 映射表。
var REBUILD_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
function rebuildHueDeg(hex) {
  var rgb = auditHexToRgb(hex), r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return h;
}
function rebuildSemanticBand(hue) {
  if (hue < 15 || hue >= 345) return 'error';   // 红
  if (hue < 70) return 'warning';               // 橙黄
  if (hue < 170) return 'success';              // 绿
  if (hue < 250) return 'info';                 // 青蓝
  return null;                                  // 紫/品红/粉 → accent
}
function rebuildLStep(L) {
  var idx = Math.round((100 - L) / 100 * (REBUILD_STEPS.length - 1));
  return Math.max(0, Math.min(REBUILD_STEPS.length - 1, idx));
}
// 数值规整：把字号/圆角/间距里带小数的值四舍五入到最近整数（亚像素噪声 → 整数），
// 整数保持不变；过滤掉 ≤0 与非有限值。保留重复（供 auditTally 计数 / 后续去重）。
function rebuildRoundDims(arr) {
  var out = [];
  (arr || []).forEach(function (v) {
    if (typeof v === 'number' && isFinite(v)) { var r = Math.round(v); if (r > 0) out.push(r); }
  });
  return out;
}
function rebuildColorSystem(obs, opts) {
  opts = opts || {};
  var delta = opts.colorDelta == null ? 2.5 : opts.colorDelta;
  var chromaT = opts.chromaNeutral == null ? 10 : opts.chromaNeutral;
  var hexes = (obs.fills || []).map(function (f) { return f.hex; }).concat((obs.strokes || []).map(function (s) { return s.hex; }));
  var clusters = auditClusterColors(hexes, delta).map(function (c) {
    return { hex: c.rep, count: c.count, members: c.members, L: auditHexToLab(c.rep).L, chroma: auditChroma(c.rep), hue: rebuildHueDeg(c.rep) };
  });
  var neutrals = clusters.filter(function (c) { return auditIsNeutral(c.hex, chromaT); });
  var chromatics = clusters.filter(function (c) { return !auditIsNeutral(c.hex, chromaT); });
  var mapping = [];
  // 映射表记录簇内每个原始 hex → token（阶段③写回绑定要靠它）
  function mapCluster(c, name) { (c.members || [c.hex]).forEach(function (h) { mapping.push({ kind: 'color', from: h, to: name }); }); }

  // 中性阶：按亮度从浅到深「顺序」赋唯一阶名（50…900，超过 10 个再续 950/1000…）。
  // 避免旧的「按亮度映射到固定 10 档 + 撞档下沉」导致一堆都叫 neutral.50 的 bug。
  neutrals.sort(function (a, b) { return b.L - a.L; }); // 浅 → 深
  var neutralRamp = neutrals.map(function (c, i) {
    var step = i < REBUILD_STEPS.length ? REBUILD_STEPS[i] : (900 + (i - REBUILD_STEPS.length + 1) * 50);
    var name = 'color.neutral.' + step;
    mapCluster(c, name);
    return { name: name, step: step, hex: c.hex, count: c.count };
  });

  // 主色：按「频率 × 彩度」选基准——避免高频但发灰的文本色（如蓝灰 slate）压过真正鲜明的品牌色。
  chromatics.sort(function (a, b) { return (b.count * b.chroma) - (a.count * a.chroma); });
  var primaryRamp = [], semantic = {}, accents = [], used = {};
  if (chromatics.length) {
    var base = chromatics[0];
    var family = chromatics.filter(function (c) { var dh = Math.abs(c.hue - base.hue); dh = Math.min(dh, 360 - dh); return dh <= 18; });
    family.forEach(function (c) { used[c.hex] = true; });
    family.sort(function (a, b) { return b.L - a.L; });
    var usedP = {};
    primaryRamp = family.map(function (c) {
      var idx = rebuildLStep(c.L);                 // 按亮度取档；撞档时就近找空位（保住 300/500 这类直观档名）
      if (usedP[idx]) {
        for (var d = 1; d < REBUILD_STEPS.length; d++) {
          if (idx + d < REBUILD_STEPS.length && !usedP[idx + d]) { idx = idx + d; break; }
          if (idx - d >= 0 && !usedP[idx - d]) { idx = idx - d; break; }
        }
      }
      usedP[idx] = true;
      var step = REBUILD_STEPS[idx], name = 'color.primary.' + step;
      mapCluster(c, name);
      return { name: name, step: step, hex: c.hex, count: c.count };
    });
    // 语义色：从非主色家族的彩色簇里，按色相带各取最频繁者
    var bands = {};
    chromatics.filter(function (c) { return !used[c.hex]; }).forEach(function (c) {
      var band = rebuildSemanticBand(c.hue);
      if (band && (!bands[band] || c.count > bands[band].count)) bands[band] = c;
    });
    ['error', 'warning', 'success', 'info'].forEach(function (band) {
      if (bands[band]) {
        var c = bands[band], name = 'color.' + band;
        semantic[band] = { name: name, hex: c.hex, count: c.count, hue: Math.round(c.hue) };
        mapCluster(c, name);
        used[c.hex] = true;
      }
    });
    // 强调色：剩余彩色簇（最多 4 个）
    var ai = 1;
    chromatics.filter(function (c) { return !used[c.hex]; }).slice(0, 4).forEach(function (c) {
      var name = 'color.accent.' + ai;
      accents.push({ name: name, hex: c.hex, count: c.count });
      mapCluster(c, name);
      ai++;
    });
  }
  return { neutral: neutralRamp, primary: primaryRamp, semantic: semantic, accents: accents, mapping: mapping };
}
// 字号：保真——每个实际字号各成一档（不收敛），按 body 锚点命名角色。
function rebuildTypeScale(obs) {
  var texts = obs.texts || [];
  var tally = auditTally(rebuildRoundDims(texts.map(function (t) { return t.size; }))); // 小数字号规整为整数
  if (!tally.length) return { roles: [], mapping: [], rawCount: 0 };
  var levels = tally.slice().sort(function (a, b) { return a.value - b.value; });
  var body = null, bestCount = -1;
  levels.forEach(function (l) { if (l.value >= 12 && l.value <= 18 && l.count > bestCount) { bestCount = l.count; body = l.value; } });
  if (body == null) body = levels[Math.floor(levels.length / 2)].value;
  var bodyIdx = 0;
  for (var i = 0; i < levels.length; i++) { if (levels[i].value === body) { bodyIdx = i; break; } }
  var below = ['callout', 'footnote', 'caption', 'caption2', 'micro'];
  var above = ['headline', 'subtitle', 'title3', 'title2', 'title1', 'largeTitle', 'display'];
  var mapping = [];
  var roles = levels.map(function (l, i) {
    var off = i - bodyIdx, role;
    if (off === 0) role = 'body';
    else if (off < 0) role = below[(-off) - 1] || ('xs' + (-off));
    else role = above[off - 1] || ('xl' + off);
    var name = 'font.size.' + role;
    mapping.push({ kind: 'size', from: l.value, to: name });
    return { role: role, name: name, size: l.value, count: l.count };
  });
  return { roles: roles, mapping: mapping, rawCount: levels.length };
}
// 圆角：保真——每个实际圆角各成一档（不收敛）；所有 ≥100 的「全圆/胶囊」合并为一个 radius.full。
function rebuildRadius(obs) {
  var tally = auditTally(rebuildRoundDims(obs.radii)); // 小数圆角规整为整数
  if (!tally.length) return { scale: [], mapping: [], rawCount: 0 };
  var levels = tally.slice().sort(function (a, b) { return a.value - b.value; });
  var smalls = levels.filter(function (l) { return l.value < 100; });
  var fulls = levels.filter(function (l) { return l.value >= 100; });
  var names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'], mapping = [], scale = [];
  smalls.forEach(function (l, i) {
    var name = 'radius.' + (names[i] || ('r' + l.value));
    mapping.push({ kind: 'radius', from: l.value, to: name });
    scale.push({ name: name, value: l.value, count: l.count });
  });
  if (fulls.length) {                                  // 999 / 9999 等统一成一个 full
    var maxV = 0, total = 0;
    fulls.forEach(function (l) { if (l.value > maxV) maxV = l.value; total += l.count; mapping.push({ kind: 'radius', from: l.value, to: 'radius.full' }); });
    scale.push({ name: 'radius.full', value: maxV, count: total });
  }
  return { scale: scale, mapping: mapping, rawCount: levels.length };
}
// 间距：保真——每个实际间距各成一档（不吸附网格、不收敛）。
function rebuildSpacing(obs) {
  var tally = auditTally(rebuildRoundDims(obs.spacings)); // 小数间距规整为整数
  if (!tally.length) return { scale: [], mapping: [], rawCount: 0 };
  var levels = tally.slice().sort(function (a, b) { return a.value - b.value; });
  var mapping = [];
  var scale = levels.map(function (l, i) {
    var name = 'space.' + (i + 1);
    mapping.push({ kind: 'spacing', from: l.value, to: name });
    return { name: name, value: l.value, count: l.count };
  });
  return { scale: scale, mapping: mapping, rawCount: levels.length };
}
function rebuildShadow(obs) {
  var map = {};
  (obs.shadows || []).forEach(function (s) {
    var sig = s.type + ' ' + s.x + '/' + s.y + ' b' + s.blur + ' s' + s.spread + ' ' + s.hex + '@' + (Math.round((s.alpha == null ? 1 : s.alpha) * 100) / 100);
    if (!map[sig]) map[sig] = { sig: sig, blur: s.blur, count: 0 };
    map[sig].count++;
  });
  var arr = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.blur - b.blur; });
  var names = ['sm', 'md', 'lg', 'xl', '2xl'], mapping = [];
  var scale = arr.map(function (o, i) {
    var name = 'shadow.' + (names[i] || ('s' + i));
    mapping.push({ kind: 'shadow', from: o.sig, to: name });
    return { name: name, sig: o.sig, count: o.count };
  });
  return { scale: scale, mapping: mapping };
}
function buildRebuildPlan(obs, opts) {
  opts = opts || {};
  // 保真：颜色按 ΔE 做肉眼无差的合并（固定 2.5），字号/圆角/间距保留实际值不收敛。
  var colorDelta = opts.colorDelta != null ? opts.colorDelta : 1.0; // 只合并肉眼无差(ΔE<1)，保留可区分的近似色（如两档深背景）
  var colors = rebuildColorSystem(obs, { colorDelta: colorDelta, chromaNeutral: opts.chromaNeutral });
  var type = rebuildTypeScale(obs);
  var radius = rebuildRadius(obs);
  var spacing = rebuildSpacing(obs);
  var shadow = rebuildShadow(obs);
  var mapping = [].concat(colors.mapping, type.mapping, radius.mapping, spacing.mapping, shadow.mapping);
  var tokenCount = colors.neutral.length + colors.primary.length + Object.keys(colors.semantic).length + colors.accents.length
    + type.roles.length + radius.scale.length + spacing.scale.length + shadow.scale.length;
  var detected = rebuildDetectTheme(obs);
  return { theme: detected, detectedTheme: detected, context: rebuildContextColors(obs), colors: colors, type: type, radius: radius, spacing: spacing, shadow: shadow, mapping: mapping, tokenCount: tokenCount };
}
function rebuildSetDeep(obj, dotted, val) {
  var parts = dotted.split('.'), cur = obj;
  for (var i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = val;
}
function rebuildToJson(plan) {
  var out = { $meta: { generator: 'Design System v2 · 反推重建', tokenCount: plan.tokenCount } };
  plan.colors.neutral.forEach(function (t) { rebuildSetDeep(out, t.name, t.hex); });
  plan.colors.primary.forEach(function (t) { rebuildSetDeep(out, t.name, t.hex); });
  Object.keys(plan.colors.semantic).forEach(function (k) { rebuildSetDeep(out, plan.colors.semantic[k].name, plan.colors.semantic[k].hex); });
  plan.colors.accents.forEach(function (t) { rebuildSetDeep(out, t.name, t.hex); });
  plan.type.roles.forEach(function (r) { rebuildSetDeep(out, r.name, r.size); });
  plan.radius.scale.forEach(function (r) { rebuildSetDeep(out, r.name, r.value); });
  plan.spacing.scale.forEach(function (s) { rebuildSetDeep(out, s.name, s.value); });
  plan.shadow.scale.forEach(function (s) { rebuildSetDeep(out, s.name, s.sig); });
  return JSON.stringify(out, null, 2);
}
// 把反推 plan 翻译成正向预览 generatePreview 吃的数据结构（纯函数，便于单测）。
// 单模式：dark=light。从中性阶推导 文本/背景/边框 语义层，让预览和正向一样丰满。
// RGB→HSL（仅供明暗判定取亮度用）。
function rebuildRgbToHsl(hex) {
  var c = auditHexToRgb(hex), r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: h, s: s * 100, l: l * 100 };
}
// 与基础色谱一致的色相锚点（generatePreview 只渲染这几族 + primary/gray）。
var REBUILD_SPECTRUM = { red: 4, orange: 32, yellow: 52, green: 146, cyan: 188, blue: 214, purple: 268 };
function rebuildHueFamily(hue) {
  var best = null, bd = 999;
  for (var name in REBUILD_SPECTRUM) {
    var dh = Math.abs(hue - REBUILD_SPECTRUM[name]); dh = Math.min(dh, 360 - dh);
    if (dh < bd) { bd = dh; best = name; }
  }
  return best;
}
// 明暗判定：用「面积最大的填充」（页面背景天然占面积最大），而不是出现次数——
// 深色 UI 里浅色文本出现最频繁，按次数会误判成浅色。
function rebuildDetectTheme(obs) {
  // 主题看「背景」：只算非文字、非渐变色标的填充，且按「面积 × 不透明度」加权——
  // 否则大面积半透明白蒙层、或满屏白色文字会把暗底误判成亮底。
  var area = {}, fills = obs.fills || [];
  function isBg(f) { return f && f.nodeType !== 'TEXT' && !f.fromGradient; }
  for (var i = 0; i < fills.length; i++) {
    var f = fills[i]; if (!isBg(f)) continue;
    var op = (f.opacity == null ? 1 : f.opacity);
    area[f.hex] = (area[f.hex] || 0) + (f.area || 0) * op;
  }
  var best = null, ba = -1;
  for (var h in area) { if (area[h] > ba) { ba = area[h]; best = h; } }
  if (!best || ba <= 0) {                       // 没有面积信息时退回按次数（仍优先背景填充）
    var bgFills = fills.filter(isBg);
    var t = auditTally((bgFills.length ? bgFills : fills).map(function (f) { return f.hex; }));
    best = t.length ? t[0].value : '#FFFFFF';
  }
  return rebuildRgbToHsl(best).l < 50 ? 'dark' : 'light';
}
// 按「用途上下文」识别语义角色（全部用真实检测色）：
// 背景 = 大面积容器填充（按面积，最大 = 页面）；文本 = 用在文字图层的色；边框 = 描边色。
// 不透明度保留 4 位小数：清掉浮点噪声但「不舍掉极小值」——0.01%(=0.0001) 这种触发背景模糊的填充不能被舍成 0。
// （「消小数点」是针对尺寸 px 的规则，不套用到不透明度；反推场景要尽量还原。）
function rebuildOpacity(v) { return (v == null ? 1 : Math.round(v * 10000) / 10000); }
function rebuildContextColors(obs) {
  var fills = obs.fills || [], strokes = obs.strokes || [], map = {};
  // 颜色身份 = hex + 不透明度：白@5% 与 白@100% 是不同的色（半透明绑定后靠变量自带 alpha 还原）
  function rec(hex, op) { var key = hex + '@' + op; if (!map[key]) map[key] = { hex: hex, opacity: op, textArea: 0, bgArea: 0, strokeCount: 0 }; return map[key]; }
  // 图标/矢量类不算「背景」——否则深色 UI 里成片的白色图标会把白色顶进背景色。它们的色仍会进 palette（聚类），绑定照常。
  function isIconType(t) { return t === 'VECTOR' || t === 'BOOLEAN_OPERATION' || t === 'STAR' || t === 'LINE' || t === 'REGULAR_POLYGON' || t === 'POLYGON'; }
  fills.forEach(function (f) { var m = rec(f.hex, rebuildOpacity(f.opacity)); if (f.fromGradient) m.fromGradient = true; if (f.nodeType === 'TEXT') m.textArea += (f.area || 1); else if (!isIconType(f.nodeType)) m.bgArea += (f.area || 1); });
  strokes.forEach(function (s) { var m = rec(s.hex, rebuildOpacity(s.opacity)); if (s.fromGradient) m.fromGradient = true; m.strokeCount++; });
  var all = Object.keys(map).map(function (k) { return map[k]; });
  return {
    text: all.filter(function (m) { return m.textArea > 0; }).sort(function (a, b) { return b.textArea - a.textArea; }),
    bg: all.filter(function (m) { return m.bgArea > 0; }).sort(function (a, b) { return b.bgArea - a.bgArea; }),
    border: all.filter(function (m) { return m.strokeCount > 0; }).sort(function (a, b) { return b.strokeCount - a.strokeCount; }),
  };
}
function rebuildDedupeColors(list, thr) {
  var out = [];
  // 仅当色相接近「且」不透明度也接近时才合并——否则白@5% 会被白@100% 吞掉
  (list || []).forEach(function (m) { if (!out.some(function (o) { return auditDeltaE(o.hex, m.hex) < thr && Math.abs(rebuildOpacity(o.opacity) - rebuildOpacity(m.opacity)) < 0.03; })) out.push(m); });
  return out;
}
// 统一数据构造（预览 + 变量库 + 绑定共用）：全部真实检测色 + 按用途归类的语义层。
function rebuildToData(plan) {
  var colorTokens = {}, dimTokens = {};
  function fn(k) { return k.replace(/\./g, '/'); }
  function addC(key, hex, tier, usage, alpha) { if (!hex || colorTokens[key]) return; var o = { figmaName: fn(key), tier: tier || 'primitive', light: hex, dark: hex, usage: usage || '' }; if (alpha != null && alpha < 1) o.alpha = alpha; colorTokens[key] = o; }
  function addD(key, value, extra) { var o = { figmaName: fn(key), tier: 'primitive', value: value, type: 'dimension', usage: '' }; if (extra) for (var k in extra) o[k] = extra[k]; dimTokens[key] = o; }
  var C = plan.colors, ctx = plan.context || { text: [], bg: [], border: [] };

  // ① 清「发灰」主色：中段明度若饱和度太低，其实是偏灰的中性色（被色相归进主色族），清出去归到 gray，
  // 否则插在鲜艳主色中间让色阶看着乱。亮/暗端天然低饱和→豁免（保住浅紫淡彩、深色品牌阶）。
  function rbMuddyBrand(hex) { var lab = auditHexToLab(hex); var minC = 30 * (1 - Math.abs(lab.L - 50) / 50); return auditChroma(hex) < minC; }
  var primVivid = [], primMuddy = [];
  C.primary.forEach(function (t) { (rbMuddyBrand(t.hex) ? primMuddy : primVivid).push(t); });
  if (!primVivid.length) { primVivid = C.primary.slice(); primMuddy = []; } // 兜底：全被判灰则不清，保留原主色
  function rbByLabLDesc(a, b) { return auditHexToLab(b.hex).L - auditHexToLab(a.hex).L; }
  // 主色阶按「明度浅→深」排序，下标即明度档位(0=最浅、N-1=最深)——品牌阶名与明度严格对齐、换肤也好对齐。
  var primSorted = primVivid.slice().sort(rbByLabLDesc);
  var grayPool = C.neutral.concat(primMuddy).slice().sort(rbByLabLDesc); // 清出的发灰主色并入 gray，按明度排
  // 基础色 primitives：全部真实检测色（generatePreview 用 primary 大色块 + gray + 七色族）
  primSorted.forEach(function (t, i) { addC('color.palette.primary.' + i, t.hex, 'primitive'); });
  grayPool.forEach(function (t, i) { addC('color.palette.gray.' + i, t.hex, 'primitive'); });
  var famN = {};
  function toFam(hex) { var f = rebuildHueFamily(rebuildHueDeg(hex)); famN[f] = famN[f] || 0; addC('color.palette.' + f + '.' + famN[f], hex, 'primitive'); famN[f]++; }
  Object.keys(C.semantic).forEach(function (k) { toFam(C.semantic[k].hex); });
  C.accents.forEach(function (t) { toFam(t.hex); });
  // 半透明色也进基础色（两层模型：半透明语义色再别名引用它）。归到 palette 段、命名带 -alpha，不污染背景色栏。
  function alphaFam(hex) { var c = hexToFigmaRgb(hex) || { r: 0, g: 0, b: 0 }; if (c.r > 0.92 && c.g > 0.92 && c.b > 0.92) return 'white'; if (c.r < 0.08 && c.g < 0.08 && c.b < 0.08) return 'black'; return rebuildHueFamily(rebuildHueDeg(hex)); }
  rebuildDedupeColors([].concat(ctx.bg || [], ctx.text || [], ctx.border || []), 1.0).forEach(function (m) {
    var op = rebuildOpacity(m.opacity); if (op >= 1) return;
    var nn = Math.round(op * 100), base = 'color.palette.' + alphaFam(m.hex) + '-alpha.' + nn, key = base, n = 2;
    while (colorTokens[key] && colorTokens[key].light !== m.hex) { key = base + '_' + n; n++; }
    addC(key, m.hex, 'primitive', '半透明 ' + nn + '%', op);
  });
  // 不透明「彩色」上下文色：保证每个都进基础色(palette)——否则被语义层 slice 切掉后会绑到最近的灰、明显错色(如酒红 #4C1A31→gray)。
  // 灰不处理(灰阶已全)；放 palette 段，语义层(bg/border)仍只取前 N，预览不被撑大。
  var primHexes = Object.keys(colorTokens).filter(function (k) { return k.indexOf('color.palette.') === 0; }).map(function (k) { return colorTokens[k].light; });
  rebuildDedupeColors([].concat(ctx.bg || [], ctx.text || [], ctx.border || []), 1.0).forEach(function (m) {
    if (rebuildOpacity(m.opacity) < 1 || auditIsNeutral(m.hex, 10)) return;
    if (primHexes.some(function (h) { return auditDeltaE(h, m.hex) < 1.5; })) return; // 已有近似基础色
    var f = rebuildHueFamily(rebuildHueDeg(m.hex)); famN[f] = famN[f] || 0;
    addC('color.palette.' + f + '.' + famN[f], m.hex, 'primitive'); famN[f]++; primHexes.push(m.hex);
  });

  // 语义色 semantic：角色名 + 真实颜色
  // 品牌色：每个主色阶都给一个语义角色，避免多余主色阶绑回基础色
  if (primSorted.length) {
    // ② 主色固定在「中心位」(primary≈500)：不论主色明度多少，比它浅的命名 50-400、比它深的命名 600-900。
    // 这样每个稿、每次换肤，primary 都出现在同一位置（设计系统惯例），跨稿不再漂档。
    var pr = primVivid.slice().sort(function (a, b) { return (b.count * auditChroma(b.hex)) - (a.count * auditChroma(a.hex)); })[0];
    var nP = primSorted.length, R = 0;
    for (var ri = 0; ri < nP; ri++) { if (primSorted[ri].hex === pr.hex) { R = ri; break; } }
    var LOWER = [50, 100, 200, 300, 400], UPPER = [600, 700, 800, 900], usedL = {}, usedU = {};
    function rbPickSlot(slots, ideal, used) {
      if (!used[slots[ideal]]) return slots[ideal];
      for (var off = 1; off < slots.length; off++) {
        if (ideal + off < slots.length && !used[slots[ideal + off]]) return slots[ideal + off];
        if (ideal - off >= 0 && !used[slots[ideal - off]]) return slots[ideal - off];
      }
      return null; // 档位用满：该色只留基础色、不给品牌语义（仍可被绑定命中）
    }
    primSorted.forEach(function (t, r) {
      if (r === R) { addC('color.brand.primary', t.hex, 'semantic', '主色 · 主操作'); return; }
      var name = null;
      if (r < R) { // 比主色浅 → 50-400（最浅=50、紧邻主色=400）
        var idealL = (R <= 1) ? (LOWER.length - 1) : Math.round(r * (LOWER.length - 1) / (R - 1));
        name = rbPickSlot(LOWER, idealL, usedL); if (name != null) usedL[name] = true;
      } else { // 比主色深 → 600-900（紧邻主色=600、最深=900）
        var d = r - R - 1, D = nP - R - 1;
        var idealU = (D <= 1) ? 0 : Math.round(d * (UPPER.length - 1) / (D - 1));
        name = rbPickSlot(UPPER, idealU, usedU); if (name != null) usedU[name] = true;
      }
      if (name != null) addC('color.brand.' + name, t.hex, 'semantic', '品牌色 · ' + name);
    });
  }
  var fname = { success: 'success', warning: 'warning', error: 'danger', info: 'info' };
  var fusage = { success: '成功', warning: '警告', error: '危险 / 错误', info: '信息' };
  Object.keys(C.semantic).forEach(function (k) { addC('color.function.' + (fname[k] || k), C.semantic[k].hex, 'semantic', fusage[k] || ''); });
  C.accents.forEach(function (t, i) { addC('color.auxiliary.' + (i + 1), t.hex, 'semantic', '辅助 / 强调'); });
  // 不透明色取前 N 个给语义角色名；半透明色「全部保留」——它们是设计里真实存在的独立色，
  // 绑定时必须有同 alpha 的变量可命中，被 slice 切掉就会让图层绑不上变量（只剩裸色值）。
  function ctxKept(list, n) {
    // 语义层(预览要干净)：只保留「不透明」的前 N 个拿角色名。
    // 半透明色 + 彩色都不进语义层——它们改为进「基础色(palette)」层（半透明=*-alpha，彩色=按色族）。
    // 否则成片的黑白蒙层(各种透明度)会把背景/边框栏撑爆、且看着像重复(#000000 不同透明度)；绑定靠基础色精确命中。
    return rebuildDedupeColors(list, 1.0).filter(function (m) { return rebuildOpacity(m.opacity) >= 1; }).slice(0, n);
  }
  var bgN = ['page', 'surface', 'elevated', 'overlay'];
  ctxKept(ctx.bg, 4).forEach(function (m, i) { addC('color.bg.' + (bgN[i] || ('s' + i)), m.hex, 'semantic', '背景 · 实际大面积填充', m.opacity); });
  var txN = ['primary', 'secondary', 'tertiary', 'disabled', 'placeholder'];
  ctxKept(ctx.text, 5).forEach(function (m, i) { addC('color.text.' + (txN[i] || ('t' + i)), m.hex, 'semantic', '文本 · 实际用在文字', m.opacity); });
  var bdN = ['default', 'subtle', 'strong'];
  ctxKept(ctx.border, 3).forEach(function (m, i) { addC('color.border.' + (bdN[i] || ('b' + i)), m.hex, 'semantic', '边框 · 实际用作描边', m.opacity); });

  // 彩色基础色补语义：每个「不透明 + 彩色(非中性)」的基础色，若没有任何语义色覆盖它(ΔE<1.5)，
  // 补一个 auxiliary 辅助色语义引用它——让图层引用语义色而非基础色(值不变、别名到精确基础色)。
  // 灰/中性不补(硬塞「辅助色」语义错)；半透明不补(已有 *-alpha 基础色)。彩色含渐变色标、强调横幅等。
  (function () {
    // 覆盖判定排除「功能色」：渐变绑定刻意避开 function(success/warning/danger/info)，
    // 若某彩色只与功能色相近，仍要补一个 auxiliary，否则渐变没有非功能语义可绑、只能落基础色。
    var semHexes = Object.keys(colorTokens).filter(function (k) { var t = colorTokens[k]; return t.tier === 'semantic' && k.indexOf('color.function.') !== 0 && !(t.alpha != null && t.alpha < 1); }).map(function (k) { return colorTokens[k].light; });
    var auxN = 0; Object.keys(colorTokens).forEach(function (k) { if (k.indexOf('color.auxiliary.') === 0) auxN++; });
    Object.keys(colorTokens).forEach(function (k) {
      if (k.indexOf('color.palette.') !== 0) return;
      var t = colorTokens[k];
      if (t.alpha != null && t.alpha < 1) return;
      if (auditIsNeutral(t.light)) return;
      if (semHexes.some(function (h) { return auditDeltaE(h, t.light) < 1.5; })) return;
      auxN++; addC('color.auxiliary.' + auxN, t.light, 'semantic', '辅助 / 强调');
      semHexes.push(t.light);
    });
  })();

  // 尺寸（plan 已规整为整数）
  plan.type.roles.forEach(function (r) { addD('font.size.' + r.role, r.size, { role: r.role.charAt(0).toUpperCase() + r.role.slice(1), weight: 400, lineHeight: Math.round(r.size * 1.5) }); });
  plan.radius.scale.forEach(function (s) { addD(s.name, s.value); });
  plan.spacing.scale.forEach(function (s) { addD(s.name, s.value); });

  var theme = plan.theme || 'light';
  return { name: '反推设计规范', version: 'reverse', platform: 'app-web', seed: { localFont: 'pingfang', defaultMode: theme }, defaultMode: theme, colorTokens: colorTokens, dimTokens: dimTokens };
}
// === REBUILD-CORE-END ===

// 采集（需 Figma API）：递归遍历选中节点，抽取硬编码样式 → plain data
function auditLineHeightPx(lh, size) {
  if (!lh || lh.unit === 'AUTO') return null;
  if (lh.unit === 'PIXELS') return Math.round(lh.value * 10) / 10;
  if (lh.unit === 'PERCENT') return Math.round(size * lh.value / 100 * 10) / 10;
  return null;
}
function harvestSelection(nodes, maxNodes) {
  maxNodes = maxNodes || 20000;
  var obs = { nodeCount: 0, truncated: false, fills: [], strokes: [], texts: [], radii: [], shadows: [], spacings: [] };
  function pushSolid(arr, paints, extra) {
    if (!Array.isArray(paints)) return;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (p && p.type === 'SOLID' && p.visible !== false) {
        var o = { hex: figmaRgbToHex(p.color), opacity: (p.opacity == null ? 1 : p.opacity) };
        if (extra) for (var k in extra) o[k] = extra[k];
        arr.push(o);
      }
    }
  }
  // 渐变：把每个色标的颜色也纳入采集（否则渐变里的色没有对应变量、色标只能保留裸色绑不上）。
  // 标记 fromGradient，后续保证它一定生成基础色变量（不被上下文 slice 切掉）。
  function pushGradient(arr, paints, extra) {
    if (!Array.isArray(paints)) return;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (!p || p.visible === false || typeof p.type !== 'string' || p.type.indexOf('GRADIENT_') !== 0 || !Array.isArray(p.gradientStops)) continue;
      var pop = (p.opacity == null ? 1 : p.opacity), n = p.gradientStops.length || 1;
      for (var s = 0; s < n; s++) {
        var st = p.gradientStops[s];
        if (!st || !st.color) continue;
        var o = { hex: figmaRgbToHex(st.color), opacity: ((st.color.a == null ? 1 : st.color.a) * pop), fromGradient: true };
        if (extra) for (var k in extra) o[k] = extra[k];
        if (typeof o.area === 'number') o.area = o.area / n; // 多色标分摊面积，避免重复计面积
        arr.push(o);
      }
    }
  }
  function visit(node) {
    if (obs.nodeCount >= maxNodes) { obs.truncated = true; return; }
    obs.nodeCount++;
    if ('fills' in node && node.fills !== figma.mixed) {
      var area = (typeof node.width === 'number' && typeof node.height === 'number') ? node.width * node.height : 0;
      pushSolid(obs.fills, node.fills, { nodeType: node.type, area: area });
      pushGradient(obs.fills, node.fills, { nodeType: node.type, area: area });
    }
    if ('strokes' in node) { pushSolid(obs.strokes, node.strokes, { weight: (typeof node.strokeWeight === 'number' ? node.strokeWeight : null) }); pushGradient(obs.strokes, node.strokes, { weight: (typeof node.strokeWeight === 'number' ? node.strokeWeight : null) }); }
    if (node.type === 'TEXT') {
      try {
        if (node.fontSize !== figma.mixed && node.fontName !== figma.mixed) {
          obs.texts.push({ size: node.fontSize, family: node.fontName.family, style: node.fontName.style, lineHeightPx: auditLineHeightPx(node.lineHeight, node.fontSize) });
        } else {
          var segs = node.getStyledTextSegments(['fontSize', 'fontName', 'lineHeight']);
          for (var s = 0; s < segs.length; s++) {
            obs.texts.push({ size: segs[s].fontSize, family: segs[s].fontName.family, style: segs[s].fontName.style, lineHeightPx: auditLineHeightPx(segs[s].lineHeight, segs[s].fontSize) });
          }
        }
      } catch (e) { /* 跳过无法读取的文本 */ }
      // 多色文本：fills 为 mixed 时按字符分段采集每段的文字颜色（否则会整段漏掉）
      if (node.fills === figma.mixed) {
        try {
          var tArea = (typeof node.width === 'number' && typeof node.height === 'number') ? node.width * node.height : 0;
          var tChars = (typeof node.characters === 'string') ? node.characters.length : 0;
          var fsegs = node.getStyledTextSegments(['fills']);
          for (var fsi = 0; fsi < fsegs.length; fsi++) {
            var segChars = fsegs[fsi].characters ? fsegs[fsi].characters.length : 0;
            pushSolid(obs.fills, fsegs[fsi].fills, { nodeType: 'TEXT', area: (tChars > 0 ? tArea * (segChars / tChars) : 0) });
          }
        } catch (e) { /* 跳过无法读取的分段填充 */ }
      }
    }
    if ('cornerRadius' in node) {
      if (node.cornerRadius !== figma.mixed) {
        if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) obs.radii.push(node.cornerRadius);
      } else {
        ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(function (k) {
          if (typeof node[k] === 'number' && node[k] > 0) obs.radii.push(node[k]);
        });
      }
    }
    if ('effects' in node && Array.isArray(node.effects)) {
      for (var e = 0; e < node.effects.length; e++) {
        var ef = node.effects[e];
        if ((ef.type === 'DROP_SHADOW' || ef.type === 'INNER_SHADOW') && ef.visible !== false) {
          obs.shadows.push({ type: ef.type, x: ef.offset.x, y: ef.offset.y, blur: ef.radius, spread: (ef.spread || 0), hex: figmaRgbToHex(ef.color), alpha: (ef.color.a == null ? 1 : Math.round(ef.color.a * 100) / 100) });
        }
      }
    }
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      if (typeof node.itemSpacing === 'number' && node.itemSpacing > 0) obs.spacings.push(node.itemSpacing);
      ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].forEach(function (k) {
        if (typeof node[k] === 'number' && node[k] > 0) obs.spacings.push(node[k]);
      });
    }
    if ('children' in node) {
      for (var c = 0; c < node.children.length; c++) {
        if (obs.nodeCount >= maxNodes) { obs.truncated = true; break; }
        visit(node.children[c]);
      }
    }
  }
  for (var i = 0; i < nodes.length; i++) visit(nodes[i]);
  return obs;
}

// 反推 · 阶段②衍生：缓存上次重建结果，供预览/变量库/绑定复用。
// 预览/变量库/绑定都走 rebuildToData(plan)（真实检测色 + 角色语义层），口径统一。
var lastRebuildPlan = null;
// 主题覆盖：UI 选「浅色/深色」时覆盖自动检测；选「自动」(或未传)时回到检测值（不残留上次覆盖）。
function applyReverseTheme(plan, t) { if (plan) plan.theme = (t === 'light' || t === 'dark') ? t : (plan.detectedTheme || plan.theme); return plan; }
// === 一键换主色：OKLCH 引擎（移植自 tokens.js，纯函数；可在 Node 单测） ===
function rcHexToRgb255(hex) { var c = hexToFigmaRgb(hex); return c ? { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) } : null; }
function rcClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rcSrgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function rcLinearToSrgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function rcRgbToOklch(rgb) {
  var lr = rcSrgbToLinear(rgb.r / 255), lg = rcSrgbToLinear(rgb.g / 255), lb = rcSrgbToLinear(rgb.b / 255);
  var l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  var m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  var s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  var l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  var L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  var a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  var bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  var H = Math.atan2(bb, a) * 180 / Math.PI; if (H < 0) H += 360;
  return { L: L, C: Math.sqrt(a * a + bb * bb), H: H };
}
function rcOklchToLinRgb(L, C, H) {
  var hr = H * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
  var l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return { r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s };
}
function rcOklchToRgb01(L, C, H) { // 返回 0-1 的 {r,g,b}，超 sRGB 色域时二分降 chroma 保 L+H
  function inGamut(v) { return v.r >= -1e-4 && v.r <= 1.0001 && v.g >= -1e-4 && v.g <= 1.0001 && v.b >= -1e-4 && v.b <= 1.0001; }
  var lin = rcOklchToLinRgb(L, C, H);
  if (!inGamut(lin)) { var lo = 0, hi = C; for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (inGamut(rcOklchToLinRgb(L, mid, H))) lo = mid; else hi = mid; } lin = rcOklchToLinRgb(L, lo, H); }
  return { r: rcClamp(rcLinearToSrgb(rcClamp(lin.r, 0, 1)), 0, 1), g: rcClamp(rcLinearToSrgb(rcClamp(lin.g, 0, 1)), 0, 1), b: rcClamp(rcLinearToSrgb(rcClamp(lin.b, 0, 1)), 0, 1) };
}
// 换主色色阶档位（移植自 tokens.js OKLCH 引擎）：第 5 档锚定输入色本身。
var RC_OKLCH_L = [0.971, 0.936, 0.882, 0.808, 0.730, 0.648, 0.567, 0.482, 0.397, 0.318];
var RC_OKLCH_C = [0.18, 0.34, 0.55, 0.75, 0.92, 1.00, 0.96, 0.86, 0.73, 0.60];
// 以 anchorHex 为锚生成 n 档 OKLCH 色阶（沿 10 档 profile 均匀取样），返回 [{L, rgb01}]（亮→暗）。
function rcInterp(arr, t) { var lo = Math.floor(t), hi = Math.min(arr.length - 1, lo + 1), f = t - lo; return arr[lo] + (arr[hi] - arr[lo]) * f; }
// 生成 n 档色阶。anchorRank 指定输入色落在第几档(0=最浅)：profile 锚到该档，让该档明度=输入色明度；
// 不传则锚在中段(原行为)。返回 [{L, rgb01}]，按明度浅→深。
function rcBuildScaleN(anchorHex, n, anchorRank) {
  var rgb = rcHexToRgb255(anchorHex); if (!rgb || n < 1) return null;
  var o = rcRgbToOklch(rgb);
  var aPos = (anchorRank == null || n <= 1) ? 5 : rcClamp(anchorRank * 9 / (n - 1), 0, 9); // 锚色在 0..9 profile 上的位置
  var Cbase = o.C / rcInterp(RC_OKLCH_C, aPos), Loff = o.L - rcInterp(RC_OKLCH_L, aPos), out = [];
  for (var k = 0; k < n; k++) {
    var t = (n === 1) ? aPos : (k * 9 / (n - 1)); // 0..9 上均匀取样
    var L0 = rcInterp(RC_OKLCH_L, t), C0 = rcInterp(RC_OKLCH_C, t);
    var blend = Math.max(0, 1 - Math.abs(t - aPos) * 0.16);
    var L = rcClamp(L0 + Loff * blend, 0.05, 0.99);
    out.push({ L: L, rgb01: rcOklchToRgb01(L, Cbase * C0, o.H) });
  }
  return out;
}
// 换主色：生成同档数的均匀色阶（含输入色本身），按「现有档位的明度排名」对齐——亮档拿亮、暗档拿暗，
// 不重复、不乱序。anchorRank 指定输入主色固定落在第几档(与原稿主色档位对齐)；不传则取明度最接近的档。
// 返回 0-1 的 {r,g,b} 数组（与 shadeHexes 同序）。
function reverseRecolorRamp(shadeHexes, newHex, anchorRank) {
  var n = shadeHexes.length; var ramp = rcBuildScaleN(newHex, n, anchorRank); if (!ramp) return null;
  // 把锚档替换成输入色本身，保证主色一定原样出现：指定 anchorRank 时锚在该档，否则取明度最接近的档
  var bi;
  if (anchorRank != null && anchorRank >= 0 && anchorRank < n) { bi = anchorRank; }
  else { var ninO = rcRgbToOklch(rcHexToRgb255(newHex)); bi = 0; var bd = Infinity; for (var i = 0; i < ramp.length; i++) { var d = Math.abs(ramp[i].L - ninO.L); if (d < bd) { bd = d; bi = i; } } }
  var ic = hexToFigmaRgb(newHex); if (ic) ramp[bi].rgb01 = { r: ic.r, g: ic.g, b: ic.b };
  // 现有档位按明度从亮到暗排名，第 r 名拿 ramp[r]（ramp 已亮→暗）——保证结果始终明度单调、自动纠正轻微乱序
  var ranked = shadeHexes.map(function (h, idx) { var r = rcHexToRgb255(h); return { idx: idx, L: r ? rcRgbToOklch(r).L : 0 }; })
    .sort(function (a, b) { return b.L - a.L; });
  var result = new Array(n);
  for (var k = 0; k < ranked.length; k++) result[ranked[k].idx] = ramp[k].rgb01;
  return result;
}
// 反推专用：把 Primitives 集合收成单模式（基础色是固定值、不该有明暗两栏）。仅在反推流程「最后一步」调用——
// syncVariables 每次会补回 Dark 模式，所以这里在 sync 之后移除。删 Dark 不丢信息（基础色 Light=Dark）。语义色(Tokens)保持双模式。
function collapsePrimitivesMode(cols) {
  try {
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].name !== 'Primitives' || cols[i].modes.length <= 1) continue;
      var dark = cols[i].modes.find(function (m) { return m.name === 'Dark'; });
      var light = cols[i].modes.find(function (m) { return m.name === 'Light'; });
      if (dark && light && dark.modeId !== light.modeId) cols[i].removeMode(dark.modeId);
      return;
    }
  } catch (e) {}
}

// 让语义色变量「别名引用」最接近的基础色变量（两层联动）。在 syncVariables 之后调用。
async function aliasReverseSemantics(data) {
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  var byName = {}, modesByCol = {};
  for (var ci = 0; ci < cols.length; ci++) {
    var col = cols[ci];
    var lm = col.modes.find(function (m) { return m.name === 'Light'; });
    var dm = col.modes.find(function (m) { return m.name === 'Dark'; });
    modesByCol[col.id] = { light: lm ? lm.modeId : col.modes[0].modeId, dark: dm ? dm.modeId : (col.modes[1] ? col.modes[1].modeId : col.modes[0].modeId) };
    for (var vi = 0; vi < col.variableIds.length; vi++) { var v = await figma.variables.getVariableByIdAsync(col.variableIds[vi]); if (v) byName[v.name] = v; }
  }
  function fn(k) { return k.replace(/\./g, '/'); }
  var prims = [];
  Object.keys(data.colorTokens).forEach(function (k) { if (k.indexOf('color.palette.') !== 0) return; var v = byName[fn(k)]; if (v) prims.push({ hex: data.colorTokens[k].light, v: v, alpha: (data.colorTokens[k].alpha == null ? 1 : data.colorTokens[k].alpha) }); });
  if (!prims.length) return 0;
  // 半透明基础色：syncVariables 建的初值是不透明的，这里写入带 alpha 的 RGBA 真值
  Object.keys(data.colorTokens).forEach(function (k) {
    if (k.indexOf('color.palette.') !== 0) return;
    var tp = data.colorTokens[k]; if (tp.alpha == null || tp.alpha >= 1) return;
    var pv = byName[fn(k)]; if (!pv) return;
    try { var mdp = modesByCol[pv.variableCollectionId];
      var lp = hexToFigmaRgb(tp.light) || { r: 0, g: 0, b: 0 }; lp.a = tp.alpha;
      var dp = hexToFigmaRgb(tp.dark) || { r: 0, g: 0, b: 0 }; dp.a = tp.alpha;
      pv.setValueForMode(mdp.light, lp); pv.setValueForMode(mdp.dark, dp);
    } catch (e) {}
  });
  var aliased = 0;
  Object.keys(data.colorTokens).forEach(function (k) {
    var t = data.colorTokens[k];
    if (t.tier !== 'semantic') return;
    var sv = byName[t.figmaName]; if (!sv) return;
    var mdA = modesByCol[sv.variableCollectionId];
    // 半透明语义色：别名到「同色同透明度」的半透明基础色（两层联动）；找不到才直接写 RGBA 兜底
    if (t.alpha != null && t.alpha < 1) {
      var bestT = null, bdT = Infinity;
      for (var j = 0; j < prims.length; j++) { if (Math.abs(prims[j].alpha - t.alpha) > 0.02) continue; var dj = auditDeltaE(t.light, prims[j].hex); if (dj < bdT) { bdT = dj; bestT = prims[j]; } }
      try {
        if (bestT && bdT < 1.5 && bestT.v.id !== sv.id) { var al = figma.variables.createVariableAlias(bestT.v); sv.setValueForMode(mdA.light, al); sv.setValueForMode(mdA.dark, al); aliased++; }
        else { var lr = hexToFigmaRgb(t.light) || { r: 0, g: 0, b: 0 }; lr.a = t.alpha; var dr = hexToFigmaRgb(t.dark) || { r: 0, g: 0, b: 0 }; dr.a = t.alpha; sv.setValueForMode(mdA.light, lr); sv.setValueForMode(mdA.dark, dr); }
      } catch (e) {}
      return;
    }
    // 不透明语义色：检测到的那一模式别名到「真实同色」基础色；对侧模式——中性角色镜像明度、品牌/状态色保持相同。
    var best = null, bd = Infinity;
    for (var i = 0; i < prims.length; i++) { if (prims[i].alpha < 1) continue; var d = auditDeltaE(t.light, prims[i].hex); if (d < bd) { bd = d; best = prims[i]; } }
    if (!(best && bd < 1.5 && best.v.id !== sv.id)) return;
    try {
      var detMode = (data.defaultMode === 'dark') ? mdA.dark : mdA.light;
      var oppMode = (data.defaultMode === 'dark') ? mdA.light : mdA.dark;
      sv.setValueForMode(detMode, figma.variables.createVariableAlias(best.v));
      // 中性角色(bg/text/border 且近中性)：对侧模式指向「明度相反」的灰阶基础色（亮↔暗翻转）；其余两模式相同。
      var isNeutralRole = (k.indexOf('color.bg.') === 0 || k.indexOf('color.text.') === 0 || k.indexOf('color.border.') === 0);
      var oppBase = best;
      if (isNeutralRole && auditIsNeutral(t.light)) {
        var targetL = 100 - auditHexToLab(t.light).L, gp = null, gd = Infinity;
        for (var gi = 0; gi < prims.length; gi++) { if (prims[gi].alpha < 1 || !auditIsNeutral(prims[gi].hex)) continue; var dl = Math.abs(auditHexToLab(prims[gi].hex).L - targetL); if (dl < gd) { gd = dl; gp = prims[gi]; } }
        if (gp) oppBase = gp;
      }
      sv.setValueForMode(oppMode, figma.variables.createVariableAlias(oppBase.v));
      aliased++;
    } catch (e) {}
  });
  return aliased;
}

// 阶段③后半：把选中图层「复制到新页面」后按「角色」绑定到语义色变量（原设计零风险）。
// 描边→border、文字→text、背景→bg、品牌/状态→brand/function；说不清的兜底基础色。
async function bindReverseVariables(plan) {
  var sel = figma.currentPage.selection;
  var data = rebuildToData(plan);                   // 真实检测色 + 角色语义层（与预览/变量库同一套）
  await syncVariables(data);                        // 创建变量
  await aliasReverseSemantics(data);                // 语义色别名引用基础色（两层联动）
  var cols = await figma.variables.getLocalVariableCollectionsAsync();
  var byName = {};
  for (var ci = 0; ci < cols.length; ci++) {
    for (var vi = 0; vi < cols[ci].variableIds.length; vi++) {
      var v = await figma.variables.getVariableByIdAsync(cols[ci].variableIds[vi]);
      if (v) {
        byName[v.name] = v;
        // 放开颜色变量作用域，确保在所有选择器（含渐变色标）里都能挑到——否则 ALL_FILLS 在渐变色标处被过滤掉、只显示当前一个
        if (v.name.indexOf('color/') === 0) { try { v.scopes = ['ALL_SCOPES']; } catch (e) {} }
      }
    }
  }
  var theme = plan.theme || 'light';
  // 按角色分组变量：图层据此绑到语义色（border/text/bg/brand），基础色(palette)兜底。
  var borderVars = [], textVars = [], bgVars = [], brandVars = [], primVars = [], radiusVars = [], spaceVars = [], fontVars = [];
  Object.keys(data.colorTokens).forEach(function (k) {
    var t = data.colorTokens[k], vr = byName[t.figmaName];
    if (!vr) return;
    var e = { hex: (theme === 'dark' ? t.dark : t.light), v: vr, a: (t.alpha == null ? 1 : t.alpha) };
    if (k.indexOf('color.palette.') === 0) primVars.push(e);
    else if (k.indexOf('color.border.') === 0) borderVars.push(e);
    else if (k.indexOf('color.text.') === 0) textVars.push(e);
    else if (k.indexOf('color.bg.') === 0) bgVars.push(e);
    else { e.isFunction = (k.indexOf('color.function.') === 0); brandVars.push(e); } // brand / function / auxiliary
  });
  Object.keys(data.dimTokens).forEach(function (k) {
    var t = data.dimTokens[k], vr = byName[t.figmaName];
    if (!vr || typeof t.value !== 'number') return;
    if (k.indexOf('radius.') === 0) radiusVars.push({ val: t.value, v: vr, isFull: (k === 'radius.full') });
    else if (k.indexOf('space.') === 0) spaceVars.push({ val: t.value, v: vr });
    else if (k.indexOf('font.size.') === 0) fontVars.push({ val: t.value, v: vr });
  });
  // 颜色匹配同时看色相(ΔE)与不透明度：不透明度差 >0.04 视为不同色（白@5% 不会命中不透明白）
  function nearestIn(list, hex, alpha, maxD) { var best = null, bd = Infinity; for (var i = 0; i < list.length; i++) { if (Math.abs((list[i].a == null ? 1 : list[i].a) - alpha) > 0.04) continue; var d = auditDeltaE(hex, list[i].hex); if (d < bd) { bd = d; best = list[i].v; } } return (best && bd <= maxD) ? best : null; }
  // 角色优先绑语义色，基础色兜底（语义色就是真实检测色，命中 ΔE≈0）
  function resolveColor(role, hex, alpha, strict, forGradient) {
    if (alpha == null) alpha = 1;
    // 语义色匹配收紧到 ΔE<2（只有(近)同色才归到该角色），否则兜底到「精确同值」的基础色——避免大面积色被吸到别的色。
    // strict（渐变用）：所有阈值都收到 strict，且基础色不再无脑兜底——色标没有近似同色变量就保留原色，绝不绑到「最近但不同」的色。
    var sd = (strict != null) ? strict : 2;
    var pd = (strict != null) ? strict : Infinity;
    // 渐变色标避开功能色：渐变几乎不是「警告/成功渐变」，优先绑品牌/主色，避免品牌橙渐变被绑到同色相的 function/warning。
    var bv = forGradient ? brandVars.filter(function (e) { return !e.isFunction; }) : brandVars;
    if (role === 'border') return nearestIn(borderVars, hex, alpha, sd) || nearestIn(primVars, hex, alpha, pd);
    if (role === 'text') return nearestIn(textVars, hex, alpha, sd) || nearestIn(bv, hex, alpha, sd) || nearestIn(primVars, hex, alpha, pd);
    // fill（含图标/形状）：品牌/状态色 → 背景 → 文本(图标常复用文本灰) → 兜底基础色
    return nearestIn(bv, hex, alpha, sd) || nearestIn(bgVars, hex, alpha, sd) || nearestIn(textVars, hex, alpha, sd) || nearestIn(primVars, hex, alpha, pd);
  }
  function nearestNum(arr, val) { var best = null, bd = Infinity; for (var i = 0; i < arr.length; i++) { var d = Math.abs(arr[i].val - val); if (d < bd) { bd = d; best = arr[i].v; } } return best; }

  // 防堆积：先删掉上一次自动生成的「绑定副本」页（同名才删；用户重命名保留的不动）
  try {
    (figma.root.children || []).filter(function (p) { return p.type === 'PAGE' && p.name === '反推规范 · 绑定副本'; }).forEach(function (p) { try { p.remove(); } catch (e) {} });
  } catch (e) {}
  // 复制选中画板到新页面，只在副本上绑定（sel 已在顶部取得）
  var page = figma.createPage();
  page.name = '反推规范 · 绑定副本';
  var clones = [];
  for (var s = 0; s < sel.length; s++) { try { var cl = sel[s].clone(); page.appendChild(cl); clones.push(cl); } catch (e) {} }

  var bound = { fills: 0, strokes: 0, radius: 0, spacing: 0, font: 0, styles: 0 };
  // 没绑上 / 没处理的，做个小结回报，让「保真范围」透明：
  // image=图片/视频填充、unmatched=找不到同色变量的纯色、effect=带特效的节点(已原样保留，未建样式)
  var skipped = { image: 0, unmatched: 0, effect: 0 };
  var textNodes = [];
  // 绑定一个纯色 paint 到对应角色变量，并「保留原本的不透明度」（如 20% 白描边不会变实白）
  function bindSolid(p, role) {
    if (!p || p.type !== 'SOLID' || p.visible === false) return p;
    // 按「色相 + 不透明度」找变量：半透明色只命中带相同 alpha 的语义变量（绑定后透明度由变量自带）
    var vr = resolveColor(role, figmaRgbToHex(p.color), (typeof p.opacity === 'number' ? p.opacity : 1));
    if (!vr) { skipped.unmatched++; return p; } // 没有同色同透明度的变量就不绑，保留原 paint（含原本的透明度）——保真优先
    try {
      // 造一个干净的 opacity=1 源 paint 交给 Figma 绑定，直接返回它「亲建」的绑定 paint：
      // 这样变量引用一定生效（不再手搓对象导致绑定丢失）；透明度由变量 RGBA 的 alpha 提供，
      // opacity=1 不会二次变暗。
      var src = { type: 'SOLID', color: { r: p.color.r, g: p.color.g, b: p.color.b }, opacity: 1, visible: true };
      if (p.blendMode) src.blendMode = p.blendMode;
      return figma.variables.setBoundVariableForPaint(src, 'color', vr);
    } catch (e) { return p; }
  }
  // 把一组 paint 绑到变量，返回 {next, changed}（图层填充/描边、paint 样式共用）
  function mapPaints(paints, role) {
    if (!Array.isArray(paints) || !paints.length) return { next: paints, changed: false };
    var changed = false;
    var next = paints.map(function (p) {
      if (!p || p.visible === false) return p;
      if (p.type === 'SOLID') {
        var np = bindSolid(p, role);
        if (np !== p) { changed = true; return np; }
      } else if (typeof p.type === 'string' && p.type.indexOf('GRADIENT_') === 0 && Array.isArray(p.gradientStops)) {
        // 渐变：色标只绑「近乎同色」的变量（strict 1.5）、且避开功能色（forGradient）。没有近似同色就保留原色。
        var anyStop = false;
        var stops = p.gradientStops.map(function (st) {
          var v2 = resolveColor(role, figmaRgbToHex(st.color), (st.color && typeof st.color.a === 'number' ? st.color.a : 1), 1.5, true);
          if (v2) { try { anyStop = true; return { position: st.position, color: st.color, boundVariables: { color: figma.variables.createVariableAlias(v2) } }; } catch (e) {} }
          return { position: st.position, color: st.color };
        });
        if (anyStop) { var ng = Object.assign({}, p); ng.gradientStops = stops; changed = true; return ng; }
      } else if (p.type === 'IMAGE' || p.type === 'VIDEO') {
        skipped.image++; // 图片/视频填充不绑色变量，原样保留
      }
      return p;
    });
    return { next: next, changed: changed };
  }
  // 用了「本地」paint 样式的图层不在此绑（留给样式统一绑）。注意只认本地样式——
  // 指向悬空/外部样式(库里没有，如 HTML→Figma 转换残留)的图层照旧剥离 + 本地绑/提升，避免副本留下指向不存在样式的引用。
  var localStyleIds = {};
  function usesStyle(node, prop) { var sid = node[prop === 'strokes' ? 'strokeStyleId' : 'fillStyleId']; return typeof sid === 'string' && sid.length > 0 && !!localStyleIds[sid]; }
  function bindPaints(node, prop, counter, role) {
    if (usesStyle(node, prop)) return;
    var r = mapPaints(node[prop], role);
    if (r.changed) { try { node[prop] = r.next; bound[counter]++; } catch (e) {} }
  }
  // 绑定本文件的 paint 样式（solid + 渐变）：样式色标绑到变量 → 所有用该样式的图层（含副本）跟随换主色。
  async function bindPaintStyles() {
    try {
      var styles = await figma.getLocalPaintStylesAsync();
      for (var si = 0; si < styles.length; si++) {
        var st = styles[si];
        var r = mapPaints(st.paints, 'fill');
        if (r.changed) { try { st.paints = r.next; bound.styles = (bound.styles || 0) + 1; } catch (e) {} }
      }
    } catch (e) {}
  }
  // 本地渐变 → 提升成共享样式：相同渐变的图层共用一个样式、样式色标绑变量、图层应用样式。
  // 这样「改一处样式（或换主色）全局生效」，不必逐个图层改绑定。
  var gradGroups = {};
  function isGradientPaint(p) { return p && p.visible !== false && typeof p.type === 'string' && p.type.indexOf('GRADIENT_') === 0 && Array.isArray(p.gradientStops); }
  function gradSig(p) {
    try {
      var stops = p.gradientStops.map(function (s) { return Math.round((s.position || 0) * 1000) + ':' + figmaRgbToHex(s.color) + '@' + Math.round((s.color && s.color.a != null ? s.color.a : 1) * 100); }).join(',');
      return p.type + '|' + stops + '|' + JSON.stringify(p.gradientTransform || []);
    } catch (e) { return null; }
  }
  // 整个填充栈的签名（含渐变的多填充也能分组）：渐变用 gradSig、纯色用色值+不透明度、其它用类型。
  function paintSig(p) { return isGradientPaint(p) ? ('G|' + gradSig(p)) : (p && p.type === 'SOLID' ? ('S:' + figmaRgbToHex(p.color) + '@' + Math.round((p.opacity == null ? 1 : p.opacity) * 100)) : (p ? (p.type || 'X') : 'X')); }
  function fillsSig(fills) { try { return fills.map(paintSig).join('||'); } catch (e) { return null; } }
  // 收集「含渐变的填充层」：按整组填充签名分组、存整组 paints（多填充一起打包进同一个样式）。
  function collectGradient(node) { var sig = fillsSig(node.fills); if (!sig) { bindPaints(node, 'fills', 'fills', 'fill'); return; } (gradGroups[sig] = gradGroups[sig] || { paints: node.fills, nodes: [] }).nodes.push(node); }
  async function promoteGradientsToStyles() {
    var keys = Object.keys(gradGroups);
    for (var i = 0; i < keys.length; i++) {
      var g = gradGroups[keys[i]], r = mapPaints(g.paints, 'fill'), style;
      try { style = figma.createPaintStyle(); style.name = '反推渐变/' + (i + 1); style.paints = r.next; } catch (e) { continue; }
      for (var n = 0; n < g.nodes.length; n++) {
        var nd = g.nodes[n];
        try { if (typeof nd.setFillStyleIdAsync === 'function') await nd.setFillStyleIdAsync(style.id); else nd.fillStyleId = style.id; } catch (e) {}
      }
      bound.styles = (bound.styles || 0) + 1;
    }
  }
  function bindNum(node, field, vr) { if (!vr) return; try { node.setBoundVariable(field, vr); return true; } catch (e) { return false; } }
  function visit(node) {
    if (Array.isArray(node.effects) && node.effects.some(function (e) { return e && e.visible !== false; })) skipped.effect++; // 阴影/模糊：原样保留，不建效果样式
    // 文本填充统一留到后面「先加载字体再绑」，否则 Figma 不刷新渲染（点了才出现）
    if (node.type !== 'TEXT' && 'fills' in node && node.fills !== figma.mixed) {
      // 单一渐变填充 → 收集后提升成共享样式（改一处全局生效）；其余（纯色/多 paint）照常本地绑。
      if (!usesStyle(node, 'fills') && Array.isArray(node.fills) && node.fills.length && node.fills.some(isGradientPaint)) collectGradient(node);
      else bindPaints(node, 'fills', 'fills', 'fill');
    }
    if ('strokes' in node) bindPaints(node, 'strokes', 'strokes', 'border');
    if (radiusVars.length && 'cornerRadius' in node && node.cornerRadius !== figma.mixed && typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
      // 大圆角(≥100)统一绑 radius.full（rebuildRadius 把 ≥100 收成一个 full、值取最大），
      // 否则按数值最近——避免 150 这种「胶囊」被吸到数值更近的小圆角刻度。
      var rv;
      if (node.cornerRadius >= 100) { var fv = null; for (var ri = 0; ri < radiusVars.length; ri++) if (radiusVars[ri].isFull) fv = radiusVars[ri].v; rv = fv || nearestNum(radiusVars, node.cornerRadius); }
      else rv = nearestNum(radiusVars.filter(function (e) { return !e.isFull; }), node.cornerRadius) || nearestNum(radiusVars, node.cornerRadius);
      var ok = false;
      ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(function (f) { if (bindNum(node, f, rv)) ok = true; });
      if (ok) bound.radius++;
    }
    if (node.layoutMode && node.layoutMode !== 'NONE' && spaceVars.length) {
      ['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].forEach(function (f) {
        if (typeof node[f] === 'number' && node[f] > 0 && bindNum(node, f, nearestNum(spaceVars, node[f]))) bound.spacing++;
      });
    }
    if (node.type === 'TEXT' && fontVars.length && node.fontSize !== figma.mixed && typeof node.fontSize === 'number') {
      if (bindNum(node, 'fontSize', nearestNum(fontVars, node.fontSize))) bound.font++;
    }
    if (node.type === 'TEXT') textNodes.push(node); // 文本：留到后面（加载字体后）绑定填充
    if ('children' in node) { for (var i = 0; i < node.children.length; i++) visit(node.children[i]); }
  }
  try { (await figma.getLocalPaintStylesAsync()).forEach(function (s) { localStyleIds[s.id] = true; }); } catch (e) {} // 本地样式 id 集合，供 usesStyle 判定（悬空/外部样式不算）
  for (var c2 = 0; c2 < clones.length; c2++) visit(clones[c2]);
  // 文本填充：先加载字体再绑（否则不刷新渲染）；多色文本按字符分段绑。颜色绑 text 角色、保留不透明度。
  for (var mt = 0; mt < textNodes.length; mt++) {
    var tn = textNodes[mt];
    try {
      var fontSegs = tn.getStyledTextSegments(['fontName']);
      for (var fi2 = 0; fi2 < fontSegs.length; fi2++) { try { await figma.loadFontAsync(fontSegs[fi2].fontName); } catch (e) {} }
      if (tn.fills === figma.mixed) {
        var fillSegs = tn.getStyledTextSegments(['fills']);
        for (var si = 0; si < fillSegs.length; si++) {
          var seg = fillSegs[si];
          var nfSeg = (seg.fills || []).map(function (p) { return bindSolid(p, 'text'); });
          try { tn.setRangeFills(seg.start, seg.end, nfSeg); bound.fills++; } catch (e) {}
        }
      } else if (Array.isArray(tn.fills) && tn.fills.length) {
        var changedT = false;
        var nfAll = tn.fills.map(function (p) { var np = bindSolid(p, 'text'); if (np !== p) changedT = true; return np; });
        if (changedT) { try { tn.fills = nfAll; bound.fills++; } catch (e) {} }
      }
    } catch (e) { /* 跳过无法绑定的文本 */ }
  }
  await bindPaintStyles(); // 绑定文件已有的 paint 样式（渐变/纯色样式 → 变量，全局生效、可跟随换主色）
  await promoteGradientsToStyles(); // 本地渐变提升成共享样式（图层应用样式 → 改一处全局生效）
  collapsePrimitivesMode(cols); // 基础色收成单值（在显式模式之前，这样 Primitives 已无 Dark、下面会自动跳过它）
  // 把副本锁定到「检测到的主题」那一模式渲染——这样即使集合默认模式不是它，副本仍显示原始主题（保真）。
  try {
    var wantMode = (theme === 'dark') ? 'Dark' : 'Light';
    for (var ci3 = 0; ci3 < cols.length; ci3++) {
      var dm3 = cols[ci3].modes.find(function (m) { return m.name === wantMode; });
      if (!dm3) continue;
      for (var cl3 = 0; cl3 < clones.length; cl3++) { try { clones[cl3].setExplicitVariableModeForCollection(cols[ci3], dm3.modeId); } catch (e) {} }
    }
  } catch (e) {}
  figma.currentPage = page;
  try { figma.currentPage.selection = clones; figma.viewport.scrollAndZoomIntoView(clones); } catch (e) {}
  bound.skipped = skipped;
  return bound;
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'sync') {
      // Diagnostic: check what data we received
      var colorCount = Object.keys(msg.data.colorTokens || {}).length;
      var dimCount = Object.keys(msg.data.dimTokens || {}).length;
      if (colorCount === 0 && dimCount === 0) {
        figma.ui.postMessage({ type: 'error', message: '数据为空：colorTokens=' + colorCount + ' dimTokens=' + dimCount });
        return;
      }
      // Sample first color token to check format
      var firstColor = Object.entries(msg.data.colorTokens || {})[0];
      if (firstColor) {
        var sample = firstColor[1];
        var sampleLight = sample.light || 'undefined';
        var sampleFigma = sample.figmaName || 'undefined';
        // Check if values are resolved hex or aliases
        if (sampleLight.indexOf('{') >= 0) {
          figma.ui.postMessage({ type: 'error', message: '颜色值未解析，仍是别名引用: ' + sampleLight + '。请使用 Web 端的 JSON 导出。' });
          return;
        }
      }

      figma.ui.postMessage({ type: 'progress', message: '开始同步 ' + colorCount + ' 颜色 + ' + dimCount + ' 尺寸...' });
      var result = await syncVariables(msg.data);
      figma.ui.postMessage({ type: 'progress', message: '变量已同步，正在同步样式...' });
      var textResult = await syncTextStyles(msg.data);
      var effectResult = await syncEffectStyles(msg.data);
      figma.ui.postMessage({
        type: 'result',
        message: '同步完成！变量: 新建 ' + result.created + ' · 更新 ' + result.updated + ' · 跳过 ' + result.skipped
          + (result.renamed ? ' · 改名 ' + result.renamed : '')
          + ((result.cleaned + result.orphaned) ? ' · 清理 ' + (result.cleaned + result.orphaned) : '')
          + ' | 文字样式: ' + textResult.created + ' 新建 · ' + textResult.updated + ' 更新'
          + ' | 效果样式: ' + effectResult.created + ' 新建 · ' + effectResult.updated + ' 更新',
      });
    }
    else if (msg.type === 'generate') {
      var colorCount2 = Object.keys(msg.data.colorTokens || {}).length;
      var dimCount2 = Object.keys(msg.data.dimTokens || {}).length;
      figma.ui.postMessage({ type: 'progress', message: '同步 ' + colorCount2 + ' 颜色 + ' + dimCount2 + ' 尺寸...' });
      var syncResult = await syncVariables(msg.data);
      figma.ui.postMessage({ type: 'progress', message: '变量已同步，正在同步样式...' });
      var textResult2 = await syncTextStyles(msg.data);
      var effectResult2 = await syncEffectStyles(msg.data);
      figma.ui.postMessage({ type: 'progress', message: '样式已同步 (文字 ' + (textResult2.created + textResult2.updated) + ' · 效果 ' + (effectResult2.created + effectResult2.updated) + ')，正在生成预览页...' });
      var frameId = await generatePreview(msg.data);
      figma.ui.postMessage({
        type: 'result',
        message: '预览页已生成！变量: 新建 ' + syncResult.created + ' · 更新 ' + syncResult.updated
          + (syncResult.renamed ? ' · 改名 ' + syncResult.renamed : '')
          + ((syncResult.cleaned + syncResult.orphaned) ? ' · 清理 ' + (syncResult.cleaned + syncResult.orphaned) : '')
          + ' | 文字样式 ' + (textResult2.created + textResult2.updated)
          + ' · 效果样式 ' + (effectResult2.created + effectResult2.updated),
      });
    }
    else if (msg.type === 'audit') {
      // 2.0 反推 · 阶段①：扫描选中画板，生成审计报告（只读，不改文件）
      var sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) {
        figma.ui.postMessage({ type: 'error', message: '请先在画布上选中至少一个画板或图层' });
        return;
      }
      figma.ui.postMessage({ type: 'progress', message: '正在扫描选中内容...' });
      figma.ui.resize(360, 640);
      var auditObs = harvestSelection(sel, 20000);
      var auditReport = buildAuditReport(auditObs, { colorDelta: (msg.colorDelta || 2.5) });
      figma.ui.postMessage({ type: 'audit-result', report: auditReport });
    }
    else if (msg.type === 'rebuild') {
      // 2.0 反推 · 阶段②：聚类重建干净 token（草案，只读，不改文件）
      var rbSel = figma.currentPage.selection;
      if (!rbSel || rbSel.length === 0) {
        figma.ui.postMessage({ type: 'error', message: '请先在画布上选中至少一个画板或图层' });
        return;
      }
      figma.ui.postMessage({ type: 'progress', message: '正在聚类并重建干净 token...' });
      figma.ui.resize(360, 720);
      var rbObs = harvestSelection(rbSel, 20000);
      var rbPlan = buildRebuildPlan(rbObs);
      applyReverseTheme(rbPlan, msg.theme);
      lastRebuildPlan = rbPlan;
      figma.ui.postMessage({ type: 'rebuild-result', plan: rbPlan, json: rebuildToJson(rbPlan) });
    }
    else if (msg.type === 'reverse-preview') {
      // 用上一次重建的干净集生成规范预览页（新建框架，不改原设计）
      var rpPlan = lastRebuildPlan;
      if (!rpPlan) {
        var rpSel = figma.currentPage.selection;
        if (!rpSel || rpSel.length === 0) {
          figma.ui.postMessage({ type: 'error', message: '请先选中画板并「重建为干净 token」，再生成预览页' });
          return;
        }
        rpPlan = buildRebuildPlan(harvestSelection(rpSel, 20000));
      }
      applyReverseTheme(rpPlan, msg.theme);
      figma.ui.postMessage({ type: 'progress', message: '正在生成规范预览页...' });
      // 翻译成正向数据 → 复用现有 generatePreview（不改动 web 端 JSON 的生成路径）
      var rpData = rebuildToData(rpPlan);
      // 防堆积：删掉上一次自动生成的反推预览框架（同名才删；不碰 web 的预览、也不碰用户重命名保留的）
      try {
        var rpFrameName = 'Token Preview / ' + rpData.name + ' / v' + rpData.version;
        (figma.currentPage.children || []).filter(function (n) { return n.type === 'FRAME' && n.name === rpFrameName; }).forEach(function (n) { try { n.remove(); } catch (e) {} });
      } catch (e) {}
      await generatePreview(rpData);
      figma.ui.postMessage({ type: 'result', message: '规范预览页已生成（与网页端同款，未改动原设计）' });
    }
    else if (msg.type === 'reverse-bind') {
      // 2.0 反推 · 阶段③：先创建两层变量库（bindReverseVariables 内部 syncVariables+别名+收单值），再复制副本绑定（原设计零风险）
      var rbgSel = figma.currentPage.selection;
      if (!rbgSel || rbgSel.length === 0) {
        figma.ui.postMessage({ type: 'error', message: '请先选中要绑定的画板/图层' });
        return;
      }
      var rbgPlan = lastRebuildPlan || buildRebuildPlan(harvestSelection(rbgSel, 20000));
      applyReverseTheme(rbgPlan, msg.theme);
      figma.ui.postMessage({ type: 'progress', message: '正在复制副本并绑定变量...' });
      var b = await bindReverseVariables(rbgPlan);
      var sk = b.skipped || { image: 0, unmatched: 0, effect: 0 };
      var skParts = [];
      if (sk.unmatched) skParts.push('无同色变量 ' + sk.unmatched);
      if (sk.image) skParts.push('图片/视频填充 ' + sk.image);
      if (sk.effect) skParts.push('特效节点 ' + sk.effect + '(已保留)');
      var skMsg = skParts.length ? '；跳过：' + skParts.join(' · ') : '';
      figma.ui.postMessage({
        type: 'result',
        message: '两层变量库已建 + 新页面「反推规范 · 绑定副本」完成绑定：填充 ' + b.fills + ' · 描边 ' + b.strokes + ' · 圆角 ' + b.radius + ' · 间距 ' + b.spacing + ' · 字号 ' + b.font + (b.styles ? ' · 样式 ' + b.styles : '') + skMsg + '（原设计未改动）',
      });
    }
    else if (msg.type === 'reverse-recolor') {
      // 一键换主色：① 主色阶用新主色重算 ② 散落到其它色族的「同色相品牌色」也旋到新主色，③ 功能色(success/warning/danger/info)保护不变。
      var newColor = msg.color;
      if (!hexToFigmaRgb(newColor)) { figma.ui.postMessage({ type: 'error', message: '请输入有效的颜色，如 #3B82F6' }); return; }
      var rcCols = await figma.variables.getLocalVariableCollectionsAsync();
      var rcColById = {}, allVars = [];
      for (var rci = 0; rci < rcCols.length; rci++) {
        rcColById[rcCols[rci].id] = rcCols[rci];
        for (var rcv = 0; rcv < rcCols[rci].variableIds.length; rcv++) { var v0 = await figma.variables.getVariableByIdAsync(rcCols[rci].variableIds[rcv]); if (v0) allVars.push(v0); }
      }
      var primaryVars = allVars.filter(function (v) { return v.name.indexOf('color/palette/primary/') === 0; }).sort(function (a, b2) { return a.name.localeCompare(b2.name); });
      if (!primaryVars.length) { figma.ui.postMessage({ type: 'error', message: '没找到主色变量 color/palette/primary/*，请先跑 ④ 复制副本并绑定变量' }); return; }
      function rcCurHex(v) { var val = Object.values(v.valuesByMode)[0]; return (val && typeof val.r === 'number') ? figmaRgbToHex(val) : null; }
      function rcSetAll(v, rgb01) { var col = rcColById[v.variableCollectionId], ms = (col && col.modes) ? col.modes : []; for (var mm = 0; mm < ms.length; mm++) { try { v.setValueForMode(ms[mm].modeId, { r: rgb01.r, g: rgb01.g, b: rgb01.b, a: 1 }); } catch (e) {} } }
      // 老主色色相（重算前，取主色阶里最鲜艳一档）
      var oldBrandHue = null, maxChroma = -1;
      primaryVars.forEach(function (v) { var h = rcCurHex(v); if (h) { var o = rcRgbToOklch(rcHexToRgb255(h)); if (o.C > maxChroma) { maxChroma = o.C; oldBrandHue = o.H; } } });
      // 功能色语义引用到的基础色 id（保护：不被换主色波及）
      var funcIds = {};
      allVars.forEach(function (v) { if (v.name.indexOf('color/function/') === 0) Object.keys(v.valuesByMode).forEach(function (m) { var val = v.valuesByMode[m]; if (val && val.type === 'VARIABLE_ALIAS') funcIds[val.id] = true; }); });
      // brand/primary 当前指向第几档 primary/R——把新主色锚在同一档，换肤后主色档位与原稿对齐(不漂移)
      var brandPrim = allVars.find(function (v) { return v.name === 'color/brand/primary'; });
      var anchorRank = null;
      if (brandPrim) {
        var bpv0 = Object.values(brandPrim.valuesByMode)[0];
        if (bpv0 && bpv0.type === 'VARIABLE_ALIAS') {
          var bpTgt = allVars.find(function (v) { return v.id === bpv0.id; });
          if (bpTgt) { var bpm = bpTgt.name.match(/^color\/palette\/primary\/(\d+)$/); if (bpm) { var ar = parseInt(bpm[1], 10); var pidx = primaryVars.indexOf(bpTgt); if (pidx >= 0) anchorRank = pidx; else if (ar < primaryVars.length) anchorRank = ar; } }
        }
      }
      // ① 主色阶：以输入色为锚的标准色阶，输入主色固定落在 anchorRank 档（与原稿主色档位对齐）
      var newVals = reverseRecolorRamp(primaryVars.map(function (v) { return rcCurHex(v) || '#000000'; }), newColor, anchorRank);
      if (!newVals) { figma.ui.postMessage({ type: 'error', message: '换主色失败：颜色解析错误' }); return; }
      var changed = 0;
      primaryVars.forEach(function (v, i) { if (newVals[i]) { rcSetAll(v, newVals[i]); changed++; } });
      // 把 color/brand/primary 重新指向「输入主色实际落在的那一档」——已锚在 anchorRank，这里兜底确认主色档一致
      var mainIdx = -1, mainBd = Infinity;
      for (var mi = 0; mi < newVals.length; mi++) { if (!newVals[mi]) continue; var dM = auditDeltaE(figmaRgbToHex(newVals[mi]), newColor); if (dM < mainBd) { mainBd = dM; mainIdx = mi; } }
      if (brandPrim && mainIdx >= 0 && primaryVars[mainIdx]) {
        try { var bcol = rcColById[brandPrim.variableCollectionId], bms = (bcol && bcol.modes) ? bcol.modes : [], al = figma.variables.createVariableAlias(primaryVars[mainIdx]); for (var bm = 0; bm < bms.length; bm++) brandPrim.setValueForMode(bms[bm].modeId, al); } catch (e) {}
      }
      // ② 其它「同老主色色相」的基础色（被聚类散到 red/orange 等族的品牌色）：旋到新主色色相、保各自明度/饱和
      var newHue = rcRgbToOklch(rcHexToRgb255(newColor)).H, extra = 0;
      if (oldBrandHue != null) {
        allVars.forEach(function (v) {
          if (v.name.indexOf('color/palette/') !== 0 || v.name.indexOf('color/palette/primary/') === 0 || v.name.indexOf('color/palette/gray') === 0) return;
          if (funcIds[v.id]) return; // 功能色引用到的基础色：保护
          var h = rcCurHex(v); if (!h) return;
          var o = rcRgbToOklch(rcHexToRgb255(h)); if (o.C < 0.04) return; // 近灰跳过
          var dh = Math.min(Math.abs(o.H - oldBrandHue), 360 - Math.abs(o.H - oldBrandHue));
          if (dh > 30) return; // 非品牌色相，保留
          rcSetAll(v, rcOklchToRgb01(o.L, o.C, newHue)); extra++;
        });
      }
      figma.ui.postMessage({ type: 'result', message: '已换主色：主色阶 ' + changed + ' 档 + 同色相品牌色 ' + extra + ' 个（功能色 success/warning/danger/info 保持不变）' });
    }
  } catch (err) {
    try { console.error('[plugin]', err); } catch (e) {} // 完整堆栈进控制台
    var REV = ['audit', 'rebuild', 'reverse-preview', 'reverse-bind', 'reverse-recolor'];
    var isReverse = msg && REV.indexOf(msg.type) >= 0;
    // 反推：给人话错误（堆栈见控制台）；web：保持原格式不变
    var em = isReverse ? ('出错了：' + ((err && err.message) ? err.message : String(err)) + '（详细堆栈见控制台）')
                       : ('错误: ' + (err.message || String(err)) + ' | stack: ' + (err.stack || '').slice(0, 200));
    figma.ui.postMessage({ type: 'error', message: em });
  }
};
