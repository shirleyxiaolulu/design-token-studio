const state = {
  exportType: "json",
  published: false,
  version: "1.0.0",
  projects: [],
  activeProjectId: null,
  activeVersionId: null,
  currentSeed: null,
  currentTokens: null,
  currentExport: "",
};

const els = {
  specName: document.querySelector("#specName"),
  platform: document.querySelector("#platform"),
  defaultMode: document.querySelector("#defaultMode"),
  primaryColor: document.querySelector("#primaryColor"),
  primaryColorText: document.querySelector("#primaryColorText"),
  auxiliaryList: document.querySelector("#auxiliaryList"),
  addAuxiliaryButton: document.querySelector("#addAuxiliaryButton"),
  neutralStrategy: document.querySelector("#neutralStrategy"),
  baseFontSize: document.querySelector("#baseFontSize"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  localFont: document.querySelector("#localFont"),
  typeIntro: document.querySelector("#typeIntro"),
  fontCjkName: document.querySelector("#fontCjkName"),
  fontLatinName: document.querySelector("#fontLatinName"),
  typeScaleMeta: document.querySelector("#typeScaleMeta"),
  typeScalePreview: document.querySelector("#typeScalePreview"),
  radiusScale: document.querySelector("#radiusScale"),
  shadowStrength: document.querySelector("#shadowStrength"),
  platformMeta: document.querySelector("#platformMeta"),
  primaryMeta: document.querySelector("#primaryMeta"),
  defaultModeMeta: document.querySelector("#defaultModeMeta"),
  topProjectName: document.querySelector("#topProjectName"),
  tokenCount: document.querySelector("#tokenCount"),
  projectSelect: document.querySelector("#projectSelect"),
  newProjectButton: document.querySelector("#newProjectButton"),
  importTokenInput: document.querySelector("#importTokenInput"),
  projectTimeline: document.querySelector("#projectTimeline"),
  exportOutput: document.querySelector("#exportOutput"),
  exportCodePreview: document.querySelector("#exportCodePreview"),
  exportCodeCopyButton: document.querySelector("#exportCodeCopyButton"),
  exportMeta: document.querySelector("#exportMeta"),
  exportFormatMeta: document.querySelector("#exportFormatMeta"),
  autosaveStatus: document.querySelector("#autosaveStatus"),
  topTokenCount: document.querySelector("#topTokenCount"),
  tokenSearch: document.querySelector("#tokenSearch"),
  tocSearch: document.querySelector("#tocSearch"),
  tocCount: document.querySelector("#tocCount"),
  paletteGrid: document.querySelector("#paletteGrid"),
  paletteSummary: document.querySelector("#paletteSummary"),
  lightPreview: document.querySelector("#lightPreview"),
  darkPreview: document.querySelector("#darkPreview"),
  componentPreview: document.querySelector("#componentPreview"),
  brandTable: document.querySelector("#brandTable"),
  auxiliaryTable: document.querySelector("#auxiliaryTable"),
  functionTable: document.querySelector("#functionTable"),
  textColorTable: document.querySelector("#textColorTable"),
  backgroundTable: document.querySelector("#backgroundTable"),
  borderTable: document.querySelector("#borderTable"),
  constantColorTable: document.querySelector("#constantColorTable"),
  typeTable: document.querySelector("#typeTable"),
  radiusTable: document.querySelector("#radiusTable"),
  shadowTable: document.querySelector("#shadowTable"),
  spacingTable: document.querySelector("#spacingTable"),
  versionCount: document.querySelector("#versionCount"),
  versionStat: document.querySelector("#versionStat"),
  versionList: document.querySelector("#versionList"),
  downloadButton: document.querySelector("#downloadButton"),
  copyExportButton: document.querySelector("#copyExportButton"),
  publishButton: document.querySelector("#publishButton"),
  publishDialog: document.querySelector("#publishDialog"),
  publishVersion: document.querySelector("#publishVersion"),
  publishChangelog: document.querySelector("#publishChangelog"),
  confirmPublishButton: document.querySelector("#confirmPublishButton"),
  toast: document.querySelector("#toast"),
};

function loadProjects() {
  state.projects = DesignStorage.listProjects(currentSeed());
  state.activeProjectId = state.projects[0].id;
}

function saveProjects() {
  DesignStorage.saveProjects(state.projects);
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function currentSeed() {
  const color = DesignTokens.normalizeHex(els.primaryColorText.value || els.primaryColor.value);
  return {
    specName: els.specName.value.trim() || "未命名设计规范",
    platform: els.platform.value,
    defaultMode: els.defaultMode.value,
    primaryColor: color,
    auxiliaryColors: currentAuxiliaryColors(),
    neutralStrategy: els.neutralStrategy.value,
    baseFontSize: Number(els.baseFontSize.value),
    localFont: els.localFont.value,
    fontStack: DesignTokens.fontStacks[els.localFont.value],
    radiusScale: els.radiusScale.value,
    shadowStrength: els.shadowStrength.value,
  };
}

function currentAuxiliaryColors() {
  const rows = [...els.auxiliaryList.querySelectorAll(".auxiliary-item")];
  const colors = rows.map((row, index) => {
    const nameInput = row.querySelector("[data-aux-name]");
    const colorInput = row.querySelector("[data-aux-color]");
    const textInput = row.querySelector("[data-aux-text]");
    return {
      id: row.dataset.auxId || `auxiliary-${index + 1}`,
      name: nameInput.value.trim() || `辅助色 ${index + 1}`,
      color: DesignTokens.normalizeHex(textInput.value || colorInput.value),
    };
  });
  return DesignTokens.normalizeAuxiliaryColors(colors);
}

function renderAuxiliaryControls(colors) {
  const normalized = DesignTokens.normalizeAuxiliaryColors(colors);
  els.auxiliaryList.innerHTML = normalized.map((item) => {
    return `
      <div class="auxiliary-item" data-aux-id="${item.id}">
        <input data-aux-color type="color" value="${item.color}">
        <input data-aux-name type="text" value="${item.name}" aria-label="辅助色名称">
        <input data-aux-text type="text" value="${item.color}" aria-label="辅助色色值">
        <button class="auxiliary-delete" type="button" data-delete-auxiliary="${item.id}" aria-label="删除 ${item.name}">×</button>
      </div>
    `;
  }).join("");
}

function applySeed(seed) {
  els.specName.value = seed.specName || "未命名设计规范";
  els.platform.value = seed.platform || "ios-app";
  els.defaultMode.value = seed.defaultMode || "light";
  els.primaryColor.value = DesignTokens.normalizeHex(seed.primaryColor || "#5314FF");
  els.primaryColorText.value = DesignTokens.normalizeHex(seed.primaryColor || "#5314FF");
  renderAuxiliaryControls(seed.auxiliaryColors || DesignTokens.defaultAuxiliaryColors);
  els.neutralStrategy.value = seed.neutralStrategy || "cool";
  els.baseFontSize.value = seed.baseFontSize || 17;
  els.localFont.value = seed.localFont || "pingfang";
  els.radiusScale.value = seed.radiusScale || "soft";
  els.shadowStrength.value = seed.shadowStrength || "medium";
}

function syncDraftToProject() {
  const project = activeProject();
  if (!project || !state.currentSeed) return;
  project.name = state.currentSeed.specName;
  project.draft = state.currentSeed;
  project.updatedAt = new Date().toISOString();
  saveProjects();
}

function table(tokens, names, options = {}) {
  const { withColor = true, defaultMode = "light" } = options;
  const rows = [
    `<div class="token-row header"><span></span><span>变量</span><span>默认值</span><span>Light</span><span>Dark</span><span>说明</span></div>`,
  ];

  names.forEach((name) => {
    const token = tokens[name];
    const light = DesignTokens.tokenValue(token, "light", tokens);
    const dark = DesignTokens.tokenValue(token, "dark", tokens);
    const defaultValue = DesignTokens.tokenValue(token, defaultMode, tokens);
    const dot = withColor ? `<span class="token-dot" style="background:${defaultValue}"></span>` : `<span></span>`;
    rows.push(`
      <div class="token-row">
        ${dot}
        <span class="token-name">${name}</span>
        <span class="token-value default-value">${defaultValue}</span>
        <span class="token-value">${light}</span>
        <span class="token-value">${dark}</span>
        <span class="token-usage">${token.usage || "-"}</span>
      </div>
    `);
  });

  return rows.join("");
}

function readableTextColor(hex) {
  const raw = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#111827";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  return luminance > 0.62 ? "#111827" : "#FFFFFF";
}

function renderPalette(palette) {

  els.paletteSummary.innerHTML = [
    ["主色", palette.primary[5], "primary.5", "primary-summary"],
    ["悬停", palette.primary[4], "primary.4", ""],
    ["按下", palette.primary[6], "primary.6", ""],
    ["浅底", palette.primary[0], "primary.0", ""],
    ["深色", palette.primary[8], "primary.8", ""],
  ].map(([title, value, key, className]) => {
    const textColor = readableTextColor(value);
    const style = `background:${value};--summary-text:${textColor};--summary-muted:${textColor}`;
    return `
      <div class="summary-card ${className}" style="${style}">
        <strong>${title}</strong>
        <span>${key}</span>
        <span>${value}</span>
      </div>
    `;
  }).join("");

  els.paletteGrid.innerHTML = DesignTokens.paletteLabels.map(([key, label]) => {
    return `
      <div class="palette-row">
        <span class="palette-name">${label}</span>
        ${palette[key].map((color, index) => {
          return `<span class="swatch" title="${key}.${index} ${color}" style="background:${color}"></span>`;
        }).join("")}
      </div>
    `;
  }).join("");
}

function renderModePreview(tokens, mode, target) {
  const rows = [
    "color.brand.primary",
    "color.auxiliary.purple",
    "color.auxiliary.cyan",
    "color.text.primary",
    "color.text.secondary",
    "color.text.tertiary",
    "color.text.quaternary",
    "color.bg.page",
    "color.bg.surface",
    "color.constant.black",
    "color.constant.white",
    "color.border.default",
    "color.function.success",
    "color.function.warning",
    "color.function.danger",
  ];

  target.innerHTML = rows.filter((name) => tokens[name]).map((name) => {
    const value = DesignTokens.tokenValue(tokens[name], mode, tokens);
    const shortName = name.replace("color.", "").replace(".", "/");
    return `
      <div class="preview-cell">
        <span class="preview-chip" style="background:${value}"></span>
        <span class="preview-name">${shortName}</span>
      </div>
    `;
  }).join("");
}

function renderComponentPreview(tokens, defaultMode) {
  if (!els.componentPreview) return;
  const value = (name, fallback) => {
    const token = tokens[name];
    if (!token) return fallback;
    return DesignTokens.tokenValue(token, defaultMode, tokens) || fallback;
  };
  const primary = value("color.brand.primary", "#3366FF");
  const primaryHover = value("color.brand.primary.hover", primary);
  const primarySoft = value("color.brand.soft", value("color.bg.brand", "#EDF2FF"));
  const surface = value("color.bg.surface", "#FFFFFF");
  const page = value("color.bg.page", "#F6F7F8");
  const textPrimary = value("color.text.primary", "#111827");
  const textSecondary = value("color.text.secondary", "#5D6675");
  const textTertiary = value("color.text.tertiary", "#98A0AE");
  const border = value("color.border.default", "#DFE4EA");
  const success = value("color.function.success", "#16A36F");
  const successBg = value("color.function.success-bg", "#EAF8F1");
  const warning = value("color.function.warning", "#D98312");
  const warningBg = value("color.function.warning-bg", "#FFF6E8");
  const danger = value("color.function.danger", "#D93025");
  const dangerBg = value("color.function.danger-bg", "#FFF0EF");
  const radius = value("radius.md", "8px");
  const radiusLg = value("radius.lg", "12px");
  const shadow = value("shadow.sm", "0 2px 8px rgba(15,23,42,.08)");
  const rawFontSize = value("font.size.body", 14);
  const fontSize = typeof rawFontSize === "number" ? `${rawFontSize}px` : rawFontSize;

  els.componentPreview.innerHTML = `
    <div class="component-card component-button-card" style="--cp-primary:${primary};--cp-primary-hover:${primaryHover};--cp-soft:${primarySoft};--cp-surface:${surface};--cp-page:${page};--cp-text:${textPrimary};--cp-muted:${textSecondary};--cp-tertiary:${textTertiary};--cp-border:${border};--cp-success:${success};--cp-success-bg:${successBg};--cp-warning:${warning};--cp-warning-bg:${warningBg};--cp-danger:${danger};--cp-danger-bg:${dangerBg};--cp-radius:${radius};--cp-radius-lg:${radiusLg};--cp-shadow:${shadow};--cp-font:${fontSize}">
      <div class="component-card-title"><strong>按钮</strong><span>Button</span></div>
      <button type="button" class="demo-button primary">主按钮</button>
      <button type="button" class="demo-button secondary">次按钮</button>
    </div>
    <div class="component-card component-input-card" style="--cp-primary:${primary};--cp-soft:${primarySoft};--cp-surface:${surface};--cp-page:${page};--cp-text:${textPrimary};--cp-muted:${textSecondary};--cp-tertiary:${textTertiary};--cp-border:${border};--cp-radius:${radius};--cp-radius-lg:${radiusLg};--cp-shadow:${shadow};--cp-font:${fontSize}">
      <div class="component-card-title"><strong>输入框</strong><span>Input Focus</span></div>
      <input class="demo-field" type="text" placeholder="请输入内容">
      <input class="demo-field focused" type="text" placeholder="请输入内容">
    </div>
    <div class="component-card component-tag-card" style="--cp-primary:${primary};--cp-soft:${primarySoft};--cp-surface:${surface};--cp-page:${page};--cp-text:${textPrimary};--cp-muted:${textSecondary};--cp-border:${border};--cp-success:${success};--cp-success-bg:${successBg};--cp-warning:${warning};--cp-warning-bg:${warningBg};--cp-radius:${radius};--cp-radius-lg:${radiusLg};--cp-shadow:${shadow};--cp-font:${fontSize}">
      <div class="component-card-title"><strong>标签</strong><span>Tag</span></div>
      <div class="component-tags">
        <span class="demo-tag brand">Primary</span>
        <span class="demo-tag aux">Purple</span>
        <span class="demo-tag success">Success</span>
        <span class="demo-tag warning">Warning</span>
      </div>
    </div>
    <div class="component-card component-alert-card" style="--cp-primary:${primary};--cp-soft:${primarySoft};--cp-surface:${surface};--cp-page:${page};--cp-text:${textPrimary};--cp-muted:${textSecondary};--cp-border:${border};--cp-success:${success};--cp-success-bg:${successBg};--cp-danger:${danger};--cp-danger-bg:${dangerBg};--cp-radius:${radius};--cp-radius-lg:${radiusLg};--cp-shadow:${shadow};--cp-font:${fontSize}">
      <div class="component-card-title"><strong>提示</strong><span>Alert</span></div>
      <div class="demo-alert success"><span></span>操作成功</div>
      <div class="demo-alert danger"><span></span>出现错误，请重试</div>
    </div>
    <div class="component-card component-surface-card" style="--cp-primary:${primary};--cp-soft:${primarySoft};--cp-surface:${surface};--cp-page:${page};--cp-text:${textPrimary};--cp-muted:${textSecondary};--cp-border:${border};--cp-radius:${radius};--cp-radius-lg:${radiusLg};--cp-shadow:${shadow};--cp-font:${fontSize}">
      <div class="component-card-title"><strong>卡片</strong><span>Card</span></div>
      <div class="demo-nested-card">
        <strong>卡片标题</strong>
        <p>这里是卡片内容的示例文本，展示默认的卡片样式效果。</p>
      </div>
    </div>
  `;
}

function renderShapes(tokens, defaultMode) {
  // Radius: card grid
  const radiusNames = Object.keys(tokens).filter((name) => name.startsWith("radius."));
  els.radiusTable.innerHTML = radiusNames.map((name) => {
    const value = tokens[name].value;
    const px = parseInt(value, 10);
    return `
      <div class="radius-card">
        <div class="radius-preview" style="border-radius:${Math.min(px, 32)}px"></div>
        <div class="radius-info">
          <span class="radius-value">${value}</span>
          <span class="radius-name">${name}</span>
        </div>
      </div>
    `;
  }).join("");

  // Shadow: card grid with layer parameters
  const shadowNames = Object.keys(tokens).filter((name) => name.startsWith("shadow."));
  const shadowLabels = { "shadow.none": "None", "shadow.sm": "SM", "shadow.md": "MD", "shadow.lg": "LG", "shadow.overlay": "Overlay" };
  els.shadowTable.innerHTML = shadowNames.map((name) => {
    const token = tokens[name];
    const cssValueText = DesignTokens.tokenValue(token, defaultMode, tokens);
    const layers = token.value[defaultMode];
    const layerHtml = layers === "none"
      ? `<div class="shadow-layers"><span class="shadow-layer-item">无阴影</span></div>`
      : `<div class="shadow-layers">${layers.map((layer) => {
          return `<span class="shadow-layer-item">${layer.label} · X${layer.x} Y${layer.y} B${layer.blur} S${layer.spread} α${Math.round(layer.alpha * 100)}%</span>`;
        }).join("")}</div>`;
    return `
      <div class="shadow-card">
        <div class="shadow-preview-box" style="box-shadow:${cssValueText}"></div>
        <div class="shadow-card-info">
          <span class="shadow-card-name">${name}</span>
          <span class="shadow-card-label">${shadowLabels[name] || name.split(".")[1].toUpperCase()}</span>
        </div>
        ${layerHtml}
      </div>
    `;
  }).join("");

  // Spacing: horizontal bar list
  const spaceNames = Object.keys(tokens).filter((name) => name.startsWith("space."));
  const maxSpace = Math.max(...spaceNames.map((n) => parseInt(tokens[n].value, 10) || 0), 1);
  els.spacingTable.innerHTML = spaceNames.map((name) => {
    const value = tokens[name].value;
    const px = parseInt(value, 10) || 0;
    const pct = Math.max((px / maxSpace) * 100, 0.5);
    return `
      <div class="spacing-bar-row">
        <span class="spacing-bar-name">${name}</span>
        <div class="spacing-bar-track"><div class="spacing-bar-fill" style="width:${pct}%"></div></div>
        <span class="spacing-bar-value">${value}</span>
      </div>
    `;
  }).join("");
}

function renderTypeShowcase(seed, tokens) {
  const label = DesignTokens.fontLabels[seed.localFont];
  const bodyLineHeight = tokens["font.lineHeight.body"].value;
  const iosRows = [
    ["largeTitle", "font.size.largeTitle", 700, "大标题、首屏展示"],
    ["title1", "font.size.title1", 700, "一级标题、模块头"],
    ["title2", "font.size.title2", 600, "二级标题、卡片头"],
    ["title3", "font.size.title3", 600, "三级标题、列表组头"],
    ["body", "font.size.body", 400, "正文、段落"],
    ["subhead", "font.size.subhead", 400, "副标题、列表描述"],
    ["footnote", "font.size.footnote", 400, "脚注、次要信息"],
    ["caption", "font.size.caption", 400, "时间戳、辅助标签"],
    ["mini", "font.size.mini", 400, "角标、最小标注"],
  ];
  const webRows = [
    ["5xl", "font.size.5xl", 800, "展示标题、Hero 区"],
    ["4xl", "font.size.4xl", 700, "页面大标题"],
    ["3xl", "font.size.3xl", 700, "页面标题"],
    ["2xl", "font.size.2xl", 600, "模块标题"],
    ["xl", "font.size.xl", 600, "卡片标题"],
    ["lg", "font.size.lg", 400, "大正文、导语"],
    ["md", "font.size.md", 400, "正文默认"],
    ["sm", "font.size.sm", 400, "辅助文本"],
    ["caption", "font.size.caption", 400, "标签、图注"],
    ["mini", "font.size.mini", 400, "角标、最小标注"],
  ];

  // App+Web: unified scale, single set
  const appWebRows = [
    ["5xl", "font.size.5xl", 800, "展示标题、Hero 区（Web）"],
    ["4xl", "font.size.4xl", 700, "页面大标题（Web）"],
    ["3xl", "font.size.3xl", 700, "页面标题（Web）/ largeTitle（iOS）"],
    ["2xl", "font.size.2xl", 600, "模块标题（Web）/ title1（iOS）"],
    ["xl", "font.size.xl", 600, "卡片标题（Web）/ title2（iOS）"],
    ["lg", "font.size.lg", 400, "大正文（Web）/ title3（iOS）"],
    ["body", "font.size.body", 400, "正文（通用）"],
    ["sm", "font.size.sm", 400, "副标题（iOS subhead）"],
    ["footnote", "font.size.footnote", 400, "脚注（iOS footnote）/ 辅助"],
    ["caption", "font.size.caption", 400, "标签（iOS caption）"],
    ["mini", "font.size.mini", 400, "角标（通用最小）"],
  ];

  function renderScaleRows(rows, tokenPrefix) {
    return rows.map(([level, tokenName, weight, usage]) => {
      const token = tokens[tokenName];
      if (!token) return "";
      const size = token.value;
      const lh = Math.round(size * 1.42);
      const isLarge = size >= 22;
      const displayName = tokenName.replace("font.size.", "text.");
      return `
        <div class="type-scale-row${isLarge ? ' large' : ''}">
          <div class="type-scale-token">
            <strong>${displayName}</strong>
            <span>${size} / ${lh} · w${weight}</span>
          </div>
          <span class="type-scale-sample" style="font-size:${size}px;font-weight:${weight};line-height:1.3">${usage}</span>
          <span class="type-scale-size">${size}px</span>
        </div>
      `;
    }).join("");
  }

  els.typeIntro.textContent = label.intro;
  els.fontCjkName.textContent = label.cjk;
  els.fontLatinName.textContent = label.latin;
  els.typeScaleMeta.textContent = `BASE · 14px`;

  // Each font shows its own weight ladder (label.weights) + its own stack text
  const fontWeights = label.weights || [["Light", 300], ["Regular", 400], ["Medium", 500], ["Semibold", 600], ["Bold", 700]];
  const weightSpecimens = (glyph) => fontWeights.map(([lbl, num]) =>
    `<div class="weight-specimen"><b style="font-weight:${num}">${glyph}</b><span>${lbl}</span><em>${num}</em></div>`
  ).join("");
  const cjkW = document.getElementById("fontCjkWeights");
  const latW = document.getElementById("fontLatinWeights");
  const cjkS = document.getElementById("fontCjkStack");
  const latS = document.getElementById("fontLatinStack");
  if (cjkW) cjkW.innerHTML = weightSpecimens("字");
  if (latW) latW.innerHTML = weightSpecimens("Aa");
  if (cjkS && label.cjkStack) cjkS.textContent = label.cjkStack;
  if (latS && label.latinStack) latS.textContent = label.latinStack;

  if (seed.platform === "app-web") {
    els.typeScalePreview.innerHTML = renderScaleRows(appWebRows);
  } else if (seed.platform === "ios-app") {
    els.typeScalePreview.innerHTML = renderScaleRows(iosRows);
  } else {
    els.typeScalePreview.innerHTML = renderScaleRows(webRows);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(source) {
  return escapeHtml(source).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, (match, stringValue, keySuffix, keyword) => {
    if (stringValue) {
      return keySuffix ? `<span class="code-key">${stringValue}</span>${keySuffix}` : `<span class="code-string">${stringValue}</span>`;
    }
    if (keyword) return `<span class="code-keyword">${keyword}</span>`;
    return `<span class="code-number">${match}</span>`;
  });
}

function highlightCssLike(source) {
  return escapeHtml(source)
    .replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="code-comment">$1</span>')
    .replace(/(--[\w-]+|[\w-]+)(\s*:)/g, '<span class="code-key">$1</span>$2')
    .replace(/(#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi, '<span class="code-color">$1</span>')
    .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '<span class="code-string">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|ms|s)?|true|false|null|const|let|var|export|default|module|exports|theme|extend|colors)\b/g, '<span class="code-number">$1</span>');
}

function highlightExportCode(source, type) {
  if (type === "json" || type === "ai") return highlightJson(source);
  return highlightCssLike(source);
}

function renderExport(seed, tokens) {
  const exporters = {
    json: () => DesignExports.exportJson(seed, tokens, state.published ? state.version : "draft"),
    css: () => DesignExports.exportCss(tokens, seed.defaultMode),
    ts: () => DesignExports.exportTs(seed, tokens, state.published ? state.version : "draft"),
    tailwind: () => DesignExports.exportTailwind(tokens),
  };
  state.currentExport = exporters[state.exportType]();
  els.exportOutput.value = state.currentExport;
  if (els.exportCodePreview) {
    els.exportCodePreview.innerHTML = highlightExportCode(state.currentExport, state.exportType);
    els.exportCodePreview.dataset.language = state.exportType;
  }
  if (els.exportMeta) {
    const formatLabels = {
      json: "JSON",
      css: "CSS Variables",
      ts: "TypeScript",
      tailwind: "Tailwind Config",
    };
    const lineCount = state.currentExport ? state.currentExport.split("\n").length : 0;
    els.exportMeta.textContent = `${formatLabels[state.exportType] || state.exportType} · ${lineCount} 行`;
  }
}


function renderProjects() {
  // Left sidebar: project dropdown selector
  if (els.projectSelect) {
    els.projectSelect.innerHTML = state.projects.map((project) => {
      const selected = project.id === state.activeProjectId ? "selected" : "";
      return `<option value="${project.id}" ${selected}>${project.name}</option>`;
    }).join("");
  }

  // Right panel: project history timeline
  if (els.projectTimeline) {
    els.projectTimeline.innerHTML = state.projects.map((project) => {
      const active = project.id === state.activeProjectId ? "active" : "";
      const date = new Date(project.updatedAt).toLocaleDateString("zh-CN");
      const color = project.draft?.primaryColor || "#5314FF";
      const platNames = { "ios-app": "iOS", "web-admin": "Web", "app-web": "App+Web" };
      const platform = platNames[project.draft?.platform] || "iOS";
      return `
        <div class="timeline-item ${active}" data-project-id="${project.id}">
          <span class="timeline-color" style="background:${color}"></span>
          <div class="timeline-info">
            <strong>${project.name}</strong>
            <span>${platform} · ${project.versions.length} 版本 · ${date}</span>
          </div>
          <button class="timeline-delete" type="button" data-delete-project="${project.id}" aria-label="删除">×</button>
        </div>
      `;
    }).join("");
  }
}

function renderVersions() {
  const project = activeProject();
  const versions = project?.versions || [];
  els.versionCount.textContent = String(versions.length);
  if (els.versionStat) els.versionStat.textContent = String(versions.length);
  // "当前草稿" entry at top
  const draftActive = !state.activeVersionId ? "active" : "";
  const draftEntry = `
    <div class="version-item ${draftActive}" data-switch-version="current">
      <div>
        <strong>当前草稿</strong>
        <span>编辑中</span>
      </div>
    </div>
  `;

  const versionEntries = versions.map((version) => {
    const date = new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false });
    const isActive = state.activeVersionId === version.id ? "active" : "";
    return `
      <div class="version-item ${isActive}" data-switch-version="${version.id}">
        <div>
          <strong>v${version.version}</strong>
          <span>${date}</span>
          <p>${version.changelog || "无变更说明"}</p>
        </div>
        <button class="version-delete" type="button" data-delete-version="${version.id}" aria-label="删除版本">×</button>
      </div>
    `;
  }).join("");

  els.versionList.innerHTML = draftEntry + versionEntries;
}

// Run one render step in isolation: if it throws, log and continue so a single
// broken section/element can never blank out the whole document.
function safeRun(label, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`[render] "${label}" failed:`, e);
  }
}

function render() {
  const seed = currentSeed();
  const { palette, tokens } = DesignTokens.generateTokens(seed);
  state.currentSeed = seed;
  state.currentTokens = tokens;
  const brandColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.brand."));
  const auxiliaryColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.auxiliary."));
  const colorTokenNames = Object.keys(tokens).filter((name) => name.startsWith("color.function."));
  const textColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.text."));
  const backgroundColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.bg."));
  const borderColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.border."));
  const constantColorNames = Object.keys(tokens).filter((name) => name.startsWith("color.constant."));
  const typeNames = Object.keys(tokens).filter((name) => name.startsWith("font."));
  const platformNames = { "ios-app": "iOS App", "web-admin": "Web 后台", "app-web": "App+Web" };
  const platformName = platformNames[seed.platform] || seed.platform;
  const modeName = seed.defaultMode === "dark" ? "Dark 默认" : "Light 默认";

  document.documentElement.style.setProperty("--primary", seed.primaryColor);
  document.documentElement.style.setProperty("--primary-weak", palette.primary[0]);
  // Set --primary-rgb for rgba() usage
  var pRgb = seed.primaryColor.replace("#", "");
  var pR = parseInt(pRgb.slice(0,2), 16);
  var pG = parseInt(pRgb.slice(2,4), 16);
  var pB = parseInt(pRgb.slice(4,6), 16);
  document.documentElement.style.setProperty("--primary-rgb", pR + "," + pG + "," + pB);
  document.documentElement.style.setProperty("--local-font", seed.fontStack);
  document.body.dataset.defaultMode = seed.defaultMode;

  if (els.topProjectName) els.topProjectName.textContent = seed.specName;
  if (els.platformMeta) els.platformMeta.textContent = platformName;
  if (els.primaryMeta) els.primaryMeta.textContent = seed.primaryColor;
  if (els.defaultModeMeta) els.defaultModeMeta.textContent = modeName;
  if (els.fontSizeValue) els.fontSizeValue.textContent = seed.baseFontSize;
  if (els.tokenCount) els.tokenCount.textContent = `${Object.keys(tokens).length} tokens`;
  if (els.topTokenCount) els.topTokenCount.textContent = `${Object.keys(tokens).length}`;
  if (els.exportFormatMeta) els.exportFormatMeta.textContent = "4";
  if (els.autosaveStatus) {
    els.autosaveStatus.textContent = state.published ? `已查看 v${state.version}` : "当前草稿已自动保存";
  }
  document.querySelectorAll("[data-mode-switch]").forEach((button) => {
    button.classList.toggle("active", button.dataset.modeSwitch === seed.defaultMode);
  });
  safeRun("palette", () => renderPalette(palette));
  safeRun("modePreviewLight", () => renderModePreview(tokens, "light", els.lightPreview));
  safeRun("modePreviewDark", () => renderModePreview(tokens, "dark", els.darkPreview));
  safeRun("componentPreview", () => renderComponentPreview(tokens, seed.defaultMode));
  safeRun("brandTable", () => { if (els.brandTable) els.brandTable.innerHTML = table(tokens, brandColorNames, { defaultMode: seed.defaultMode }); });
  safeRun("auxiliaryTable", () => { if (els.auxiliaryTable) els.auxiliaryTable.innerHTML = table(tokens, auxiliaryColorNames, { defaultMode: seed.defaultMode }); });
  safeRun("functionTable", () => { if (els.functionTable) els.functionTable.innerHTML = table(tokens, colorTokenNames, { defaultMode: seed.defaultMode }); });
  safeRun("textColorTable", () => { if (els.textColorTable) els.textColorTable.innerHTML = table(tokens, textColorNames, { defaultMode: seed.defaultMode }); });
  safeRun("backgroundTable", () => { if (els.backgroundTable) els.backgroundTable.innerHTML = table(tokens, backgroundColorNames, { defaultMode: seed.defaultMode }); });
  safeRun("borderTable", () => { if (els.borderTable) els.borderTable.innerHTML = table(tokens, borderColorNames, { defaultMode: seed.defaultMode }); });
  safeRun("constantColorTable", () => { if (els.constantColorTable) els.constantColorTable.innerHTML = table(tokens, constantColorNames, { defaultMode: seed.defaultMode }); });
  // typeTable removed — type scale preview already shows all font tokens
  safeRun("shapes", () => renderShapes(tokens, seed.defaultMode));
  safeRun("motion", () => renderMotion(tokens));
  safeRun("typeShowcase", () => renderTypeShowcase(seed, tokens));
  safeRun("contrast", () => renderContrast(tokens));
  safeRun("opacity", () => renderOpacity(tokens));
  safeRun("export", () => renderExport(seed, tokens));

  safeRun("syncDraftToProject", () => syncDraftToProject());
  safeRun("projects", () => renderProjects());
  safeRun("versions", () => renderVersions());
  safeRun("customSelects", () => { if (window.CustomSelect) window.CustomSelect.refresh(); });
  try { renderAuxSuggestions(); } catch (e) { console.warn("renderAuxSuggestions error:", e); }
  try { updateA11yBadge(tokens); } catch (e) { console.warn("updateA11yBadge error:", e); }
  try { renderVersionDiff(); } catch (e) { console.warn("renderVersionDiff error:", e); }
  if (els.tokenSearch?.value) applyTokenSearch(els.tokenSearch.value);
}

// Informational only: searches for an accessible foreground color that meets
// AA (4.5:1) against the given background. Returns null if none found.
function suggestAccessibleFg(fgColor, bgColor) {
  if (typeof DesignTokens.contrastRatio !== "function") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(fgColor || "");
  if (!m) return null;
  const rgb = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const toHex = (arr) => "#" + arr.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const candidate = toHex(rgb.map((c, i) => c + (target[i] - c) * t));
      const ratio = DesignTokens.contrastRatio(candidate, bgColor);
      if (ratio >= 4.5) return { color: candidate, ratio: Math.round(ratio * 100) / 100 };
    }
  }
  return null;
}

function renderContrast(tokens) {
  const resolved = DesignTokens.resolveAllTokenValues(tokens);
  const checks = DesignTokens.checkContrastPairs(tokens, resolved);
  const grid = document.querySelector("#contrastGrid");
  const meta = document.querySelector("#contrastMeta");

  if (!grid) return;

  const passCount = checks.filter((c) => c.pass).length;
  if (meta) {
    meta.textContent = `${passCount}/${checks.length} AA 通过`;
    meta.style.color = passCount === checks.length ? "#16a34a" : "";
  }

  grid.innerHTML = checks.map((c) => {
    const modeLabel = c.mode === "light" ? "浅色" : "深色";
    const badgeClass = c.level === "AAA" ? "aaa" : c.level === "AA" ? "aa" : c.level === "AA-large" ? "aa-large" : "fail";
    let fixBtn = "";
    let suggestionHtml = "";
    if (!c.pass) {
      const s = suggestAccessibleFg(c.fgColor, c.bgColor);
      fixBtn = `<button class="contrast-fix-btn" type="button" data-contrast-fix>修复建议</button>`;
      const advice = s
        ? `当前对比度 ${c.ratio}:1，未达 AA（需 ≥4.5:1）。建议把前景文字色 <b>${c.fgColor}</b> 调整为 <b class="suggest-color">${s.color}</b>（可达 ${s.ratio}:1），或改用更深/更浅的语义背景色。`
        : `当前对比度 ${c.ratio}:1，未达 AA（需 ≥4.5:1）。建议加大文字与背景的明暗差：换用更深的文字色，或调整背景色。`;
      suggestionHtml = `<div class="contrast-suggestion">${advice}</div>`;
    }
    return `
      <div class="contrast-item">
        <div class="contrast-preview" style="background:${c.bgColor};color:${c.fgColor}">Aa</div>
        <div class="contrast-info">
          <span class="contrast-label">${c.label} · ${modeLabel}</span>
          <span class="contrast-colors">${c.fgColor} · ${c.bgColor}</span>
        </div>
        <div class="contrast-right">
          <span class="contrast-ratio">${c.ratio}:1</span>
          <span class="contrast-badge ${badgeClass}">${c.level}</span>
          ${fixBtn}
        </div>
        ${suggestionHtml}
      </div>
    `;
  }).join("");
}

function renderOpacity(tokens) {
  const container = document.querySelector("#opacityTable");
  if (!container) return;

  const opacityTokens = Object.values(tokens).filter((t) => t.name.startsWith("opacity."));
  container.innerHTML = opacityTokens.map((t) => {
    const val = typeof t.value === "number" ? t.value : parseFloat(t.value);
    const pct = Math.round(val * 100);
    return `
      <div class="opacity-card">
        <div class="opacity-preview">
          <div class="opacity-fill" style="opacity:${val}"></div>
        </div>
        <span class="opacity-name">${t.name}</span>
        <span class="opacity-value">${pct}%</span>
      </div>
    `;
  }).join("");
}

function renderMotion(tokens) {
  const container = document.querySelector("#motionTable");
  if (!container) return;

  const motionTokens = Object.values(tokens).filter((t) => t.name.startsWith("motion."));
  const durations = motionTokens.filter((t) => t.name.includes("duration"));
  const easings = motionTokens.filter((t) => t.name.includes("easing"));

  const durationHtml = durations.map((t) => {
    const ms = parseInt(t.value, 10);
    return `
      <div class="motion-card">
        <div class="motion-preview">
          <div class="motion-dot" style="animation-duration:${ms}ms"></div>
        </div>
        <span class="motion-name">${t.name}</span>
        <span class="motion-value">${t.value}</span>
        <span class="motion-usage">${t.usage}</span>
      </div>
    `;
  }).join("");

  const easingHtml = easings.map((t) => {
    return `
      <div class="motion-card">
        <div class="motion-preview">
          <div class="motion-dot" style="animation-timing-function:${t.value}"></div>
        </div>
        <span class="motion-name">${t.name}</span>
        <span class="motion-value">${t.value}</span>
        <span class="motion-usage">${t.usage}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = durationHtml + easingHtml;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function fileSafeName(name) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").toLowerCase();
}

function downloadExport() {
  const extMap = {
    json: "json",
    css: "css",
    ts: "ts",
    tailwind: "js",
  };
  const mimeMap = {
    json: "application/json;charset=utf-8",
    css: "text/css;charset=utf-8",
    ts: "text/typescript;charset=utf-8",
    tailwind: "text/javascript;charset=utf-8",
  };
  const seed = state.currentSeed || currentSeed();
  const ext = extMap[state.exportType];
  const blob = new Blob([state.currentExport || els.exportOutput.value], { type: mimeMap[state.exportType] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileSafeName(seed.specName)}-v${state.version}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`已下载 ${link.download}`);
}

async function copyExport() {
  const content = state.currentExport || els.exportOutput.value;
  if (!content) {
    showToast("没有可复制的导出内容");
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
    } else {
      const fallback = document.createElement("textarea");
      fallback.value = content;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.left = "-9999px";
      fallback.style.top = "0";
      document.body.appendChild(fallback);
      fallback.focus();
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
      window.getSelection().removeAllRanges();
    }
    showToast(state.exportType === "json" ? "已复制 JSON" : "已复制当前导出内容");
  } catch (error) {
    showToast("复制失败，请手动选中内容复制");
  }
}

function publishSnapshot() {
  state.published = true;
  const seed = state.currentSeed || currentSeed();
  const project = activeProject();
  const version = els.publishVersion.value.trim() || state.version;
  const changelog = els.publishChangelog.value.trim();
  const payload = {
    id: DesignStorage.createId("ver"),
    name: seed.specName,
    version,
    status: "published",
    defaultMode: seed.defaultMode,
    platform: seed.platform,
    seed,
    tokens: state.currentTokens,
    publishedAt: new Date().toISOString(),
    changelog,
    exports: DesignExports.createExports(seed, state.currentTokens, version),
  };
  state.version = version;
  state.activeVersionId = null;
  state.published = false;
  project.versions.unshift(payload);
  project.draft = seed;
  project.name = seed.specName;
  project.updatedAt = payload.publishedAt;
  saveProjects();
  DesignStorage.saveLastPublished(payload);
  els.publishDialog.close();
  els.publishChangelog.value = "";
  render();
  showToast(`已发布本地版本 v${version}`);
}

function switchToVersion(versionId) {
  const project = activeProject();
  if (!project) return;

  // "current" means go back to draft
  if (versionId === "current") {
    state.activeVersionId = null;
    state.published = false;
    applySeed(project.draft || currentSeed());
    showToast("已切回当前草稿");
    render();
    return;
  }

  const version = project.versions.find((item) => item.id === versionId);
  if (!version) return;

  // Save current draft before switching
  if (!state.activeVersionId) {
    project.draft = currentSeed();
    project.updatedAt = new Date().toISOString();
  }

  state.activeVersionId = versionId;
  state.version = version.version;
  state.published = true;
  applySeed(version.seed);
  showToast(`已切换到 v${version.version}（点击"当前草稿"切回）`);
  render();
}

function createProject() {
  const project = DesignStorage.createProjectDraft(currentSeed());
  project.name = `未命名规范 ${state.projects.length + 1}`;
  project.draft = {
    ...currentSeed(),
    specName: project.name,
  };
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  applySeed(project.draft);
  saveProjects();
  state.published = false;
  render();
  showToast("已创建新项目");
}

function switchProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  state.activeProjectId = project.id;
  state.published = false;
  state.version = project.versions[0]?.version || "1.0.0";
  applySeed(project.draft || project.versions[0]?.seed || currentSeed());
  render();
}

function deleteProject(projectId) {
  if (state.projects.length <= 1) {
    showToast("至少保留一个项目");
    return;
  }
  const index = state.projects.findIndex((item) => item.id === projectId);
  if (index === -1) return;
  const [removed] = state.projects.splice(index, 1);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[Math.max(0, index - 1)]?.id || state.projects[0].id;
    const project = activeProject();
    applySeed(project.draft || project.versions[0]?.seed || currentSeed());
  }
  saveProjects();
  render();
  showToast(`已删除 ${removed.name}`);
}

function importTokenFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const seed = data.seed || data;
      applySeed({
        ...currentSeed(),
        ...seed,
        specName: data.name || seed.specName || "导入的设计规范",
      });
      state.published = false;
      render();
      showToast("已导入 token JSON");
    } catch {
      showToast("导入失败：不是有效的 JSON");
    } finally {
      els.importTokenInput.value = "";
    }
  };
  reader.readAsText(file);
}

function applyTokenSearch(query) {
  const normalized = query.trim().toLowerCase();
  document.body.classList.toggle("is-searching", Boolean(normalized));
  const targets = document.querySelectorAll([
    ".token-row:not(.header)",
    ".palette-row",
    ".preview-cell",
    ".contrast-item",
    ".type-scale-row",
    ".radius-card",
    ".shadow-card",
    ".opacity-card",
    ".motion-card",
    ".spacing-bar-row",
    ".component-card",
  ].join(","));

  targets.forEach((node) => {
    const text = node.textContent.toLowerCase();
    const styleText = node.getAttribute("style") || "";
    const matched = !normalized || text.includes(normalized) || styleText.toLowerCase().includes(normalized);
    node.classList.toggle("search-hidden", !matched);
  });
}

function updateTocCount() {
  if (!els.tocCount) return;
  const visible = [...document.querySelectorAll(".toc-link")].filter((link) => !link.classList.contains("toc-hidden"));
  els.tocCount.textContent = String(visible.length);
}

function bindTocSearch() {
  if (!els.tocSearch) return;
  els.tocSearch.addEventListener("input", () => {
    const query = els.tocSearch.value.trim().toLowerCase();
    document.querySelectorAll(".toc-link").forEach((link) => {
      link.classList.toggle("toc-hidden", query && !link.textContent.toLowerCase().includes(query));
    });
    updateTocCount();
  });
  updateTocCount();
}

function bindEvents() {
  bindTocSearch();
  if (els.tokenSearch) {
    ["input", "search", "change"].forEach((eventName) => {
      els.tokenSearch.addEventListener(eventName, () => applyTokenSearch(els.tokenSearch.value));
    });
  }
  document.querySelectorAll("[data-mode-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      els.defaultMode.value = button.dataset.modeSwitch;
      state.published = false;
      render();
    });
  });
  const contrastGrid = document.querySelector("#contrastGrid");
  if (contrastGrid) {
    contrastGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-contrast-fix]");
      if (!button) return;
      const item = button.closest(".contrast-item");
      if (item) item.classList.toggle("show-suggestion");
    });
  }

  [
    els.specName,
    els.platform,
    els.defaultMode,
    els.neutralStrategy,
    els.baseFontSize,
    els.localFont,
    els.radiusScale,
    els.shadowStrength,
  ].forEach((el) => el.addEventListener("input", () => {
    state.published = false;
    render();
  }));

  // v2: naming strategy
  const namingEl = document.querySelector("#namingStrategy");
  if (namingEl) {
    namingEl.addEventListener("change", () => {
      DesignTokens.setNamingStrategy(namingEl.value);
      state.published = false;
      render();
    });
  }

  els.primaryColor.addEventListener("input", () => {
    els.primaryColorText.value = els.primaryColor.value.toUpperCase();
    state.published = false;
    render();
  });

  els.primaryColorText.addEventListener("input", () => {
    const next = DesignTokens.normalizeHex(els.primaryColorText.value);
    els.primaryColor.value = next;
    state.published = false;
    render();
  });

  els.auxiliaryList.addEventListener("input", (event) => {
    const row = event.target.closest(".auxiliary-item");
    if (!row) return;
    if (event.target.matches("[data-aux-color]")) {
      row.querySelector("[data-aux-text]").value = event.target.value.toUpperCase();
    }
    if (event.target.matches("[data-aux-text]")) {
      const next = DesignTokens.normalizeHex(event.target.value);
      event.target.value = next;
      row.querySelector("[data-aux-color]").value = next;
    }
    state.published = false;
    render();
  });

  els.auxiliaryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-auxiliary]");
    if (!button) return;
    const colors = currentAuxiliaryColors().filter((item) => item.id !== button.dataset.deleteAuxiliary);
    renderAuxiliaryControls(colors.length ? colors : DesignTokens.defaultAuxiliaryColors);
    state.published = false;
    render();
  });

  els.addAuxiliaryButton.addEventListener("click", () => {
    const colors = currentAuxiliaryColors();
    colors.push({
      id: `auxiliary-${colors.length + 1}`,
      name: `辅助色 ${colors.length + 1}`,
      color: "#8B5CF6",
    });
    renderAuxiliaryControls(colors);
    state.published = false;
    render();
  });

  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      state.exportType = button.dataset.export;
      document.querySelectorAll("[data-export]").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });

  // Left sidebar: project dropdown switch
  els.projectSelect.addEventListener("change", () => {
    switchProject(els.projectSelect.value);
  });
  els.newProjectButton.addEventListener("click", createProject);
  els.importTokenInput.addEventListener("change", () => {
    importTokenFile(els.importTokenInput.files[0]);
  });

  // Right panel: project timeline click to switch
  els.projectTimeline.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-project]");
    if (deleteButton) {
      event.stopPropagation();
      const projectId = deleteButton.dataset.deleteProject;
      const project = state.projects.find((p) => p.id === projectId);
      const label = project ? project.name : "该项目";
      if (!confirm(`确定删除「${label}」吗？该项目的所有版本记录都将丢失。`)) return;
      deleteProject(projectId);
      return;
    }
    const item = event.target.closest("[data-project-id]");
    if (item) switchProject(item.dataset.projectId);
  });
  els.versionList.addEventListener("click", (event) => {
    // Delete version with confirmation
    const deleteBtn = event.target.closest("[data-delete-version]");
    if (deleteBtn) {
      event.stopPropagation();
      const versionId = deleteBtn.dataset.deleteVersion;
      const project = activeProject();
      const version = project?.versions.find((v) => v.id === versionId);
      const label = version ? `v${version.version}` : "该版本";
      if (!confirm(`确定删除 ${label} 吗？删除后无法恢复。`)) return;
      project.versions = project.versions.filter((v) => v.id !== versionId);
      if (state.activeVersionId === versionId) {
        state.activeVersionId = null;
        state.published = false;
        applySeed(project.draft || currentSeed());
      }
      saveProjects();
      render();
      showToast(`已删除 ${label}`);
      return;
    }
    // Click container to switch
    const item = event.target.closest("[data-switch-version]");
    if (item) switchToVersion(item.dataset.switchVersion);
  });

  els.downloadButton.addEventListener("click", () => {
    downloadExport();
    const btn = els.downloadButton;
    const original = btn.textContent;
    btn.textContent = "已下载 ✓";
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
  els.copyExportButton.addEventListener("click", () => {
    copyExport();
    const btn = els.copyExportButton;
    const original = btn.textContent;
    btn.textContent = "已复制 ✓";
    setTimeout(() => { btn.textContent = original; }, 1500);
  });

  els.exportCodeCopyButton?.addEventListener("click", () => {
    copyExport();
    const icon = els.exportCodeCopyButton.querySelector("i");
    els.exportCodeCopyButton.classList.add("copied");
    if (icon) icon.className = "ri-check-line";
    setTimeout(() => {
      els.exportCodeCopyButton.classList.remove("copied");
      if (icon) icon.className = "ri-file-copy-line";
    }, 1200);
  });

  document.getElementById("copyAiPromptButton").addEventListener("click", async () => {
    const seed = currentSeed();
    const { tokens } = DesignTokens.generateTokens(seed);
    const prompt = DesignExports.exportAiPrompt(seed, tokens);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = document.getElementById("copyAiPromptButton");
    btn.textContent = "已复制 ✓";
    setTimeout(() => { btn.textContent = "复制 AI Prompt"; }, 1500);
  });

  document.getElementById("copyAiJsonButton").addEventListener("click", async () => {
    const seed = currentSeed();
    const { tokens } = DesignTokens.generateTokens(seed);
    const aiJson = DesignExports.exportAiJson(seed, tokens, state.published ? state.version : "draft");
    try {
      await navigator.clipboard.writeText(aiJson);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = aiJson;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = document.getElementById("copyAiJsonButton");
    btn.textContent = "已复制 ✓";
    setTimeout(() => { btn.textContent = "复制 AI JSON"; }, 1500);
  });

  document.getElementById("downloadAiJsonButton").addEventListener("click", () => {
    const seed = currentSeed();
    const { tokens } = DesignTokens.generateTokens(seed);
    const version = state.published ? state.version : "draft";
    const aiJson = DesignExports.exportAiJson(seed, tokens, version);
    const blob = new Blob([aiJson], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeName(seed.specName)}-ai-v${version}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`已下载 ${link.download}`);
  });

  els.publishButton.addEventListener("click", () => {
    els.publishVersion.value = state.version;
    els.publishDialog.showModal();
  });

  els.confirmPublishButton.addEventListener("click", publishSnapshot);

  // v4: Quick copy JSON button in topbar
  document.getElementById("quickCopyJsonButton").addEventListener("click", async () => {
    const seed = currentSeed();
    const { tokens } = DesignTokens.generateTokens(seed);
    const json = DesignExports.exportJson(seed, tokens, state.published ? state.version : "draft");
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = document.getElementById("quickCopyJsonButton");
    btn.textContent = "已复制 ✓";
    state.exportDirty = false;
    setTimeout(() => { btn.textContent = "复制 JSON"; }, 1500);
    showToast("JSON 已复制到剪贴板");
  });

  // v4: Share URL button
  document.getElementById("shareUrlButton").addEventListener("click", async () => {
    const seed = currentSeed();
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(seed))));
    const url = location.origin + location.pathname + "#seed=" + encoded;
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = document.getElementById("shareUrlButton");
    btn.textContent = "已复制 ✓";
    setTimeout(() => { btn.textContent = "分享链接"; }, 1500);
    showToast("分享链接已复制，发给同事即可打开相同配置");
  });

}

// v4: Load seed from URL hash if present
function loadSeedFromUrl() {
  const hash = location.hash;
  if (!hash.startsWith("#seed=")) return false;
  try {
    const encoded = hash.slice(6);
    const json = decodeURIComponent(escape(atob(encoded)));
    const seed = JSON.parse(json);
    applySeed(seed);
    history.replaceState(null, "", location.pathname);
    showToast("已从分享链接加载配置");
    return true;
  } catch (e) {
    return false;
  }
}

// v4: Generate auxiliary color suggestions based on primary color (HSL color theory)
function renderAuxSuggestions() {
  const container = document.getElementById("auxSuggestions");
  if (!container) return;
  const hex = DesignTokens.normalizeHex(els.primaryColorText.value || els.primaryColor.value);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  function hslToHex(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    const toH = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
    return "#" + toH(f(0)) + toH(f(8)) + toH(f(4));
  }

  const suggestions = [
    { label: "互补", color: hslToHex(h + 0.5, s, l) },
    { label: "类似", color: hslToHex(h + 0.083, s, l) },
    { label: "类似", color: hslToHex(h - 0.083, s, l) },
    { label: "三等分", color: hslToHex(h + 0.333, s, l) },
    { label: "三等分", color: hslToHex(h - 0.333, s, l) },
    { label: "分裂互补", color: hslToHex(h + 0.417, s, l) },
    { label: "分裂互补", color: hslToHex(h - 0.417, s, l) },
  ];

  // Filter out colors too similar to existing auxiliary colors
  const existing = currentAuxiliaryColors().map((c) => c.color.toUpperCase());
  const filtered = suggestions.filter((s) => !existing.includes(s.color.toUpperCase()));

  container.innerHTML = '<span class="aux-suggest-label">推荐</span>' +
    filtered.map((s) => `<span class="aux-suggest-dot" data-suggest-color="${s.color}" title="${s.label} ${s.color}" style="background:${s.color}"></span>`).join("");

  container.onclick = (e) => {
    const dot = e.target.closest("[data-suggest-color]");
    if (!dot) return;
    const colors = currentAuxiliaryColors();
    colors.push({ id: `auxiliary-${colors.length + 1}`, name: `辅助色 ${colors.length + 1}`, color: dot.dataset.suggestColor });
    renderAuxiliaryControls(colors);
    state.published = false;
    render();
  };
}

// v4: Update a11y badge in status strip
function updateA11yBadge(tokens) {
  const badge = document.getElementById("a11yMeta");
  if (!badge) return;
  const resolved = DesignTokens.resolveAllTokenValues(tokens);
  const checks = DesignTokens.checkContrastPairs(tokens, resolved);
  const passCount = checks.filter((c) => c.pass).length;
  const total = checks.length;
  if (passCount === total) {
    badge.textContent = `${passCount}/${total} 通过`;
    badge.className = "a11y-badge pass";
  } else {
    badge.textContent = `${passCount}/${total} 通过`;
    badge.className = "a11y-badge warn";
  }
}

// v4: Version diff — compare current draft with a version
function renderVersionDiff() {
  const project = activeProject();
  if (!project || !project.versions.length) return;
  const draft = project.draft || currentSeed();
  const lastVersion = project.versions[0];
  if (!lastVersion || !lastVersion.seed) return;

  const vSeed = lastVersion.seed;
  const diffs = [];
  if (draft.primaryColor !== vSeed.primaryColor) diffs.push("主色");
  if (draft.platform !== vSeed.platform) diffs.push("平台");
  if (draft.defaultMode !== vSeed.defaultMode) diffs.push("模式");
  if (draft.neutralStrategy !== vSeed.neutralStrategy) diffs.push("中性色");
  if (draft.radiusScale !== vSeed.radiusScale) diffs.push("圆角");
  if (draft.shadowStrength !== vSeed.shadowStrength) diffs.push("阴影");
  if (draft.baseFontSize !== vSeed.baseFontSize) diffs.push("字号");
  if (draft.localFont !== vSeed.localFont) diffs.push("字体");
  const dAux = JSON.stringify((draft.auxiliaryColors || []).map((c) => c.color).sort());
  const vAux = JSON.stringify((vSeed.auxiliaryColors || []).map((c) => c.color).sort());
  if (dAux !== vAux) diffs.push("辅助色");

  // Show diff in the "当前草稿" version item
  const draftItem = document.querySelector(".version-item:first-child");
  if (!draftItem) return;
  const existingDiff = draftItem.querySelector(".version-diff");
  if (existingDiff) existingDiff.remove();
  if (diffs.length > 0) {
    const diffEl = document.createElement("div");
    diffEl.className = "version-diff";
    diffEl.innerHTML = diffs.map((d) => `<span class="diff-tag changed">${d} 已变更</span>`).join("");
    draftItem.querySelector("div").appendChild(diffEl);
  }
}

loadProjects();
const initialProject = activeProject();
const loadedFromUrl = loadSeedFromUrl();
if (!loadedFromUrl) {
  applySeed(initialProject?.draft || currentSeed());
}
bindEvents();
render();

// =============================================
// Sidebar Tab Switching
// =============================================
document.querySelectorAll(".sidebar-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".sidebar-tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab === "config" ? "tabConfig" : "tabToc";
    document.getElementById(target).classList.add("active");
  });
});

// =============================================
// TOC Scroll Highlight
// =============================================
(function () {
  const tocLinks = document.querySelectorAll(".toc-link");
  const sections = [];
  tocLinks.forEach((link) => {
    const id = link.dataset.section;
    const el = document.getElementById(id);
    if (el) sections.push({ id, el, link });
  });

  if (sections.length === 0) return;

  const workspace = document.querySelector(".workspace");
  if (!workspace) return;

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollTop = workspace.scrollTop || window.scrollY;
      const offset = 200;
      let current = sections[0].id;
      for (const sec of sections) {
        const rect = sec.el.getBoundingClientRect();
        if (rect.top <= offset) current = sec.id;
      }
      tocLinks.forEach((link) => {
        link.classList.toggle("active", link.dataset.section === current);
      });
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, true);
  onScroll();

  // Smooth scroll on click
  tocLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const el = document.getElementById(link.dataset.section);
      if (el) {
        const top = window.scrollY + el.getBoundingClientRect().top - 92;
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
      }
    });
  });
})();
