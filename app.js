const state = {
  exportType: "json",
  published: false,
  version: "1.0.0",
  projects: [],
  activeProjectId: null,
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
  pageTitle: document.querySelector("#pageTitle"),
  platformMeta: document.querySelector("#platformMeta"),
  primaryMeta: document.querySelector("#primaryMeta"),
  defaultModeMeta: document.querySelector("#defaultModeMeta"),
  tokenCount: document.querySelector("#tokenCount"),
  projectSelect: document.querySelector("#projectSelect"),
  newProjectButton: document.querySelector("#newProjectButton"),
  importTokenInput: document.querySelector("#importTokenInput"),
  projectTimeline: document.querySelector("#projectTimeline"),
  exportOutput: document.querySelector("#exportOutput"),
  paletteGrid: document.querySelector("#paletteGrid"),
  paletteSummary: document.querySelector("#paletteSummary"),
  lightPreview: document.querySelector("#lightPreview"),
  darkPreview: document.querySelector("#darkPreview"),
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
  versionList: document.querySelector("#versionList"),
  downloadButton: document.querySelector("#downloadButton"),
  copyExportButton: document.querySelector("#copyExportButton"),
  publishButton: document.querySelector("#publishButton"),
  publishDialog: document.querySelector("#publishDialog"),
  publishVersion: document.querySelector("#publishVersion"),
  publishChangelog: document.querySelector("#publishChangelog"),
  confirmPublishButton: document.querySelector("#confirmPublishButton"),
  docVersion: document.querySelector("#docVersion"),
  docDate: document.querySelector("#docDate"),
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
  els.primaryColor.value = DesignTokens.normalizeHex(seed.primaryColor || "#3366FF");
  els.primaryColorText.value = DesignTokens.normalizeHex(seed.primaryColor || "#3366FF");
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

  // Shadow: card grid
  const shadowNames = Object.keys(tokens).filter((name) => name.startsWith("shadow."));
  const shadowLabels = { "shadow.none": "None", "shadow.sm": "SM", "shadow.md": "MD", "shadow.lg": "LG", "shadow.overlay": "Overlay" };
  els.shadowTable.innerHTML = shadowNames.map((name) => {
    const token = tokens[name];
    const cssValueText = DesignTokens.tokenValue(token, defaultMode, tokens);
    return `
      <div class="shadow-card">
        <div class="shadow-preview-box" style="box-shadow:${cssValueText}"></div>
        <div class="shadow-card-info">
          <span class="shadow-card-name">${name}</span>
          <span class="shadow-card-label">${shadowLabels[name] || name.split(".")[1].toUpperCase()}</span>
        </div>
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
  const rows = seed.platform === "ios-app"
    ? [
      ["largeTitle", "迅捷从未如此上头", "font.size.largeTitle", 700, "-0.02em", "大标题、首屏展示"],
      ["title1", "无偏移、最高能瞬间", "font.size.title1", 700, "-0.01em", "一级标题、模块头"],
      ["title2", "起范也起波澜", "font.size.title2", 600, "0em", "二级标题、卡片头"],
      ["title3", "写法规整", "font.size.title3", 600, "0em", "三级标题、列表组头"],
      ["body", "正文常用尺寸", "font.size.body", 400, "0em", "正文、段落"],
      ["subhead", "节制留白、动效轻提示", "font.size.subhead", 400, "0em", "副标题、列表描述"],
      ["footnote", "脚注、次要信息", "font.size.footnote", 400, "0.02em", "脚注、次要信息"],
      ["caption", "时间戳、辅助标签", "font.size.caption", 400, "0.04em", "时间戳、辅助标签"],
      ["mini", "角标、最小标注", "font.size.mini", 400, "0.04em", "角标、最小标注"],
    ]
    : [
      ["3xl", "迅捷从未如此上头", "font.size.3xl", 800, "-0.03em", "展示标题、Hero 区"],
      ["2xl", "无偏移、最高能瞬间", "font.size.2xl", 700, "-0.02em", "页面标题"],
      ["xl", "起范也起波澜", "font.size.xl", 700, "-0.01em", "模块标题"],
      ["lg", "写法规整", "font.size.lg", 400, "0em", "大正文、导语"],
      ["md", "辅助说明 / 表格", "font.size.md", 400, "0em", "正文默认"],
      ["xs", "Label / Caption", "font.size.xs", 500, "0.04em", "标签、辅助"],
    ];

  els.typeIntro.textContent = label.intro;
  els.fontCjkName.textContent = label.cjk;
  els.fontLatinName.textContent = label.latin;
  els.typeScaleMeta.textContent = `BASE · ${seed.baseFontSize}px`;
  els.typeScalePreview.innerHTML = rows.map(([level, sample, tokenName, weight, tracking, usage]) => {
    const size = tokens[tokenName].value;
    const lh = Math.round(size * 1.42);
    const isLarge = size >= 22;
    return `
      <div class="type-scale-row${isLarge ? ' large' : ''}">
        <div class="type-scale-token">
          <strong>${tokenName.replace("font.size.", "text.")}</strong>
          <span>${size} / ${lh} · w${weight}</span>
        </div>
        <span class="type-scale-sample" style="font-size:${size}px;font-weight:${weight};letter-spacing:${tracking};line-height:1.3">${usage || sample}</span>
        <span class="type-scale-size">${size}px</span>
      </div>
    `;
  }).join("");
}

function renderExport(seed, tokens) {
  const exporters = {
    json: () => DesignExports.exportJson(seed, tokens, state.published ? state.version : "draft"),
    css: () => DesignExports.exportCss(tokens, seed.defaultMode),
    less: () => DesignExports.exportLess(tokens),
    ts: () => DesignExports.exportTs(seed, tokens, state.published ? state.version : "draft"),
  };
  state.currentExport = exporters[state.exportType]();
  els.exportOutput.value = state.currentExport;
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
      const color = project.draft?.primaryColor || "#6533E8";
      const platform = project.draft?.platform === "ios-app" ? "iOS" : "Web";
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
  els.versionList.innerHTML = versions.length ? versions.map((version) => {
    const date = new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false });
    return `
      <div class="version-item">
        <div>
          <strong>v${version.version}</strong>
          <span>${date}</span>
          <p>${version.changelog || "无 changelog"}</p>
        </div>
        <button type="button" data-restore-version="${version.id}">恢复</button>
      </div>
    `;
  }).join("") : `<p class="empty-state">还没有发布版本</p>`;
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
  const platformName = seed.platform === "ios-app" ? "iOS App" : "Web 后台";
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

  els.pageTitle.textContent = seed.specName;
  els.platformMeta.textContent = platformName;
  els.primaryMeta.textContent = seed.primaryColor;
  els.defaultModeMeta.textContent = modeName;
  els.fontSizeValue.textContent = seed.baseFontSize;
  els.tokenCount.textContent = `${Object.keys(tokens).length} tokens`;
  els.docVersion.textContent = state.published ? `v${state.version}` : "Draft";
  els.docDate.textContent = new Date().toLocaleDateString("zh-CN");
  renderPalette(palette);
  renderModePreview(tokens, "light", els.lightPreview);
  renderModePreview(tokens, "dark", els.darkPreview);
  els.brandTable.innerHTML = table(tokens, brandColorNames, { defaultMode: seed.defaultMode });
  els.auxiliaryTable.innerHTML = table(tokens, auxiliaryColorNames, { defaultMode: seed.defaultMode });
  els.functionTable.innerHTML = table(tokens, colorTokenNames, { defaultMode: seed.defaultMode });
  els.textColorTable.innerHTML = table(tokens, textColorNames, { defaultMode: seed.defaultMode });
  els.backgroundTable.innerHTML = table(tokens, backgroundColorNames, { defaultMode: seed.defaultMode });
  els.borderTable.innerHTML = table(tokens, borderColorNames, { defaultMode: seed.defaultMode });
  els.constantColorTable.innerHTML = table(tokens, constantColorNames, { defaultMode: seed.defaultMode });
  // typeTable removed — type scale preview already shows all font tokens
  renderShapes(tokens, seed.defaultMode);
  renderTypeShowcase(seed, tokens);
  renderContrast(tokens);
  renderOpacity(tokens);
  renderExport(seed, tokens);

  syncDraftToProject();
  renderProjects();
  renderVersions();
}

function renderContrast(tokens) {
  const resolved = DesignTokens.resolveAllTokenValues(tokens);
  const checks = DesignTokens.checkContrastPairs(tokens, resolved);
  const grid = document.querySelector("#contrastGrid");
  const meta = document.querySelector("#contrastMeta");

  if (!grid) return;

  if (meta) {
    meta.textContent = `${checks.length} 组常见配对 · WCAG AA 标准 ≥ 4.5:1`;
    meta.style.color = "";
  }

  grid.innerHTML = checks.map((c) => {
    const modeLabel = c.mode === "light" ? "浅色" : "深色";
    return `
      <div class="contrast-item">
        <div class="contrast-preview" style="background:${c.bgColor};color:${c.fgColor}">Aa</div>
        <div class="contrast-info">
          <span class="contrast-label">${c.label} · ${modeLabel}</span>
          <span class="contrast-ratio">${c.ratio}:1</span>
        </div>
        <span class="contrast-badge ${c.level === 'AAA' ? 'pass' : c.level === 'AA' ? 'pass' : 'neutral'}">${c.level}</span>
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
    less: "less",
    ts: "ts",
    tailwind: "js",
    figmaPlugin: "js",
  };
  const mimeMap = {
    json: "application/json;charset=utf-8",
    css: "text/css;charset=utf-8",
    less: "text/plain;charset=utf-8",
    ts: "text/typescript;charset=utf-8",
    tailwind: "text/javascript;charset=utf-8",
    figmaPlugin: "text/javascript;charset=utf-8",
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
      els.exportOutput.focus();
      els.exportOutput.select();
      document.execCommand("copy");
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

function restoreVersion(versionId) {
  const project = activeProject();
  const version = project.versions.find((item) => item.id === versionId);
  if (!version) return;
  state.version = version.version;
  state.published = true;
  applySeed(version.seed);
  showToast(`已恢复 v${version.version}`);
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

function bindEvents() {
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
      deleteProject(deleteButton.dataset.deleteProject);
      return;
    }
    const item = event.target.closest("[data-project-id]");
    if (item) switchProject(item.dataset.projectId);
  });
  els.versionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore-version]");
    if (button) restoreVersion(button.dataset.restoreVersion);
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

  els.publishButton.addEventListener("click", () => {
    els.publishVersion.value = state.version;
    els.publishDialog.showModal();
  });

  els.confirmPublishButton.addEventListener("click", publishSnapshot);
}

loadProjects();
const initialProject = activeProject();
applySeed(initialProject?.draft || currentSeed());
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
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();
