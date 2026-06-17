// Design System v2 — Figma Plugin
// 功能 1: 同步变量（从 Web 端 JSON 更新 Figma Variables）
// 功能 2: 生成预览页（基于 JSON 数据创建可视化文档）

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
      if (swatchRgb) {
        swatch.fills = [{ type: 'SOLID', color: swatchRgb }];
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
      // Light value
      addText(rowFrame, 500, 18, row.light || '-', 11, 'Regular', TEXT_DIM);
      // Dark value
      addText(rowFrame, 660, 18, row.dark || '-', 11, 'Regular', TEXT_DIM);
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
      rows.push({ name: tEntry[0], light: tEntry[1].light, dark: tEntry[1].dark, usage: tEntry[1].usage, varName: tEntry[1].figmaName });
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
// 收敛力度档位：[absTol, relTol] 越大合并越狠、档越少。colorDelta 同理影响颜色聚类。
var REBUILD_TIGHTNESS = {
  loose:  { colorDelta: 1.5, font: [1.0, 0.04], radius: [1.5, 0.18], spacing: [1.5, 0.10] },
  medium: { colorDelta: 2.5, font: [1.5, 0.06], radius: [2.0, 0.25], spacing: [2.0, 0.15] },
  tight:  { colorDelta: 4.0, font: [2.5, 0.12], radius: [4.0, 0.40], spacing: [4.0, 0.25] },
};
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
// 收敛（保留常用值）：把一组带频率的数值合并成少量「档」。
// 以用得最多的值为代表，近似/偶发值并入最近的代表档；返回档位、原始值→档位映射、合并清单。
function consolidateNumbers(tally, absTol, relTol) {
  var byFreq = tally.slice().sort(function (a, b) { return b.count - a.count || a.value - b.value; });
  var levels = [];
  byFreq.forEach(function (t) {
    var nearest = null, nd = Infinity;
    for (var i = 0; i < levels.length; i++) { var d = Math.abs(t.value - levels[i].value); if (d < nd) { nd = d; nearest = levels[i]; } }
    var tol = Math.max(absTol, relTol * t.value);
    if (t.count <= 1) tol *= 1.8;               // 偶发值（仅 1 次）更容易并入
    if (nearest && nd <= tol) nearest.count += t.count;  // 并入更高频的档
    else levels.push({ value: t.value, count: t.count });
  });
  var map = {}, merges = [];
  tally.forEach(function (t) {
    var nearest = levels[0], nd = Math.abs(t.value - levels[0].value);
    for (var i = 1; i < levels.length; i++) { var d = Math.abs(t.value - levels[i].value); if (d < nd) { nd = d; nearest = levels[i]; } }
    map[t.value] = nearest.value;
    if (nearest.value !== t.value) merges.push({ from: t.value, to: nearest.value, count: t.count });
  });
  levels.sort(function (a, b) { return a.value - b.value; });
  return { levels: levels, map: map, merges: merges };
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

  // 中性阶：按亮度降序映射到最近标准阶（冲突时顺延到空位）
  neutrals.sort(function (a, b) { return b.L - a.L; });
  var usedStep = {};
  var neutralRamp = neutrals.map(function (c) {
    var idx = rebuildLStep(c.L);
    while (usedStep[idx] && idx < REBUILD_STEPS.length - 1) idx++;
    while (usedStep[idx] && idx > 0) idx--;
    usedStep[idx] = true;
    var step = REBUILD_STEPS[idx], name = 'color.neutral.' + step;
    mapCluster(c, name);
    return { name: name, step: step, hex: c.hex, count: c.count };
  }).sort(function (a, b) { return a.step - b.step; });

  // 主色：按「频率 × 彩度」选基准——避免高频但发灰的文本色（如蓝灰 slate）压过真正鲜明的品牌色。
  chromatics.sort(function (a, b) { return (b.count * b.chroma) - (a.count * a.chroma); });
  var primaryRamp = [], semantic = {}, accents = [], used = {};
  if (chromatics.length) {
    var base = chromatics[0];
    var family = chromatics.filter(function (c) { var dh = Math.abs(c.hue - base.hue); dh = Math.min(dh, 360 - dh); return dh <= 18; });
    family.forEach(function (c) { used[c.hex] = true; });
    family.sort(function (a, b) { return b.L - a.L; });
    primaryRamp = family.map(function (c) {
      var step = REBUILD_STEPS[rebuildLStep(c.L)], name = 'color.primary.' + step;
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
function rebuildTypeScale(obs, absTol, relTol) {
  var texts = obs.texts || [];
  var tally = auditTally(texts.map(function (t) { return t.size; })).filter(function (t) { return typeof t.value === 'number'; });
  if (!tally.length) return { roles: [], mapping: [], merges: [], rawCount: 0 };
  var cons = consolidateNumbers(tally, absTol == null ? 1.5 : absTol, relTol == null ? 0.06 : relTol);
  var levels = cons.levels;
  // body = 12–18 内最频繁的档；否则取中位
  var body = null, bestCount = -1;
  levels.forEach(function (l) { if (l.value >= 12 && l.value <= 18 && l.count > bestCount) { bestCount = l.count; body = l.value; } });
  if (body == null) body = levels[Math.floor(levels.length / 2)].value;
  var bodyIdx = 0;
  for (var i = 0; i < levels.length; i++) { if (levels[i].value === body) { bodyIdx = i; break; } }
  var below = ['callout', 'footnote', 'caption', 'caption2', 'micro'];
  var above = ['headline', 'subtitle', 'title3', 'title2', 'title1', 'largeTitle', 'display'];
  var roleOf = {};
  var roles = levels.map(function (l, i) {
    var off = i - bodyIdx, role;
    if (off === 0) role = 'body';
    else if (off < 0) role = below[(-off) - 1] || ('xs' + (-off));
    else role = above[off - 1] || ('xl' + off);
    var name = 'font.size.' + role;
    roleOf[l.value] = name;
    return { role: role, name: name, size: l.value, count: l.count };
  });
  // 映射：每个原始字号 → 其所属档的角色 token
  var mapping = tally.map(function (t) { return { kind: 'size', from: t.value, to: roleOf[cons.map[t.value]] }; });
  return { roles: roles, mapping: mapping, merges: cons.merges, rawCount: tally.length };
}
function rebuildRadius(obs, absTol, relTol) {
  var tally = auditTally(obs.radii || []);
  if (!tally.length) return { scale: [], mapping: [], merges: [], rawCount: 0 };
  var cons = consolidateNumbers(tally, absTol == null ? 2 : absTol, relTol == null ? 0.25 : relTol);
  var names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'], nameOf = {};
  var scale = cons.levels.map(function (l, i) {
    var name = 'radius.' + (l.value >= 100 ? 'full' : (names[i] || ('s' + i)));
    nameOf[l.value] = name;
    return { name: name, value: l.value, count: l.count };
  });
  var mapping = tally.map(function (t) { return { kind: 'radius', from: t.value, to: nameOf[cons.map[t.value]] }; });
  return { scale: scale, mapping: mapping, merges: cons.merges, rawCount: tally.length };
}
function rebuildSpacing(obs, grid, absTol, relTol) {
  grid = grid || 4;
  var tally = auditTally(obs.spacings || []);
  if (!tally.length) return { scale: [], mapping: [], merges: [], rawCount: 0 };
  var cons = consolidateNumbers(tally, absTol == null ? 2 : absTol, relTol == null ? 0.15 : relTol);
  // 档位吸附到网格，并合并吸附后撞车的档
  var snapOf = {}, byVal = {};
  cons.levels.forEach(function (l) {
    var v = Math.round(l.value / grid) * grid; if (v <= 0) v = l.value;
    snapOf[l.value] = v;
    if (!byVal[v]) byVal[v] = { value: v, count: 0 }; byVal[v].count += l.count;
  });
  var levels = Object.keys(byVal).map(function (k) { return byVal[k]; }).sort(function (a, b) { return a.value - b.value; });
  var nameOf = {};
  var scale = levels.map(function (l, i) { var name = 'space.' + (i + 1); nameOf[l.value] = name; return { name: name, value: l.value, count: l.count }; });
  var mapping = tally.map(function (t) { return { kind: 'spacing', from: t.value, to: nameOf[snapOf[cons.map[t.value]]] }; });
  var merges = cons.merges.map(function (m) { return { from: m.from, to: Math.round(m.to / grid) * grid, count: m.count }; });
  return { scale: scale, mapping: mapping, merges: merges, rawCount: tally.length };
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
  var tightness = REBUILD_TIGHTNESS[opts.tightness] ? opts.tightness : 'medium';
  var t = REBUILD_TIGHTNESS[tightness];
  var grid = opts.grid || 4;
  var colorDelta = opts.colorDelta != null ? opts.colorDelta : t.colorDelta;
  var colors = rebuildColorSystem(obs, { colorDelta: colorDelta, chromaNeutral: opts.chromaNeutral });
  var type = rebuildTypeScale(obs, t.font[0], t.font[1]);
  var radius = rebuildRadius(obs, t.radius[0], t.radius[1]);
  var spacing = rebuildSpacing(obs, grid, t.spacing[0], t.spacing[1]);
  var shadow = rebuildShadow(obs);
  var mapping = [].concat(colors.mapping, type.mapping, radius.mapping, spacing.mapping, shadow.mapping);
  var tokenCount = colors.neutral.length + colors.primary.length + Object.keys(colors.semantic).length + colors.accents.length
    + type.roles.length + radius.scale.length + spacing.scale.length + shadow.scale.length;
  return { tightness: tightness, theme: rebuildDetectTheme(obs), colors: colors, type: type, radius: radius, spacing: spacing, shadow: shadow, mapping: mapping, tokenCount: tokenCount };
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
// 色阶推导（与 Web 端 HSL buildScale 同口径）：从一个锚色生成 10 阶基础色（引用色）。
// 锚色精确落在第 5 阶，偏移向两端渐隐，让色阶看起来和网页端一致、不再单薄。
function rebuildClampN(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
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
function rebuildHslToHex(h, s, l) {
  var hue = ((h % 360) + 360) % 360, sat = rebuildClampN(s, 0, 100) / 100, light = rebuildClampN(l, 0, 100) / 100;
  var cc = (1 - Math.abs(2 * light - 1)) * sat, x = cc * (1 - Math.abs((hue / 60) % 2 - 1)), m = light - cc / 2, r = 0, g = 0, b = 0;
  if (hue < 60) { r = cc; g = x; } else if (hue < 120) { r = x; g = cc; } else if (hue < 180) { g = cc; b = x; }
  else if (hue < 240) { g = x; b = cc; } else if (hue < 300) { r = x; b = cc; } else { r = cc; b = x; }
  var toH = function (n) { return rebuildClampN(Math.round((n + m) * 255), 0, 255).toString(16).padStart(2, '0'); };
  return ('#' + toH(r) + toH(g) + toH(b)).toUpperCase();
}
var REBUILD_LIGHTS = [97, 92, 84, 74, 64, 54, 44, 34, 24, 15];
var REBUILD_SATS = [45, 52, 60, 68, 76, 84, 82, 78, 70, 62];
function rebuildScaleFrom(hex) {
  var hsl = rebuildRgbToHsl(hex), lo = hsl.l - REBUILD_LIGHTS[5], so = hsl.s - REBUILD_SATS[5];
  return REBUILD_LIGHTS.map(function (light, i) {
    var blend = Math.max(0, 1 - Math.abs(i - 5) * 0.18);
    return rebuildHslToHex(hsl.h, rebuildClampN(REBUILD_SATS[i] + so * blend, 10, 100), rebuildClampN(light + lo * blend, 3, 99));
  });
}
function rebuildGrayScaleFrom(hex) {
  var hsl = rebuildRgbToHsl(hex), sat = Math.min(hsl.s, 12);
  return REBUILD_LIGHTS.map(function (light, i) { return rebuildHslToHex(hsl.h, sat, light - (i > 7 ? 2 : 0)); });
}
// 与 Web 端一致的基础色谱色相锚点（generatePreview 也只渲染这几族 + primary/gray）。
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
  var area = {}, fills = obs.fills || [];
  for (var i = 0; i < fills.length; i++) area[fills[i].hex] = (area[fills[i].hex] || 0) + (fills[i].area || 0);
  var best = null, ba = -1;
  for (var h in area) { if (area[h] > ba) { ba = area[h]; best = h; } }
  if (!best || ba <= 0) {                       // 没有面积信息时退回按次数
    var t = auditTally(fills.map(function (f) { return f.hex; }));
    best = t.length ? t[0].value : '#FFFFFF';
  }
  return rebuildRgbToHsl(best).l < 50 ? 'dark' : 'light';
}
function rebuildToPreviewData(plan) {
  var colorTokens = {}, dimTokens = {};
  function fn(key) { return key.replace(/\./g, '/'); }
  function addColor(key, hex, tier, usage, dark) {
    colorTokens[key] = { figmaName: fn(key), tier: tier || 'primitive', light: hex, dark: dark || hex, usage: usage || '' };
  }
  function addDim(key, value, extra) {
    var o = { figmaName: fn(key), tier: 'primitive', value: value, type: 'dimension', usage: '' };
    if (extra) for (var k in extra) o[k] = extra[k];
    dimTokens[key] = o;
  }
  var C = plan.colors;
  var BASE = 5; // 锚色落在的基准档（rebuildScaleFrom 把输入放在 index 5）

  // ===== 基础色 primitive：完整色谱（换绑/扩展永远够引用） =====
  // 1) 主色族 primary：用检测主色（最常用那档）推 10 阶 → 渲染为大色块「Primary」
  var primRep = '#3366FF';
  if (C.primary.length) primRep = C.primary.slice().sort(function (a, b) { return (b.count * auditChroma(b.hex)) - (a.count * auditChroma(a.hex)); })[0].hex;
  else if (C.neutral.length) primRep = C.neutral[0].hex;
  var primaryRamp = rebuildScaleFrom(primRep);
  primaryRamp.forEach(function (hex, i) { addColor('color.palette.primary.' + i, hex, 'primitive'); });
  // 2) 中性族 gray（注意：generatePreview 用 'gray' 这个族名，不是 'neutral'）
  var neutralAnchor = C.neutral.length
    ? C.neutral.slice().sort(function (a, b) { return auditChroma(b.hex) - auditChroma(a.hex); })[0].hex
    : primRep;
  var grayRamp = rebuildGrayScaleFrom(neutralAnchor); // index 0=最浅 … 9=最深
  grayRamp.forEach(function (hex, i) { addColor('color.palette.gray.' + i, hex, 'primitive'); });
  // 3) 完整色谱 red/orange/yellow/green/cyan/blue/purple：被检测到的族用检测锚（保真），其余用通用锚
  var familyAnchor = {};
  function claim(hex, priority) {
    if (auditChroma(hex) < 18) return;          // 近灰色不去锚定鲜明色族，免得整族发灰
    var fam = rebuildHueFamily(rebuildHueDeg(hex));
    if (!familyAnchor[fam] || priority > familyAnchor[fam].p) familyAnchor[fam] = { hex: hex, p: priority };
  }
  Object.keys(C.semantic).forEach(function (k) { claim(C.semantic[k].hex, 50); });
  C.accents.forEach(function (t) { claim(t.hex, 10); });
  for (var fam in REBUILD_SPECTRUM) {
    var anchor = familyAnchor[fam] ? familyAnchor[fam].hex : rebuildHslToHex(REBUILD_SPECTRUM[fam], 78, REBUILD_LIGHTS[BASE]);
    rebuildScaleFrom(anchor).forEach(function (hex, i) { addColor('color.palette.' + fam + '.' + i, hex, 'primitive'); });
  }
  // P(fam, lightIdx, darkIdx) → 取色族对应阶的 hex（明/暗各取一阶）
  function P(fam, li, di) { var l = colorTokens['color.palette.' + fam + '.' + li], d = colorTokens['color.palette.' + fam + '.' + (di == null ? li : di)]; return { light: l ? l.light : null, dark: d ? d.light : null }; }
  function G(li, di) { return { light: grayRamp[rebuildClampN(li, 0, 9)], dark: grayRamp[rebuildClampN(di == null ? li : di, 0, 9)] }; }

  // ===== 语义色 semantic：角色名 + 引用基础色；品牌色保留 8 级梯度（与 Web 端一致）=====
  // 品牌 8 级（明/暗各引用 primary 不同阶，主色明确为 primary）
  var brand = [
    ['subtle', 0, 9, '品牌最浅底色'], ['soft', 1, 8, '品牌浅色'], ['muted', 2, 7, '品牌中浅色'],
    ['primary.hover', 4, 4, '主操作悬停'], ['primary', BASE, BASE, '主色 · 主操作'],
    ['primary.active', 6, 6, '主操作按下'], ['emphasis', 7, 3, '品牌深强调'], ['strong', 8, 2, '品牌最深色'],
  ];
  brand.forEach(function (b) { var c = P('primary', b[1], b[2]); addColor('color.brand.' + b[0], c.light, 'semantic', b[3] + ' → primary.' + b[1], c.dark); });

  // 功能色：基准 + 浅底，明/暗各引用所属色族不同阶
  var fname = { success: 'success', warning: 'warning', error: 'danger', info: 'info' };
  var fusage = { success: '成功', warning: '警告', error: '危险 / 错误', info: '信息' };
  Object.keys(C.semantic).forEach(function (k) {
    var fam = rebuildHueFamily(rebuildHueDeg(C.semantic[k].hex)), nm = fname[k] || k;
    var base = P(fam, BASE, BASE), bg = P(fam, 1, 8);
    addColor('color.function.' + nm, base.light, 'semantic', (fusage[k] || '') + ' → ' + fam + '.' + BASE, base.dark);
    addColor('color.function.' + nm + '-bg', bg.light, 'semantic', (fusage[k] || '') + ' · 浅底', bg.dark);
  });
  C.accents.forEach(function (t, i) {
    var fam = rebuildHueFamily(rebuildHueDeg(t.hex)), c = P(fam, BASE, BASE);
    addColor('color.auxiliary.' + (i + 1), c.light, 'semantic', '辅助 / 强调 → ' + fam + '.' + BASE, c.dark);
  });

  // 文本/背景/边框：明暗各引用 gray 阶不同端（明=浅底深字，暗=深底浅字），与 Web 端映射一致
  var bgPage = G(0, 9), bgSurf = G(0, 8), bgElev = G(0, 7), bgOver = G(9, 9);
  addColor('color.bg.page', bgPage.light, 'semantic', '页面背景', bgPage.dark);
  addColor('color.bg.surface', bgSurf.light, 'semantic', '容器背景', bgSurf.dark);
  addColor('color.bg.elevated', bgElev.light, 'semantic', '浮层背景', bgElev.dark);
  addColor('color.bg.overlay', bgOver.light, 'semantic', '遮罩', bgOver.dark);
  var tPri = G(9, 0), tSec = G(7, 2), tTer = G(5, 4), tDis = G(4, 6);
  addColor('color.text.primary', tPri.light, 'semantic', '主文本', tPri.dark);
  addColor('color.text.secondary', tSec.light, 'semantic', '次文本', tSec.dark);
  addColor('color.text.tertiary', tTer.light, 'semantic', '三级文本', tTer.dark);
  addColor('color.text.disabled', tDis.light, 'semantic', '禁用文本', tDis.dark);
  var bSub = G(1, 8), bDef = G(2, 7), bStr = G(3, 6);
  addColor('color.border.subtle', bSub.light, 'semantic', '弱边框', bSub.dark);
  addColor('color.border.default', bDef.light, 'semantic', '默认边框', bDef.dark);
  addColor('color.border.strong', bStr.light, 'semantic', '强边框', bStr.dark);

  // 字号 / 圆角 / 间距
  plan.type.roles.forEach(function (r) {
    addDim('font.size.' + r.role, r.size, { role: r.role.charAt(0).toUpperCase() + r.role.slice(1), weight: 400, lineHeight: Math.round(r.size * 1.5) });
  });
  plan.radius.scale.forEach(function (s) { addDim(s.name, s.value); });
  plan.spacing.scale.forEach(function (s) { addDim(s.name, s.value); });

  var theme = plan.theme || 'light';
  return {
    name: '反推设计规范', version: 'reverse', platform: 'app-web',
    seed: { localFont: 'pingfang', defaultMode: theme }, defaultMode: theme,
    colorTokens: colorTokens, dimTokens: dimTokens,
  };
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
  function visit(node) {
    if (obs.nodeCount >= maxNodes) { obs.truncated = true; return; }
    obs.nodeCount++;
    if ('fills' in node && node.fills !== figma.mixed) {
      var area = (typeof node.width === 'number' && typeof node.height === 'number') ? node.width * node.height : 0;
      pushSolid(obs.fills, node.fills, { nodeType: node.type, area: area });
    }
    if ('strokes' in node) pushSolid(obs.strokes, node.strokes, { weight: (typeof node.strokeWeight === 'number' ? node.strokeWeight : null) });
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

// 反推 · 阶段②衍生：缓存上次重建结果，供「生成预览页」复用。
// 预览走 rebuildToPreviewData(plan) → 现有 generatePreview，与网页端 JSON 粘贴同一张规范页。
var lastRebuildPlan = null;

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
      var rbPlan = buildRebuildPlan(rbObs, { tightness: (msg.tightness || 'medium') });
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
        rpPlan = buildRebuildPlan(harvestSelection(rpSel, 20000), { tightness: (msg.tightness || 'medium') });
      }
      figma.ui.postMessage({ type: 'progress', message: '正在生成规范预览页...' });
      // 翻译成正向数据 → 复用现有 generatePreview（不改动 web 端 JSON 的生成路径）
      await generatePreview(rebuildToPreviewData(rpPlan));
      figma.ui.postMessage({ type: 'result', message: '规范预览页已生成（与网页端同款，未改动原设计）' });
    }
    else if (msg.type === 'reverse-sync') {
      // 2.0 反推 · 阶段③前半：用反推结果创建/同步 Figma 变量库（只新增变量集合，不动图层）
      var rvPlan = lastRebuildPlan;
      if (!rvPlan) {
        var rvSel = figma.currentPage.selection;
        if (!rvSel || rvSel.length === 0) {
          figma.ui.postMessage({ type: 'error', message: '请先选中画板并「重建为干净 token」，再创建变量库' });
          return;
        }
        rvPlan = buildRebuildPlan(harvestSelection(rvSel, 20000), { tightness: (msg.tightness || 'medium') });
      }
      figma.ui.postMessage({ type: 'progress', message: '正在用反推结果创建变量库...' });
      // 复用现有 syncVariables（与 web 端 JSON 同一条创建路径，只新增变量集合，不绑定图层）
      var rvResult = await syncVariables(rebuildToPreviewData(rvPlan));
      figma.ui.postMessage({
        type: 'result',
        message: '反推变量库已创建：新建 ' + rvResult.created + ' · 更新 ' + rvResult.updated + ' · 跳过 ' + rvResult.skipped + '（仅新增变量集合，未改动图层）',
      });
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: '错误: ' + (err.message || String(err)) + ' | stack: ' + (err.stack || '').slice(0, 200) });
  }
};
