(function () {
  const { Workflow, normalizeHex } = GovernanceModel;
  const model = new Workflow(GovernanceData);
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const button = (text, action, className = "mini-btn", disabled = false) => `<button class="${className}" data-action="${action}" ${disabled ? "disabled" : ""}>${text}</button>`;
  const colors = { unbound: new Set([0, 1, 2, 5, 6, 8, 10, 12, 20]), similar: new Set([0, 1, 2, 5, 6, 10, 11, 12, 46, 47]) };
  let step = 1;
  let detail = "color";
  let colorFilter = "all";
  const selected = { color: 0, type: 5, radius: 3, space: 5, shadow: 0 };
  const locations = {};
  let fontOpen = true;
  let fontHistoryOpen = false;
  let editingFavorites = false;
  let favorites = ["PingFang SC", "HarmonyOS Sans", "MiSans"];
  try { favorites = JSON.parse(localStorage.getItem("governance-favorites")) || favorites; } catch (_) { /* Storage can be disabled in embedded previews. */ }
  if (!Array.isArray(favorites) || favorites.length !== 3) favorites = ["PingFang SC", "HarmonyOS Sans", "MiSans"];
  let busy = "";
  let scanError = "";
  let notice = "";
  let bindView = "preflight";
  let diffTab = "modified";
  let removeStale = false;
  let confirmDelete = false;
  let newCopy = false;
  let resultDetails = false;
  let skinInput = "#F3BA65";
  let skinMessage = "";
  let compared = false;

  function valueMarkup(value) {
    const text = escape(value);
    return `<span class="diff-value">${/^#[\da-f]{6}$/i.test(String(value)) ? `<i class="color-dot" style="background:${text}"></i>` : ""}${text}</span>`;
  }
  function pendingFonts() { return model.selections().map(([source, item]) => `${source} → ${item.target}`).join(" · "); }
  function affectedFonts() { return model.selections().reduce((sum, [, item]) => sum + item.count, 0); }
  function changed() {
    confirmDelete = false;
    bindView = "preflight";
    compared = false;
    notice = "";
    render();
  }
  function go(next) {
    if (busy || !model.canStep(next)) return;
    step = next;
    notice = "";
    if (step === 5) {
      skinInput = model.primary().find(item => item.name === "primary.500")?.value || "#F3BA65";
    }
    render();
    document.querySelector(".body").scrollTo({ top: 0 });
  }
  async function perform(label, action, after = () => {}) {
    if (busy) return;
    busy = label;
    notice = "";
    render();
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      action();
      after();
    } catch (error) { notice = label === "scan" ? "" : error.message; }
    finally { busy = ""; render(); }
  }
  function renderFlow() {
    document.querySelector(".body").classList.toggle("skin-page", step === 5);
    const done = [model.scanned, model.previewCurrent(), model.previewCurrent(), model.boundCurrent(), !!model.skinHistory];
    $("flow").innerHTML = ["扫描", "整理", "预览", "绑定", "换肤"].map((label, i) => `<button class="step ${step === i + 1 ? "active" : ""} ${done[i] ? "done" : ""}" data-step="${i + 1}" aria-current="${step === i + 1 ? "step" : "false"}" ${busy || !model.canStep(i + 1) ? "disabled" : ""} title="${i === 4 && !model.boundCurrent() ? "完成当前方案的变量绑定后可换肤" : label}"><span class="num">${i + 1}</span><b>${label}</b></button>`).join("");
    document.querySelectorAll(".view").forEach((view, i) => { view.hidden = i + 1 !== step; });
    $("workflowNotice").hidden = !notice;
    $("workflowNotice").textContent = notice;
  }
  function renderScan() {
    const selection = model.selection;
    document.querySelector(".mini-pill").textContent = `${selection.frames} 个画板`;
    $("selectionCounts").innerHTML = `<b>${selection.frames} 个画板</b><span>${selection.layers} 个图层</span>`;
    document.querySelector(".scan-target strong").textContent = selection.frames ? "当前选中" : "未选中";
    $("scanBtn").disabled = !selection.frames || !!busy;
    $("scanBtn").textContent = busy === "scan" ? "正在扫描选中内容…" : scanError ? "重试扫描" : model.scanned ? "重新扫描选中内容" : "开始扫描";
    $("scanStatus").innerHTML = !selection.frames
      ? `<div class="theme-hint">请先选中画板。${button("刷新选区", "refreshSelection")}</div>`
      : scanError ? `<div class="field-error">${escape(scanError)}</div>` : "";
    $("scanResults").hidden = !model.scanned;
    $("themeHint").textContent = model.theme === "auto" ? model.scanned ? "检测为浅色 · 置信度 86%" : "扫描后检测" : `已指定${model.theme === "dark" ? "深色" : "浅色"}模式`;
    document.querySelectorAll("[data-theme-option]").forEach(el => { el.classList.toggle("active", el.dataset.themeOption === model.theme); });
    $("tabs").innerHTML = Object.entries(model.data.details).map(([key, item]) => `<button class="tab ${key === detail ? "active" : ""}" data-detail="${key}" aria-pressed="${key === detail}">${item.label}</button>`).join("");
    renderDetail();
  }
  function renderDetail() {
    if (detail === "font") { $("detailPanel").innerHTML = renderFonts(); return; }
    const data = model.data.details[detail];
    const entries = data.chips.map((raw, index) => ({ raw, index })).filter(item => detail !== "color" || colorFilter === "all" || colors[colorFilter].has(item.index));
    if (detail === "color") entries.sort((a, b) => Number(b.raw.split("×")[1]) - Number(a.raw.split("×")[1]));
    if (!entries.some(item => item.index === selected[detail])) selected[detail] = entries[0].index;
    const raw = data.chips[selected[detail]];
    const location = locations[detail + ":" + selected[detail]];
    const count = Number(raw.split("×")[1] || 1);
    const normalized = ["type", "radius", "space"].includes(detail) ? model.numericValue(detail, raw) : null;
    let options;
    if (["type", "radius"].includes(detail)) {
      const isType = detail === "type";
      options = `<div class="governance-options"><div class="governance-rule"><div><b>自动修正小数${isType ? "字号" : "圆角"}</b><span>${isType ? "15.5 / 17.5 / 19.5 → 16 / 18 / 20" : "3.5 / 7.5 / 11.5 → 4 / 8 / 12"}</span></div><span class="tag cyan">默认</span></div>
        <label class="governance-rule optional ${model.plan[detail] ? "active" : ""}"><div><b>${isType ? "统一偏离阶梯的整数字号" : "统一整数圆角阶梯"}</b><span>${isType ? "15 / 17 / 19 → 16 / 18 / 20" : "收敛至 0 / 2 / 4 / 6 / 8 / 12 / full"}</span></div><input type="checkbox" data-plan="${detail}" aria-label="${isType ? "统一整数字号" : "统一整数圆角"}" ${model.plan[detail] ? "checked" : ""}></label></div>`;
    } else {
      options = `<div class="issue-top"><div><strong>${data.issue[0]}</strong><span class="issue-summary">${detail === "shadow" ? "4 种近似参数 → 2 组样式" : data.issue[1]}</span></div><div class="plan-controls"><span class="tag">${model.plan[detail] ? "已纳入" : "保留原样"}</span>${button(model.plan[detail] ? "排除" : "恢复", "togglePlan")}</div></div>`;
    }
    $("detailPanel").innerHTML = `<div class="detail-title"><strong>${data.title}</strong><span>${data.meta}</span></div>
      ${detail === "color" ? `<div class="filter-row">${[["all", "全部 48"], ["unbound", "仅看未绑定"], ["similar", "仅看疑似重复"]].map(([key, label]) => `<button class="filter-btn ${colorFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`).join("")}</div>` : ""}
      <div class="chips">${entries.map(item => `<button class="chip ${selected[detail] === item.index ? "selected" : ""}" data-value="${item.index}" aria-pressed="${selected[detail] === item.index}">${detail === "color" ? `<i class="color-dot" style="background:${item.raw.split(" ")[0]}"></i>` : ""}${escape(item.raw)}</button>`).join("")}</div>
      <div class="locate-bar"><div class="locate-value"><b>已选择 ${escape(raw.split(" ×")[0])}</b>${normalized !== null ? `<span>草案值 ${normalized}px</span>` : ""}<span class="locate-status">${location ? `已定位 ${location}/${count}` : ""}</span></div>${button(location ? "下一个" : "定位", "locateValue", "mini-btn primary")}</div><div class="issue">${options}</div>`;
  }
  function renderFonts() {
    const entries = Object.entries(model.fonts);
    const pending = model.selections();
    const errors = model.fontErrors();
    const total = entries.reduce((sum, [, item]) => sum + item.count, 0);
    const options = [...new Set([...favorites.filter(font => model.availableFonts[font]), ...Object.keys(model.availableFonts)])];
    const history = model.fontHistory;
    return `<div class="detail-title"><strong>字体 ${entries.length} 种</strong><span>共 ${total} 处使用</span></div>
      ${history ? `<div class="font-status"><b>当前内容已替换 ${history.count} 处</b><span>${escape(history.summary)}</span>${button(fontHistoryOpen ? "收起记录" : "查看记录", "fontHistory")}${fontHistoryOpen ? "<span>已更新字体统计，不会重复加入第四步。</span>" : ""}</div>` : ""}
      <div class="issue font-issue"><div class="issue-top"><div><strong>${pending.length ? `将替换 ${pending.length} 种字体 · ${affectedFonts()} 处` : "字体使用情况"}</strong><span class="issue-summary">${pending.length ? escape(pendingFonts()) : "未设置新的替换"}</span></div>${fontOpen ? "" : button("修改", "openFonts")}</div></div>
      ${fontOpen ? `<div class="font-replace"><div class="font-replace-head"><h3>全部字体</h3>${button(editingFavorites ? "收起设置" : "常用字体设置", "favorites")}</div>
        ${editingFavorites ? `<div class="favorite-config">${favorites.map((font, index) => `<select class="select" data-favorite="${index}" aria-label="常用字体 ${index + 1}">${Object.keys(model.availableFonts).map(name => `<option ${name === font ? "selected" : ""}>${escape(name)}</option>`).join("")}</select>`).join("")}${button("保存", "saveFavorites", "mini-btn primary")}</div>` : ""}
        ${errors.length ? `<div class="field-error" role="alert">${errors.map(([source, item]) => `${escape(source)} 的目标字体 ${escape(item.target)} 或字重不可用`).join("<br>")}。请选择其他字体，或保持不变。</div>` : ""}
        <div class="font-map-list">${entries.map(([source, item]) => {
          const available = model.availableFonts[item.target] || [];
          const location = locations["font:" + source];
          return `<div class="font-map-item ${item.target ? "selected" : ""}"><div class="font-map-choice"><span class="font-map-source"><b>${escape(source)}</b><span>${item.count} 处使用</span></span><span class="tag">${item.count >= 40 ? "主要" : "少量"}</span></div>
          <div class="font-map-controls simple"><select class="select" data-font="${escape(source)}" aria-label="${escape(source)} 的目标字体"><option value="">保持不变</option>${item.target && !available.length ? `<option selected value="${escape(item.target)}">${escape(item.target)}（不可用）</option>` : ""}${options.filter(name => name !== source).map(name => `<option ${name === item.target ? "selected" : ""}>${escape(name)}</option>`).join("")}</select><button class="mini-btn" data-locate-font="${escape(source)}">定位</button></div>
          ${location ? `<div class="locate-status">已定位 ${location}/${item.count}</div>` : ""}
          ${item.target && available.length ? `<div class="weight-map"><div class="weight-auto-row"><label><input type="checkbox" data-auto="${escape(source)}" ${item.weight === "auto" ? "checked" : ""}>自动匹配字重</label><span>${item.weight === "auto" ? "默认" : "已手动设置"}</span></div><div class="weight-map-head"><span>原字重及使用数量</span><span>替换后字重</span></div>${item.weights.map(([style, count]) => `<div class="weight-map-row"><span><b>${style}</b> · ${count} 处</span><select class="select" aria-label="${escape(source)} ${style} 的替换字重" data-weight-source="${escape(source)}" data-weight="${style}">${available.map(target => `<option ${item.weightMap[style] === target ? "selected" : ""}>${target}</option>`).join("")}</select></div>`).join("")}</div>` : ""}</div>`;
        }).join("")}</div>
        ${pending.length ? `<div class="font-status"><b>将替换 ${pending.length} 种字体，共 ${affectedFonts()} 处</b><span>${escape(pendingFonts())}</span><span>不替换当前内容，可以在第 4 步绑定变量时一起创建副本。</span></div><div class="actions">${button("完成", "finishFonts", "mini-btn primary")}${button("替换当前选中内容", "replaceFonts", "mini-btn", !!errors.length || !model.scanned)}</div>` : button("收起", "finishFonts")}</div>` : ""}`;
  }
  function renderDraft() {
    const groups = model.draft();
    $("draftCount").textContent = `${model.tokens().length} 个 token`;
    $("planSummary").innerHTML = `<span><b>${model.variableTokens().length}</b>变量</span><span><b>${groups.find(group => group.title === "阴影样式").rows.length}</b>阴影样式</span><span><b>${affectedFonts()}</b>字体替换</span>`;
    $("tokenReview").innerHTML = groups.map(group => `<section class="token-section"><div class="token-section-head"><b>${group.title}</b><span>${group.rows.length}</span></div>${group.rows.map(item => `<div class="token-row"><span class="token-swatch ${item.type === "color" ? "" : "text"}" ${item.type === "color" ? `style="background:${item.value}"` : ""}>${item.type === "color" ? "" : "Aa"}</span><span class="token-name" title="${escape(item.name)}">${escape(item.name)}</span><span class="token-value">${escape(item.value)}</span></div>`).join("")}</section>`).join("");
    $("generatePreviewBtn").disabled = !!busy || !model.scanned || !!model.fontErrors().length;
    $("generatePreviewBtn").textContent = busy === "preview" ? "正在更新预览…" : model.preview ? "更新预览页" : "生成预览页";
    $("draftWarning").hidden = !model.fontErrors().length;
  }
  function renderPreview() {
    const preview = model.preview;
    if (!preview) { $("previewPanel").innerHTML = ""; return; }
    const current = model.previewCurrent();
    $("previewThemeTag").textContent = preview.theme === "dark" ? "深色模式" : "浅色模式";
    $("previewPanel").innerHTML = `<div class="preview-metrics"><div><b>${preview.groups.flatMap(group => group.rows).length}</b><span>tokens</span></div><div><b>${preview.groups.length}</b><span>分组</span></div><div><b>${preview.layers}</b><span>图层</span></div></div>
      <div class="preview-state"><i>${current ? "✓" : "!"}</i><div><b>${current ? "预览页已生成" : "方案已变化，预览待更新"}</b><span>${current ? "已保留同一个预览页" : "更新后再绑定变量"}</span></div>${button("定位", "locatePreview", "mini-btn", !current)}</div>${current ? "" : button(busy === "preview" ? "正在更新…" : "更新预览页", "preview", "main-btn", !!model.fontErrors().length)}`;
    $("openPreflightBtn").disabled = !current || !!busy || !!model.fontErrors().length;
    $("openPreflightBtn").textContent = model.boundCurrent() ? "查看绑定结果" : model.bound ? "检查并更新" : "检查并绑定";
  }
  function bindingRows() {
    const p = model.plan;
    const fontCount = model.fontChangeCount(newCopy || !model.bound);
    return [[newCopy || !model.bound ? "新建绑定副本页" : "更新已有副本", model.bound && !newCopy ? model.bound.id : "3 个画板 · 原稿不变"],
      [fontCount ? "应用字体调整" : model.fontHistory || model.bound ? "保留已处理字体" : "保留原字体", fontCount ? `${fontCount} 处` : "不重复执行"],
      [model.bound && !newCopy ? "沿用副本组件母版" : "复制所用本地组件母版", "4 个 · 独立母版"], ["外部组件保持关联", "7 个实例"],
      [p.color ? "绑定颜色变量" : "保留原颜色绑定", p.color ? "填充 23 · 描边 9" : "已排除"],
      ["绑定字号变量", p.type ? "整数阶梯已统一" : "只修正小数"],
      ["绑定圆角变量", p.radius ? "整数阶梯已统一" : "只修正小数"],
      [p.space ? "整理并绑定间距" : "保留原间距", p.space ? "28 处" : "已排除"],
      ["同步阴影样式", `${model.draft().find(group => group.title === "阴影样式").rows.length} 组 · ${p.shadow ? "已合并近似项" : "保留原参数"}`],
      ["本次使用变量", `${model.variableTokens().length} 个变量`]].map(([label, meta]) => `<div class="check"><i>·</i><b>${label}</b><span class="tag">${meta}</span></div>`).join("");
  }
  function renderDiff(diff) {
    const labels = { added: "新增", modified: "修改", stale: removeStale ? "删除" : "保留旧变量", unchanged: "不变" };
    return `<div class="change-grid">${Object.keys(labels).map(key => `<button class="change-stat ${diffTab === key ? "active" : ""}" data-diff="${key}" aria-pressed="${diffTab === key}"><b>${diff[key].length}</b><span>${labels[key]}</span></button>`).join("")}</div>
      <div class="diff-list" aria-label="${labels[diffTab]}变量明细">${diff[diffTab].length ? diff[diffTab].map(item => `<div class="diff-row"><b>${escape(item.name)}</b><div>${diffTab === "modified" ? `${valueMarkup(item.before)}<span>→</span>` : ""}${valueMarkup(item.value)}</div></div>`).join("") : "无此类变更"}</div>`;
  }
  function resultMarkup() {
    const result = model.bound;
    return `<div class="result-summary"><span><b>${result.expectedBindings - result.failed}</b>处绑定</span><span class="warn"><b>${result.skipped}</b>处保留</span><span class="bad"><b>${result.failed}</b>处失败</span></div>
      <div class="compare-list"><div class="compare-row"><span>颜色绑定</span><b>${result.plan.color ? 32 : 0} 处</b></div><div class="compare-row"><span>间距整理</span><b>${result.plan.space ? "28 处" : "原样保留"}</b></div><div class="compare-row"><span>阴影样式</span><b>${result.shadowCount} 组</b></div><div class="compare-row"><span>字体替换</span><b>${result.changedFonts} 处</b></div></div>`;
  }
  function renderBind() {
    if (!model.preview) { $("bindPanel").innerHTML = ""; return; }
    if (!model.previewCurrent()) {
      $("bindPanel").innerHTML = `<div class="theme-hint">方案已更新，请先更新预览页。${model.bound ? "已有副本保持不变。" : ""}</div>${button("更新预览页", "preview", "main-btn", !!model.fontErrors().length)}`;
      return;
    }
    if (model.boundCurrent() && bindView === "result") {
      const result = model.bound;
      $("bindPanel").innerHTML = `<div class="card"><div class="card-head"><h2>绑定结果</h2><span class="tag ${result.failed ? "amber" : "success"}">${result.failed ? "部分完成" : "全部完成"}</span></div><div class="card-body"><div class="data-note">${result.id} · ${result.first ? "副本已创建" : "副本已更新"} · 原稿不变</div>${resultMarkup()}
        <div class="bind-note safe">${result.diff.stale.length} 个旧变量已${result.removeStale ? "删除（仅副本内）" : "保留"}。</div>
        <div class="actions">${result.failed ? button(busy === "retry" ? "正在重试…" : "仅重试失败项", "retry", "mini-btn primary") : ""}${button(resultDetails ? "收起详情" : "查看详细结果", "resultDetails")}${button("定位绑定副本", "locateCopy")}</div>
        ${resultDetails ? `<div class="exception-list"><div class="exception-row"><div><b>图片 / 视频填充 · 6 处</b><span>原样保留</span></div>${button("定位", "locateException")}</div><div class="exception-row"><div><b>颜色 · ${result.plan.color ? 3 : 35} 处保留</b><span>${result.plan.color ? "没有相同色值的变量" : "已排除颜色整理"}</span></div>${button("定位", "locateException")}</div>${!result.plan.space ? `<div class="exception-row"><div><b>间距 · 28 处保留</b><span>已排除间距整理</span></div>${button("定位", "locateException")}</div>` : ""}<div class="exception-row"><div><b>锁定图层 · ${result.failed ? "1 处失败" : "已重试成功"}</b><span>${result.failed ? "解锁后可单独重试" : "变量绑定已补齐"}</span></div>${button("定位", "locateException")}</div></div>` : ""}</div></div>
        <div class="step-actions">${button("检查并更新", "reviewBind", "ghost-btn")}${button("进入一键换肤", "skin", "main-btn")}</div>`;
      return;
    }
    const diff = model.diff();
    if (!diff.stale.length) { removeStale = false; confirmDelete = false; }
    $("bindPanel").innerHTML = `<div class="card"><div class="card-head"><h2>绑定变量</h2><span class="tag">${busy === "bind" ? "执行中" : "执行前确认"}</span></div><div class="card-body">
      ${model.bound ? `<div class="segmented two"><button data-copy="update" class="${newCopy ? "" : "active"}">更新已有副本</button><button data-copy="new" class="${newCopy ? "active" : ""}">新建另一份副本</button></div><div class="theme-hint">${newCopy ? "将新增独立副本，已有副本保留。" : `更新 ${model.bound.id}，不重复创建画板和母版。`}</div>` : ""}
      ${renderDiff(diff)}<div class="data-note">变更仅作用于副本变量库；${diff.external.length} 个非本工具变量不作修改。</div><div class="check-list">${bindingRows()}</div>
      ${diff.stale.length ? `<div class="stale-choice"><div><b>发现 ${diff.stale.length} 个旧变量</b><span>默认保留</span></div><div class="segmented two compact"><button data-stale="keep" class="${removeStale ? "" : "active"}">保留</button><button data-stale="delete" class="${removeStale ? "active" : ""}">删除</button></div></div>` : ""}
      ${confirmDelete ? `<div class="bind-confirm"><b>确认删除副本中的 ${diff.stale.length} 个旧变量？</b><div class="delete-names">${diff.stale.map(item => `<span>${escape(item.name)}</span>`).join("")}</div><span>仅处理本工具管理的变量，原稿不变。</span><div class="actions">${button("取消", "cancelDelete")}${button("确认删除并执行", "confirmBind", "mini-btn danger")}</div></div>` : ""}
      </div></div>${confirmDelete ? "" : button(busy === "bind" ? "正在绑定…" : model.bound && !newCopy ? "更新已有副本" : "开始绑定到副本", "bind", "main-btn", !!model.fontErrors().length)}`;
  }
  function renderSkin(resetInput = true) {
    if (!model.bound) return;
    const hex = normalizeHex(skinInput);
    $("skinError").hidden = !!hex;
    $("skinError").textContent = hex ? "" : "请输入有效 HEX 色值，例如 #F3BA65。";
    $("skinHex").setAttribute("aria-invalid", String(!hex));
    if (resetInput) $("skinHex").value = skinInput;
    if (hex) $("skinColorPicker").value = hex;
    const palette = hex ? model.palette(hex) : model.primary();
    $("skinImpact").innerHTML = palette.map(item => `<div class="impact-row"><span>${escape(item.name)}</span><span>${escape(item.value)}</span></div>`).join("");
    $("skinScopeNote").textContent = `${model.bound.id} · ${palette.length} 个主色变量 · 原稿与功能色不变`;
    $("skinStatus").innerHTML = skinMessage ? `<div class="skin-status" role="status">${escape(skinMessage)}</div>` : "";
    $("applySkinBtn").disabled = !hex || !!busy || !model.boundCurrent();
    $("applySkinBtn").textContent = busy === "skin" ? "正在更新主色…" : "应用换主色到变量副本";
    $("restoreSkinBtn").hidden = !model.skinHistory;
    $("restoreSkinBtn").disabled = !!busy;
    $("rescanBtn").textContent = busy === "compare" ? "正在重新扫描…" : "重新扫描并对比";
    $("rescanCompare").innerHTML = compared ? `<h3>最新扫描结果</h3>${resultMarkup()}` : "";
  }
  function render() {
    document.querySelectorAll(".view button, .view input, .view select").forEach(el => { el.disabled = false; });
    renderFlow(); renderScan(); renderDraft(); renderPreview(); renderBind(); renderSkin();
    if (busy) document.querySelectorAll(".view button, .view input, .view select, #prototypeScenario").forEach(el => { el.disabled = true; });
    else $("prototypeScenario").disabled = false;
  }
  async function makePreview() {
    await perform("preview", () => model.generatePreview(), () => { step = 3; bindView = model.boundCurrent() ? "result" : "preflight"; });
    document.querySelector(".body").scrollTo({ top: 0 });
  }
  async function executeBind() {
    const options = { removeStale, newCopy };
    await perform("bind", () => model.bind(options), () => {
      bindView = "result"; confirmDelete = false; newCopy = false; compared = false;
      skinInput = model.primary().find(item => item.name === "primary.500").value;
      skinMessage = "";
    });
    document.querySelector(".body").scrollTo({ top: 0 });
  }
  async function action(name) {
    if (busy) return;
    switch (name) {
      case "refreshSelection": model.selection = { frames: 3, layers: 160 }; $("prototypeScenario").value = "normal"; render(); break;
      case "togglePlan": model.setPlan(detail, !model.plan[detail]); changed(); break;
      case "locateValue": {
        const key = detail + ":" + selected[detail];
        const count = Number(model.data.details[detail].chips[selected[detail]].split("×")[1] || 1);
        locations[key] = (locations[key] || 0) % count + 1; renderDetail(); break;
      }
      case "openFonts": fontOpen = true; renderDetail(); break;
      case "fontHistory": fontHistoryOpen = !fontHistoryOpen; renderDetail(); break;
      case "favorites": editingFavorites = !editingFavorites; renderDetail(); break;
      case "saveFavorites":
        favorites = [...document.querySelectorAll("[data-favorite]")].map(el => el.value);
        try { localStorage.setItem("governance-favorites", JSON.stringify(favorites)); } catch (_) { /* Keep session preferences when storage is unavailable. */ }
        editingFavorites = false; renderDetail(); break;
      case "finishFonts": fontOpen = false; renderDetail(); break;
      case "replaceFonts":
        await perform("fonts", () => model.replaceFonts(), () => { fontOpen = false; bindView = "preflight"; compared = false; }); break;
      case "preview": await makePreview(); break;
      case "locatePreview": notice = "已定位预览页"; renderFlow(); break;
      case "locateCopy": notice = `已定位 ${model.bound.id}`; renderFlow(); break;
      case "locateException": notice = "已定位对应图层"; renderFlow(); break;
      case "reviewBind": bindView = "preflight"; newCopy = false; removeStale = false; renderBind(); break;
      case "bind":
        if (removeStale && model.diff().stale.length) { confirmDelete = true; renderBind(); }
        else await executeBind(); break;
      case "cancelDelete": confirmDelete = false; renderBind(); break;
      case "confirmBind": await executeBind(); break;
      case "retry": await perform("retry", () => model.retryBinding()); break;
      case "resultDetails": resultDetails = !resultDetails; renderBind(); break;
      case "skin": go(5); break;
    }
  }
  document.querySelector(".body").addEventListener("click", async event => {
    const el = event.target.closest("button");
    if (!el || el.disabled || busy) return;
    if (el.dataset.step) return go(Number(el.dataset.step));
    if (el.dataset.next) return go(Number(el.dataset.next));
    if (el.dataset.detail) { detail = el.dataset.detail; if (detail === "font") fontOpen = true; return renderScan(); }
    if (el.dataset.filter) { colorFilter = el.dataset.filter; return renderDetail(); }
    if (el.dataset.value !== undefined) { selected[detail] = Number(el.dataset.value); return renderDetail(); }
    if (el.dataset.themeOption) { model.setTheme(el.dataset.themeOption); return changed(); }
    if (el.dataset.action) return action(el.dataset.action);
    if (el.dataset.locateFont) {
      const key = "font:" + el.dataset.locateFont;
      locations[key] = (locations[key] || 0) % model.fonts[el.dataset.locateFont].count + 1;
      return renderDetail();
    }
    if (el.dataset.diff) { diffTab = el.dataset.diff; return renderBind(); }
    if (el.dataset.copy) { newCopy = el.dataset.copy === "new"; confirmDelete = false; return renderBind(); }
    if (el.dataset.stale) { removeStale = el.dataset.stale === "delete"; diffTab = "stale"; confirmDelete = false; return renderBind(); }
    if (el.dataset.color) { skinInput = el.dataset.color; return renderSkin(); }
    if (el.id === "scanBtn") {
      scanError = "";
      await perform("scan", () => {
        try { model.scan(); } catch (error) { scanError = error.message; throw error; }
      }, () => { bindView = "preflight"; compared = false; });
      if (model.scanned) $("scanResults").scrollIntoView({ block: "start" });
    }
    if (el.id === "generatePreviewBtn") await makePreview();
    if (el.id === "editTokenBtn") go(2);
    if (el.id === "openPreflightBtn") { bindView = model.boundCurrent() ? "result" : "preflight"; go(4); }
    if (el.id === "applySkinBtn") {
      const submitted = skinInput;
      await perform("skin", () => model.applySkin(submitted), () => { skinInput = normalizeHex(submitted); skinMessage = `已应用 ${skinInput}，${model.primary().length} 个主色变量已更新。`; compared = false; });
    }
    if (el.id === "restoreSkinBtn") {
      model.restoreSkin(); skinInput = model.primary().find(item => item.name === "primary.500").value;
      skinMessage = "已恢复换肤前的完整主色色阶。"; compared = false; render();
    }
    if (el.id === "rescanBtn") await perform("compare", () => { compared = true; });
  });
  document.querySelector(".body").addEventListener("change", event => {
    const el = event.target;
    if (busy) return;
    if (el.dataset.plan) { model.setPlan(el.dataset.plan, el.checked); return changed(); }
    if (el.dataset.font) { model.setFont(el.dataset.font, el.value); return changed(); }
    if (el.dataset.auto) {
      if (el.checked) model.autoWeights(model.fonts[el.dataset.auto]);
      else model.fonts[el.dataset.auto].weight = "map";
      model.touch(); return changed();
    }
    if (el.dataset.weightSource) { model.setWeight(el.dataset.weightSource, el.dataset.weight, el.value); changed(); }
  });
  $("skinHex").addEventListener("input", event => { skinInput = event.target.value; renderSkin(false); });
  $("skinHex").addEventListener("blur", () => { if (normalizeHex(skinInput)) { skinInput = normalizeHex(skinInput); renderSkin(); } });
  $("skinColorPicker").addEventListener("input", event => { skinInput = normalizeHex(event.target.value); renderSkin(); });
  $("prototypeScenario").addEventListener("change", event => {
    const scenario = event.target.value;
    model.availableFonts = JSON.parse(JSON.stringify(GovernanceData.availableFonts));
    if (scenario === "font") {
      const source = model.fonts["SF Pro"] ? "SF Pro" : Object.keys(model.fonts).find(name => name !== "HarmonyOS Sans");
      model.setFont(source, "HarmonyOS Sans");
      delete model.availableFonts["HarmonyOS Sans"];
      detail = "font"; fontOpen = true;
    }
    model.selection = scenario === "empty" ? { frames: 0, layers: 0 } : { frames: 3, layers: 160 };
    model.failNextScan = scenario === "error";
    if (scenario !== "font") model.scanned = false;
    model.touch(); scanError = ""; step = 1; changed();
  });
  render();
})();
