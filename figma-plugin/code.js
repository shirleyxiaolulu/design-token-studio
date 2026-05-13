// Design System v2 — Figma Plugin
// 功能 1: 同步变量（从 Web 端 JSON 更新 Figma Variables）
// 功能 2: 生成预览页（基于 JSON 数据创建可视化文档）

figma.showUI(__html__, { width: 340, height: 520 });

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
      newVar.scopes = ['ALL_FILLS'];
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
  var colorEntries = Object.entries(data.colorTokens || {});
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

  return { created: created, updated: updated, skipped: skipped, cleaned: cleaned, verify: verifyMsg };
}

// =============================================
// Generate Preview Page
// =============================================
async function generatePreview(data) {
  // Load PingFang SC (primary) + Inter (fallback)
  var fontLoaded = false;
  try {
    await figma.loadFontAsync({ family: 'PingFang SC', style: 'Regular' });
    await figma.loadFontAsync({ family: 'PingFang SC', style: 'Semibold' });
    fontLoaded = true;
  } catch (e) {
    // Fallback to Inter if PingFang SC not available
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  }
  var FONT_FAMILY = fontLoaded ? 'PingFang SC' : 'Inter';
  var FONT_BOLD = fontLoaded ? 'Semibold' : 'Semi Bold';

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
  const brandHex = brandToken ? brandToken.light : '#6533E8';
  const brandRgb = hexToFigmaRgb(brandHex) || { r: 0.4, g: 0.2, b: 0.91 };

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
    t.fills = [{ type: 'SOLID', color: color || TEXT_BRIGHT, opacity: opacity !== undefined ? opacity : 1 }];
    return t;
  }

  function addLine(parent, x, y, w) {
    const r = figma.createRectangle();
    parent.appendChild(r); r.x = x; r.y = y; r.resize(w, 1);
    r.fills = [{ type: 'SOLID', color: CARD_BORDER }];
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
    kickerBg.fills = [{ type: 'SOLID', color: brandRgb, opacity: 0.12 }];
    // Kicker dot
    var kickerDot = figma.createEllipse();
    parent.appendChild(kickerDot);
    kickerDot.x = 72; kickerDot.y = y + 8.5;
    kickerDot.resize(5, 5);
    kickerDot.fills = [{ type: 'SOLID', color: brandRgb }];
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
  const platLabel = data.platform === 'ios-app' ? 'iOS App' : 'Web 后台';
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
  semKickerBg.fills = [{ type: 'SOLID', color: brandRgb, opacity: 0.12 }];
  var semKickerDot = figma.createEllipse();
  frame.appendChild(semKickerDot);
  semKickerDot.x = 72; semKickerDot.y = Y + 8.5;
  semKickerDot.resize(5, 5);
  semKickerDot.fills = [{ type: 'SOLID', color: brandRgb }];
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

    // Category title + description
    addText(card, CARD_PAD, 20, title, 18, 'Regular', TEXT_BRIGHT);
    addText(card, CARD_PAD, 48, subtitle, 12, 'Regular', TEXT_DIM);

    // Inner divider
    var divLine = figma.createRectangle();
    card.appendChild(divLine);
    divLine.x = CARD_PAD; divLine.y = 78;
    divLine.resize(INNER_W, 1);
    divLine.fills = [{ type: 'SOLID', color: CARD_BORDER }];

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
    }

    return startY + cardH;
  }

  // Define semantic groups with Chinese titles matching source
  var semanticGroups = [
    { prefix: 'color.brand', title: '品牌颜色 — brand', subtitle: '品牌主色及其 8 级交互梯度，从最浅底色到最深强调。覆盖按钮、标签、卡片等全部品牌表达场景。' },
    { prefix: 'color.auxiliary', title: '辅助色 — auxiliary', subtitle: '辅助色用于分类标签、数据可视化、运营活动和品牌延展，不承担系统反馈含义。' },
    { prefix: 'color.function', title: '功能色 — function', subtitle: '用于成功、警告、危险和信息反馈的状态色，包含正色和浅底色两组。' },
    { prefix: 'color.text', title: '文本颜色 — text', subtitle: '从主文本到水印的 8 级灰度梯度，确保界面中每层信息都有清晰的视觉优先级。' },
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
  cjkCard.resize(510, 240); cjkCard.cornerRadius = 12;
  cjkCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  cjkCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; cjkCard.strokeWeight = 1;
  addText(cjkCard, 25, 24, 'CJK · 中文', 12, 'Regular', TEXT_MUTED);
  addText(cjkCard, 25, 50, '苹方', 56, 'Regular', TEXT_BRIGHT);
  addText(cjkCard, 25, 116, 'PingFang SC, system-ui', 12, 'Regular', TEXT_MUTED);
  // Weight specimens
  var cjkWeights = [['字', 'Light', '300', 0], ['字', 'Regular', '400', 72], ['字', 'Medium', '500', 144], ['字', 'Semibold', '600', 216], ['字', 'Bold', '700', 288]];
  for (var cwi = 0; cwi < cjkWeights.length; cwi++) {
    var cw = cjkWeights[cwi];
    addText(cjkCard, 25 + cw[3], 148, cw[0], 32, 'Regular', TEXT_BRIGHT);
    addText(cjkCard, 25 + cw[3], 186, cw[1], 11, 'Regular', TEXT_DIM);
    addText(cjkCard, 25 + cw[3], 202, cw[2], 11, 'Regular', TEXT_MUTED);
  }

  // Latin font card: right half
  var latCard = figma.createFrame();
  frame.appendChild(latCard);
  latCard.name = 'Font Card / Latin';
  latCard.x = 590; latCard.y = Y;
  latCard.resize(526, 240); latCard.cornerRadius = 12;
  latCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  latCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; latCard.strokeWeight = 1;
  addText(latCard, 25, 24, 'Latin · 西文', 12, 'Regular', TEXT_MUTED);
  addText(latCard, 25, 50, 'Inter', 56, 'Regular', TEXT_BRIGHT);
  addText(latCard, 25, 116, 'Inter, system-ui', 12, 'Regular', TEXT_MUTED);
  var latWeights = [['Aa', 'Regular', '400', 0], ['Aa', 'Medium', '500', 72], ['Aa', 'Semibold', '600', 144], ['Aa', 'Bold', '700', 216]];
  for (var lwi = 0; lwi < latWeights.length; lwi++) {
    var lw = latWeights[lwi];
    addText(latCard, 25 + lw[3], 148, lw[0], 32, 'Regular', TEXT_BRIGHT);
    addText(latCard, 25 + lw[3], 186, lw[1], 11, 'Regular', TEXT_DIM);
    addText(latCard, 25 + lw[3], 202, lw[2], 11, 'Regular', TEXT_MUTED);
  }

  Y += 276; // 240 + 36 gap

  // ===== SECTION 04: TYPE SCALE =====
  Y = addSection(frame, Y, '04', '字号规范',
    '字体、字号和行高共同决定信息层级。每个 token 定义从展示标题到辅助说明的完整排印体系。');

  var typeScaleRows;
  if (data.platform === 'ios-app') {
    typeScaleRows = [
      ['text.largeTitle', 28, '700', '大标题、首屏展示'],
      ['text.title1', 22, '700', '一级标题、模块头'],
      ['text.title2', 18, '600', '二级标题、卡片头'],
      ['text.title3', 16, '600', '三级标题、列表组头'],
      ['text.body', 14, '400', '正文常用尺寸'],
      ['text.subhead', 13, '400', '副标题、列表描述'],
      ['text.footnote', 12, '400', '脚注、次要信息'],
      ['text.caption', 11, '400', '时间戳、辅助标签'],
      ['text.mini', 10, '400', '角标、最小标注']
    ];
  } else {
    typeScaleRows = [
      ['text.3xl', 32, '800', '展示标题、Hero 区'],
      ['text.2xl', 24, '700', '页面标题'],
      ['text.xl', 20, '700', '模块标题'],
      ['text.lg', 16, '400', '大正文、导语'],
      ['text.md', 14, '400', '正文默认'],
      ['text.xs', 12, '500', '标签、辅助']
    ];
  }

  var tsRowH = 64;
  var tsCardH = 64 + typeScaleRows.length * tsRowH + 10;

  var tsCard = figma.createFrame();
  frame.appendChild(tsCard);
  tsCard.name = 'Type Scale';
  tsCard.x = 64; tsCard.y = Y;
  tsCard.resize(CARD_W, tsCardH); tsCard.cornerRadius = 12;
  tsCard.fills = [{ type: 'SOLID', color: CARD_BG }];
  tsCard.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; tsCard.strokeWeight = 1;
  tsCard.clipsContent = true;

  addText(tsCard, CARD_PAD, 22, '字号规范 · Type Scale', 18, 'Regular', TEXT_BRIGHT);
  addText(tsCard, 850, 24, 'BASE · 14px', 12, 'Regular', TEXT_MUTED);
  var tsDivTop = figma.createRectangle();
  tsCard.appendChild(tsDivTop); tsDivTop.x = CARD_PAD; tsDivTop.y = 64;
  tsDivTop.resize(INNER_W, 1); tsDivTop.fills = [{ type: 'SOLID', color: CARD_BORDER }];

  for (var tsi = 0; tsi < typeScaleRows.length; tsi++) {
    var tsRow = typeScaleRows[tsi];
    var tsName = tsRow[0], tsSize = tsRow[1], tsWeight = tsRow[2], tsUsage = tsRow[3];
    var tsY = 64 + tsi * tsRowH;
    var tsLh = Math.round(tsSize * 1.5);
    // Left: token name + spec
    addText(tsCard, CARD_PAD, tsY + 18, tsName, 13, 'Semi Bold', TEXT_BRIGHT);
    addText(tsCard, CARD_PAD, tsY + 38, tsSize + ' / ' + tsLh + ' · w' + tsWeight, 11, 'Regular', TEXT_MUTED);
    // Center: usage text at actual size
    addText(tsCard, 230, tsY + 22, tsUsage, tsSize, 'Regular', TEXT_BRIGHT);
    // Right: size badge
    addText(tsCard, 950, tsY + 22, tsSize + 'px', 11, 'Semi Bold', TEXT_DIM);
    // Row divider
    if (tsi < typeScaleRows.length - 1) {
      var tsDiv = figma.createRectangle();
      tsCard.appendChild(tsDiv); tsDiv.x = CARD_PAD; tsDiv.y = tsY + tsRowH;
      tsDiv.resize(INNER_W, 1); tsDiv.fills = [{ type: 'SOLID', color: CARD_BORDER }];
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

      // Preview swatch 72×40 with dashed border
      var rSwatch = figma.createRectangle();
      rCard.appendChild(rSwatch);
      rSwatch.x = 24; rSwatch.y = 20;
      rSwatch.resize(72, 40);
      rSwatch.cornerRadius = Math.min(rVal, 20);
      rSwatch.fills = [{ type: 'SOLID', color: brandRgb, opacity: 0.06 }];
      rSwatch.strokes = [{ type: 'SOLID', color: brandRgb, opacity: 0.4 }];
      rSwatch.strokeWeight = 1.5;
      rSwatch.dashPattern = [4, 4];

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

    // Preview box
    var sSwatch = figma.createRectangle();
    sCard.appendChild(sSwatch);
    sSwatch.x = 19; sSwatch.y = 19;
    sSwatch.resize(302, 64); sSwatch.cornerRadius = 10;
    sSwatch.fills = [{ type: 'SOLID', color: SWATCH_INNER }];
    sSwatch.strokes = [{ type: 'SOLID', color: CARD_BORDER }]; sSwatch.strokeWeight = 1;
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

      // Token name + value
      addText(spCard, 16, 14, spKey, 12, 'Regular', TEXT_BRIGHT);
      addText(spCard, 126, 14, spVal + 'px', 12, 'Regular', TEXT_DIM);

      // Green bar visualization
      var barW = Math.max(spVal * 2, 4);
      var spBar = figma.createRectangle();
      spCard.appendChild(spBar);
      spBar.x = 16; spBar.y = 44;
      spBar.resize(Math.min(barW, 148), 8); spBar.cornerRadius = 4;
      spBar.fills = [{ type: 'SOLID', color: BAR_GREEN }];
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
      figma.ui.postMessage({
        type: 'result',
        message: '同步完成！新建 ' + result.created + ' · 更新 ' + result.updated + ' · 跳过 ' + result.skipped + (result.cleaned ? ' · 清理iOS变量 ' + result.cleaned : '') + (result.verify || ''),
      });
    }
    else if (msg.type === 'generate') {
      var colorCount2 = Object.keys(msg.data.colorTokens || {}).length;
      var dimCount2 = Object.keys(msg.data.dimTokens || {}).length;
      figma.ui.postMessage({ type: 'progress', message: '同步 ' + colorCount2 + ' 颜色 + ' + dimCount2 + ' 尺寸...' });
      var syncResult = await syncVariables(msg.data);
      figma.ui.postMessage({ type: 'progress', message: '变量已同步 (新建 ' + syncResult.created + ' · 更新 ' + syncResult.updated + ')，正在生成预览页...' });
      var frameId = await generatePreview(msg.data);
      figma.ui.postMessage({
        type: 'result',
        message: '预览页已生成！新建 ' + syncResult.created + ' · 更新 ' + syncResult.updated + ' 个变量',
      });
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: '错误: ' + (err.message || String(err)) + ' | stack: ' + (err.stack || '').slice(0, 200) });
  }
};
