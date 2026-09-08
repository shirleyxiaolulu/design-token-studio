(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const nearest = (value, scale) => scale.reduce((best, n) => Math.abs(n - value) <= Math.abs(best - value) ? n : best);
  const weightValue = name => ({ Light: 300, Regular: 400, Medium: 500, Semibold: 600, Bold: 700 }[name] || 400);
  function normalizeHex(value) {
    const raw = String(value).trim().replace(/^#/, "");
    if (/^[\da-f]{6}$/i.test(raw)) return "#" + raw.toUpperCase();
    if (/^[\da-f]{3}$/i.test(raw)) return "#" + [...raw].map(c => c + c).join("").toUpperCase();
    return null;
  }
  function mix(hex, target, amount) {
    const channels = [1, 3, 5].map(i => {
      const a = parseInt(hex.slice(i, i + 2), 16);
      const b = parseInt(target.slice(i, i + 2), 16);
      return Math.round(a + (b - a) * amount).toString(16).padStart(2, "0");
    });
    return "#" + channels.join("").toUpperCase();
  }
  class Workflow {
    constructor(data) {
      this.data = copy(data);
      this.fonts = copy(data.fontMappings);
      this.fontRoles = copy(data.tokenReview.find(group => group.title === "字体").rows);
      this.availableFonts = copy(data.availableFonts);
      this.plan = { color: true, space: true, shadow: true, type: false, radius: false };
      this.theme = "auto";
      this.revision = 0;
      this.scanned = false;
      this.selection = { frames: 3, layers: 160 };
      this.preview = null;
      this.bound = null;
      this.copyCount = 0;
      this.fontHistory = null;
      this.skinHistory = null;
      this.failNextScan = false;
      const initial = this.variableTokens();
      this.originalVariables = initial.slice(0, 8).map((token, i) => ({ ...copy(token), managed: true,
        value: i < 6 ? (token.type === "color" ? "#112233" : "旧值") : token.value }));
      this.originalVariables.push(
        { name: "legacy.brand", value: "#AA6633", type: "color", managed: true },
        { name: "legacy.radius", value: 6, type: "number", managed: true },
        { name: "team.external", value: "#ABCDEF", type: "color", managed: false }
      );
    }
    touch() { this.revision += 1; }
    scan() {
      this.scanned = false;
      if (!this.selection.frames) throw new Error("请先在 Figma 中选中画板。");
      if (this.failNextScan) {
        this.failNextScan = false;
        this.scanned = false;
        throw new Error("扫描失败，未修改设计稿。请重试。");
      }
      this.scanned = true;
      this.touch();
    }
    setPlan(key, value) {
      if (this.plan[key] !== value) { this.plan[key] = value; this.touch(); }
    }
    setTheme(value) {
      if (this.theme !== value) { this.theme = value; this.touch(); }
    }
    selections() { return Object.entries(this.fonts).filter(([, item]) => item.target); }
    fontErrors() {
      return this.selections().filter(([, item]) => !this.availableFonts[item.target] ||
        item.weights.some(([style]) => !this.availableFonts[item.target].includes(item.weightMap[style])));
    }
    autoWeights(item) {
      item.weight = "auto";
      const styles = this.availableFonts[item.target] || [];
      item.weights.forEach(([name]) => {
        item.weightMap[name] = [...styles].sort((a, b) => Math.abs(weightValue(a) - weightValue(name)) - Math.abs(weightValue(b) - weightValue(name)) || weightValue(b) - weightValue(a))[0] || "";
      });
    }
    setFont(source, target) {
      const item = this.fonts[source];
      if (!item || item.target === target) return;
      item.target = target;
      if (target) this.autoWeights(item);
      this.touch();
    }
    setWeight(source, from, target) {
      this.fonts[source].weightMap[from] = target;
      this.fonts[source].weight = "map";
      this.touch();
    }
    replaceFonts() {
      if (!this.scanned || !this.selection.frames) throw new Error("请先扫描选中内容。");
      if (this.fontErrors().length) throw new Error("目标字体或字重不可用，请重新选择。");
      const selections = this.selections();
      if (!selections.length) return false;
      const next = {};
      // Transform the original usage snapshot once, so A -> B and B -> C never cascade.
      Object.entries(this.fonts).forEach(([source, item]) => {
        const target = item.target || source;
        next[target] ||= { target: "", weight: "auto", count: 0, weights: [], weightMap: {} };
        next[target].count += item.count;
        item.weights.forEach(([style, count]) => {
          const targetStyle = item.target ? item.weightMap[style] : style;
          const existing = next[target].weights.find(([name]) => name === targetStyle);
          if (existing) existing[1] += count;
          else next[target].weights.push([targetStyle, count]);
          next[target].weightMap[targetStyle] = targetStyle;
        });
      });
      this.fontRoles = this.fontRoles.map(([name, value, marker]) => [name, this.fonts[value]?.target || value, marker]);
      this.fontHistory = { summary: selections.map(([source, item]) => source + " → " + item.target).join(" · "),
        count: selections.reduce((sum, [, item]) => sum + item.count, 0) };
      this.fonts = next;
      this.touch();
      return true;
    }
    numericValue(key, raw) {
      let value = Math.round(Number(raw));
      if (key === "type" && this.plan.type && [15, 17, 19].includes(value)) value += 1;
      if (key === "radius" && this.plan.radius && value !== 999) value = nearest(value, [0, 2, 4, 6, 8, 12]);
      if (key === "space" && this.plan.space) value = Math.max(4, Math.round(value / 4) * 4);
      return value;
    }
    draft() {
      const scannedColors = this.data.details.color.chips.map(value => value.split(" ")[0]);
      const usedColors = new Set();
      const groups = this.data.tokenReview.slice(0, 4).map(group => ({ title: group.title,
        rows: group.rows.filter(([, value]) => scannedColors.includes(value)).map(([name, value]) => {
          usedColors.add(value);
          return { name, value, type: "color" };
        }) }));
      groups.push({ title: "其他颜色", rows: scannedColors.filter(value => !usedColors.has(value)).map(value => ({ name: value === "#111928" && this.plan.color ? "color/text/primary" : "color." + value.slice(1).toLowerCase(), value, type: "color" })) });
      groups.push({ title: "字体", rows: this.fontRoles.map(([name, value]) => ({ name, value: this.fonts[value]?.target || value, type: "string" })) });
      for (const [key, title, prefix] of [["type", "字号", "font.size"], ["radius", "圆角", "radius"], ["space", "间距", "space"]]) {
        const values = [...new Set(this.data.details[key].chips.map(raw => this.numericValue(key, raw)))].sort((a, b) => a - b);
        groups.push({ title, rows: values.map(value => ({ name: prefix + "." + (value === 999 ? "full" : value), value, type: "number" })) });
      }
      const shadows = this.data.details.shadow.chips;
      const shadowValues = [...new Set(shadows.map((value, index) => this.plan.shadow && [1, 3].includes(index) ? shadows[index - 1] : value))];
      groups.push({ title: "阴影样式", rows: shadowValues.map((value, index) => ({ name: "shadow." + (index + 1), value, type: "effect" })) });
      return groups.filter(group => group.rows.length);
    }
    tokens() { return this.draft().flatMap(group => group.rows); }
    variableTokens() { return this.tokens().filter(token => token.type !== "effect"); }
    previewCurrent() { return this.scanned && this.preview?.revision === this.revision; }
    boundCurrent() { return this.scanned && this.bound?.revision === this.revision; }
    canStep(step) {
      return step === 1 || (this.scanned && (step === 2 || step === 3 && !!this.preview || step === 4 && !!this.preview || step === 5 && this.boundCurrent()));
    }
    generatePreview() {
      if (!this.scanned) throw new Error("请先完成扫描。");
      if (this.fontErrors().length) throw new Error("请先处理不可用字体。");
      this.preview = { id: this.preview?.id || "preview-1", revision: this.revision, groups: copy(this.draft()), theme: this.theme, layers: this.selection.layers };
    }
    diff() {
      const previous = this.bound?.variables || this.originalVariables;
      const current = this.variableTokens();
      const oldByName = new Map(previous.filter(item => item.managed).map(item => [item.name, item]));
      const names = new Set(current.map(item => item.name));
      const result = { added: [], modified: [], unchanged: [], stale: [], external: previous.filter(item => !item.managed) };
      current.forEach(item => {
        const before = oldByName.get(item.name);
        if (!before) result.added.push(copy(item));
        else if (before.value !== item.value || before.type !== item.type) result.modified.push({ ...copy(item), before: before.value });
        else result.unchanged.push(copy(item));
      });
      result.stale = previous.filter(item => item.managed && !names.has(item.name)).map(copy);
      return result;
    }
    fontPlan() {
      return Object.fromEntries(this.selections().map(([source, item]) => [source, { target: item.target, weights: copy(item.weightMap), count: item.count }]));
    }
    fontChangeCount(newCopy = false) {
      const current = this.fontPlan();
      const previous = !newCopy && this.bound ? this.bound.fontPlan : {};
      return [...new Set([...Object.keys(current), ...Object.keys(previous)])].reduce((sum, source) => {
        if (JSON.stringify(current[source]) === JSON.stringify(previous[source])) return sum;
        return sum + (current[source]?.count || previous[source]?.count || 0);
      }, 0);
    }
    bind({ removeStale = false, newCopy = false } = {}) {
      if (!this.previewCurrent()) throw new Error("方案已变化，请先更新预览页。");
      if (this.fontErrors().length) throw new Error("请先处理不可用字体。");
      const diff = this.diff();
      const first = !this.bound || newCopy;
      const previousId = this.bound?.id;
      const failed = first ? 1 : this.bound.failed;
      const previousVariables = this.bound?.variables || this.originalVariables;
      const names = new Set(this.variableTokens().map(item => item.name));
      const variables = this.variableTokens().map(item => ({ ...copy(item), managed: true }));
      previousVariables.forEach(item => {
        if (!item.managed || !names.has(item.name) && !removeStale) variables.push(copy(item));
      });
      const changedFonts = this.fontChangeCount(first);
      this.bound = { id: first ? "copy-" + (++this.copyCount) : previousId, revision: this.revision, variables,
        tokens: copy(this.tokens()), diff, failed, removeStale, changedFonts, first, plan: copy(this.plan), fontPlan: this.fontPlan(),
        expectedBindings: (this.plan.color ? 32 : 0) + 16 + 12 + (this.plan.space ? 28 : 0),
        skipped: 6 + (this.plan.color ? 3 : 35) + (this.plan.space ? 0 : 28),
        shadowCount: this.draft().find(group => group.title === "阴影样式").rows.length };
      this.skinHistory = null;
      return this.bound;
    }
    primary() { return this.bound?.variables.filter(item => item.managed && item.name.startsWith("primary.")) || []; }
    palette(hex) {
      const color = normalizeHex(hex);
      if (!color) throw new Error("请输入有效的 HEX 色值，例如 #F3BA65。");
      const baseline = this.primary();
      if (baseline.find(item => item.name === "primary.500")?.value === color) return copy(baseline);
      const amounts = { 50: .88, 100: .76, 200: .6, 300: .42, 400: .2, 500: 0, 600: -.2, 700: -.4, 800: -.55, 900: -.7 };
      return baseline.map(item => {
        const amount = amounts[item.name.split(".").pop()] || 0;
        return { ...item, value: amount >= 0 ? mix(color, "#FFFFFF", amount) : mix(color, "#000000", -amount) };
      });
    }
    applySkin(hex) {
      if (!this.boundCurrent()) throw new Error("请先完成当前方案的变量绑定。");
      const palette = this.palette(hex);
      this.skinHistory = copy(this.primary());
      this.writePalette(palette);
    }
    writePalette(palette) {
      const byName = new Map(palette.map(item => [item.name, item.value]));
      this.bound.variables.forEach(item => { if (item.managed && byName.has(item.name)) item.value = byName.get(item.name); });
      this.bound.tokens.forEach(item => { if (byName.has(item.name)) item.value = byName.get(item.name); });
    }
    restoreSkin() {
      if (!this.boundCurrent() || !this.skinHistory) return false;
      this.writePalette(this.skinHistory);
      this.skinHistory = null;
      return true;
    }
    retryBinding() { if (this.boundCurrent()) this.bound.failed = 0; }
  }
  const api = { Workflow, normalizeHex };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GovernanceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
