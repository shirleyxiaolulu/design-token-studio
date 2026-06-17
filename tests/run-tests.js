#!/usr/bin/env node
/*
 * Zero-dependency regression tests for the Design Token Studio engine.
 *
 * Loads the real browser modules (tokens.js, exports.js) and the Figma plugin's
 * pure type-scale helpers (from figma-plugin/code.js) in a Node context, then
 * asserts the invariants that the recent refactors rely on:
 *   - the type scale is a single source of truth (web + plugin consumers agree)
 *   - line height is tokenized + consistent (size * 1.5)
 *   - 15/17/19 = callout/headline/subtitle on iOS & App+Web, absent on Web 后台
 *   - all colour aliases resolve, and dark text.primary keeps AA contrast
 *     (guards the historic 1.13-contrast bug)
 *   - the DTCG export is valid and every leaf is well-formed
 *
 * Run:  node tests/run-tests.js   (exit code 1 on any failure)
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

// --- load the browser modules into the Node global scope -------------------
global.window = global;
const runGlobal = (src) => (0, eval)(src); // indirect eval → defines globals
runGlobal(fs.readFileSync(path.join(ROOT, "tokens.js"), "utf8")); // → DesignTokens
runGlobal(fs.readFileSync(path.join(ROOT, "exports.js"), "utf8")); // → DesignExports

// --- extract the plugin's pure type-scale helpers from code.js -------------
(function loadPluginHelpers() {
  const code = fs.readFileSync(path.join(ROOT, "figma-plugin/code.js"), "utf8");
  function slice(fromMarker, toMarker, what) {
    const a = code.indexOf(fromMarker);
    const b = code.indexOf(toMarker);
    if (a < 0 || b < 0 || b <= a) throw new Error("Could not locate " + what + " in figma-plugin/code.js (markers moved?)");
    return code.slice(a, b);
  }
  // type-scale helpers (used by syncTextStyles + spec page)
  runGlobal(slice("function tsFontSizeEntries", "// =============================================\n// Sync: Text Styles", "type-scale helpers"));
  // variable reconcile planners (used by syncVariables)
  runGlobal(slice("function planFontSizeRenames", "async function syncVariables", "reconcile planners"));
  // 2.0 reverse-audit pure core (used by the audit message branch)
  runGlobal(slice("// === AUDIT-CORE-START", "// === AUDIT-CORE-END ===", "audit core"));
  // 2.0 reverse-rebuild pure core (depends on audit core; used by the rebuild branch)
  runGlobal(slice("// === REBUILD-CORE-START", "// === REBUILD-CORE-END ===", "rebuild core"));
})();

// --- tiny test harness -----------------------------------------------------
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log("  ✗ " + name + "\n      " + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg ? msg + " — " : "") + "expected " + JSON.stringify(b) + " got " + JSON.stringify(a));
}

// --- shared fixtures -------------------------------------------------------
const PLATFORMS = ["ios-app", "web-admin", "app-web"];
const seedFor = (platform) => ({
  specName: "Test", primaryColor: "#6533E8", platform, defaultMode: "dark",
  neutralStrategy: "cool", baseFontSize: 17, fontStack: "PingFang SC",
  localFont: "source", radiusScale: "soft", shadowStrength: "medium", auxiliaryColors: [],
});
// Mirror ui.html normalizeData (dimension branch) so the plugin sees the same data.
function buildDimTokens(tokens) {
  const dim = {};
  for (const [key, token] of Object.entries(tokens)) {
    if (!["dimension", "number", "fontFamily"].includes(token.type)) continue;
    dim[key] = {
      figmaName: (token.figma && token.figma.variable) || key.replace(/\./g, "/"),
      tier: token.tier, value: token.value, type: token.type, usage: token.usage || "",
      role: token.role, weight: token.weight, lineHeight: token.lineHeight,
    };
  }
  return dim;
}

// =============================================================================
// 1) Type scale — single source of truth
// =============================================================================
PLATFORMS.forEach((p) => {
  const scale = DesignTokens.getTypeScale(p);
  const { tokens } = DesignTokens.generateTokens(seedFor(p));

  test(`[${p}] getTypeScale is ascending & complete`, () => {
    assert(scale.length > 0, "empty scale");
    for (let i = 1; i < scale.length; i++) assert(scale[i].size > scale[i - 1].size, "not strictly ascending at " + i);
    scale.forEach((s) => {
      eq(s.tokenName, "font.size." + s.key, "tokenName");
      assert(typeof s.size === "number", "size not number: " + s.key);
      assert(typeof s.weight === "number", "weight not number: " + s.key);
      assert(!!s.role, "missing role: " + s.key);
      eq(s.lineHeight, Math.round(s.size * 1.5), "lineHeight " + s.key); // tokenized + consistent
    });
  });

  test(`[${p}] every scale step has a font.size token carrying metadata`, () => {
    scale.forEach((s) => {
      const t = tokens[s.tokenName];
      assert(t, "missing token " + s.tokenName);
      eq(t.value, s.size, "value " + s.key);
      eq(t.role, s.role, "role " + s.key);
      eq(t.weight, s.weight, "weight " + s.key);
      eq(t.lineHeight, s.lineHeight, "lineHeight " + s.key);
    });
  });

  test(`[${p}] web + plugin consumers agree with the single source`, () => {
    const data = { platform: p, dimTokens: buildDimTokens(tokens) };
    const specs = buildFontSizeSpecs(data);  // plugin text styles
    const rows = buildTypeScaleRows(data);   // plugin spec page
    const srcKeys = scale.map((s) => s.key).slice().sort();
    const specKeys = specs.map((sp) => sp[0].replace("font.size.", "")).sort();
    const rowKeys = rows.map((r) => r[0].replace("text.", "")).sort();
    eq(JSON.stringify(specKeys), JSON.stringify(srcKeys), "text-style keys diverge from source");
    eq(JSON.stringify(rowKeys), JSON.stringify(srcKeys), "spec-page keys diverge from source");
    // weight mapping: bold iff numeric weight >= 600
    specs.forEach((sp) => {
      const key = sp[0].replace("font.size.", "");
      const w = scale.find((s) => s.key === key).weight;
      eq(sp[2], w >= 600 ? "bold" : "regular", "weight map " + key);
    });
    // spec page renders large → small
    for (let i = 1; i < rows.length; i++) assert(rows[i][1] < rows[i - 1][1], "spec page not descending");
  });
});

// =============================================================================
// 2) 15/17/19 naming regression
// =============================================================================
test("iOS callout/headline/subtitle = 15/17/19", () => {
  const m = {}; DesignTokens.getTypeScale("ios-app").forEach((s) => (m[s.key] = s.size));
  eq(m.callout, 15, "callout"); eq(m.headline, 17, "headline"); eq(m.subtitle, 19, "subtitle");
});
test("App+Web callout/headline/subtitle = 15/17/19", () => {
  const m = {}; DesignTokens.getTypeScale("app-web").forEach((s) => (m[s.key] = s.size));
  eq(m.callout, 15, "callout"); eq(m.headline, 17, "headline"); eq(m.subtitle, 19, "subtitle");
});
test("Web 后台 does NOT include 15/17/19", () => {
  const sizes = DesignTokens.getTypeScale("web-admin").map((s) => s.size);
  [15, 17, 19].forEach((n) => assert(!sizes.includes(n), "web-admin unexpectedly has " + n));
});

// =============================================================================
// 3) Token generation invariants
// =============================================================================
PLATFORMS.forEach((p) => {
  const { tokens } = DesignTokens.generateTokens(seedFor(p));

  test(`[${p}] all colour aliases resolve (no "{…}" leftovers)`, () => {
    Object.values(tokens).forEach((t) => {
      if (t.type !== "color") return;
      ["light", "dark"].forEach((mode) => {
        const v = DesignTokens.tokenValue(t, mode, tokens);
        assert(!(typeof v === "string" && v.startsWith("{")), `unresolved alias ${t.name} ${mode}: ${v}`);
      });
    });
  });

  test(`[${p}] dark text.primary keeps AA contrast (historic-bug guard)`, () => {
    const resolved = DesignTokens.resolveAllTokenValues(tokens);
    const pairs = DesignTokens.checkContrastPairs(tokens, resolved);
    const darkPrimary = pairs.find((r) => r.fg === "color.text.primary" && r.bg === "color.bg.page" && r.mode === "dark");
    assert(darkPrimary, "no dark primary/page contrast pair produced");
    assert(darkPrimary.ratio >= 4.5, "dark text.primary/page contrast too low: " + darkPrimary.ratio);
  });
});

// =============================================================================
// 4) DTCG export validity
// =============================================================================
PLATFORMS.forEach((p) => {
  const seed = seedFor(p);
  const { tokens } = DesignTokens.generateTokens(seed);

  test(`[${p}] DTCG export is valid JSON with well-formed leaves`, () => {
    const parsed = JSON.parse(DesignExports.exportDtcg(seed, tokens, "test")); // throws on invalid JSON
    let leaves = 0, colorLeaves = 0;
    (function walk(o) {
      for (const k in o) {
        if (k[0] === "$") continue;
        const v = o[k];
        if (v && typeof v === "object") {
          if ("$value" in v) {
            leaves++;
            assert(v.$type, "leaf missing $type");
            assert(v.$value !== undefined, "leaf missing $value");
            if (v.$type === "color") {
              colorLeaves++;
              const modes = v.$extensions && v.$extensions["com.designtokenstudio.modes"];
              assert(modes && modes.light && modes.dark, "colour leaf missing both modes");
            }
          } else walk(v);
        }
      }
    })(parsed);
    assert(leaves > 50, "suspiciously few tokens: " + leaves);
    assert(colorLeaves > 0, "no colour tokens");
    if (parsed.motion && parsed.motion.easing) {
      const e = Object.values(parsed.motion.easing)[0];
      eq(e.$type, "cubicBezier", "easing $type");
      assert(Array.isArray(e.$value) && e.$value.length === 4, "cubicBezier not a 4-number array");
    }
  });
});

// =============================================================================
// 5) Variable reconcile planners (existing-file migration)
// =============================================================================
test("planFontSizeRenames migrates stale names by value, leaves correct ones", () => {
  const existing = [
    { name: "font/size/15", value: 15 },
    { name: "font/size/body", value: 14 },
    { name: "font/size/17", value: 17 },
    { name: "font/size/title1", value: 22 },
  ];
  const expected = { "font/size/callout": 15, "font/size/headline": 17, "font/size/body": 14, "font/size/title1": 22 };
  const plan = planFontSizeRenames(existing, expected);
  const map = {}; plan.forEach((p) => (map[p.from] = p.to));
  eq(plan.length, 2, "rename count");
  eq(map["font/size/15"], "font/size/callout", "15 → callout");
  eq(map["font/size/17"], "font/size/headline", "17 → headline");
});
test("planFontSizeRenames no-ops when names already correct", () => {
  const existing = [{ name: "font/size/callout", value: 15 }, { name: "font/size/body", value: 14 }];
  const expected = { "font/size/callout": 15, "font/size/body": 14 };
  eq(planFontSizeRenames(existing, expected).length, 0, "should be no renames");
});
test("planVarOrphans removes only managed-namespace, non-expected names", () => {
  const existing = ["color/brand/primary", "font/size/15", "font/size/callout", "myteam/custom", "radius/md"];
  const expected = ["color/brand/primary", "font/size/callout", "radius/md"];
  const orphans = planVarOrphans(existing, expected).slice().sort();
  eq(JSON.stringify(orphans), JSON.stringify(["font/size/15"]), "orphans");
});
test("planVarOrphans never touches user-authored namespaces", () => {
  eq(planVarOrphans(["myteam/a", "vendor/b/c"], ["color/x", "font/size/body"]).length, 0, "user namespaces kept");
});

// =============================================================================
// 6) OKLCH color engine (opt-in)
// =============================================================================
const hex2rgb = (h) => { h = h.replace("#", ""); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; };

test("rgbToOklch matches reference values (white / black / red)", () => {
  const w = DesignTokens.rgbToOklch({ r: 255, g: 255, b: 255 });
  assert(Math.abs(w.L - 1) < 0.002, "white L≈1 got " + w.L);
  const k = DesignTokens.rgbToOklch({ r: 0, g: 0, b: 0 });
  assert(Math.abs(k.L) < 0.002, "black L≈0 got " + k.L);
  const r = DesignTokens.rgbToOklch({ r: 255, g: 0, b: 0 }); // ref: L0.6279 C0.2577 H29.23
  assert(Math.abs(r.L - 0.6279) < 0.01, "red L got " + r.L);
  assert(Math.abs(r.C - 0.2577) < 0.01, "red C got " + r.C);
  assert(Math.abs(r.H - 29.23) < 1.0, "red H got " + r.H);
});

test("OKLCH round-trips hex within ±1/255", () => {
  ["#6533E8", "#2563EB", "#10B981", "#FF8800", "#123456", "#ABCDEF"].forEach((hex) => {
    const rgb = hex2rgb(hex);
    const o = DesignTokens.rgbToOklch(rgb);
    const back = hex2rgb(DesignTokens.oklchToHex(o.L, o.C, o.H));
    ["r", "g", "b"].forEach((ch) => assert(Math.abs(back[ch] - rgb[ch]) <= 1, hex + " " + ch + ": " + back[ch] + " vs " + rgb[ch]));
  });
});

test("OKLCH palette: primary step 5 ≈ input, perceptual L strictly descending", () => {
  const seed = Object.assign(seedFor("ios-app"), { paletteEngine: "oklch", primaryColor: "#6533E8" });
  const { palette } = DesignTokens.generateTokens(seed);
  eq(palette.primary.length, 10, "10 steps");
  const inp = hex2rgb("#6533E8"), s5 = hex2rgb(palette.primary[5]);
  ["r", "g", "b"].forEach((ch) => assert(Math.abs(s5[ch] - inp[ch]) <= 2, "step5 " + ch + " off: " + s5[ch] + " vs " + inp[ch]));
  let prevL = 2;
  palette.primary.forEach((hex, i) => { const L = DesignTokens.rgbToOklch(hex2rgb(hex)).L; assert(L < prevL, "L not descending at " + i + " (" + L + ")"); prevL = L; });
});

test("palette engine: default === classic (non-breaking), oklch differs", () => {
  const def = DesignTokens.generateTokens(seedFor("ios-app")).palette.primary;
  const classic = DesignTokens.generateTokens(Object.assign(seedFor("ios-app"), { paletteEngine: "classic" })).palette.primary;
  const oklch = DesignTokens.generateTokens(Object.assign(seedFor("ios-app"), { paletteEngine: "oklch" })).palette.primary;
  eq(JSON.stringify(def), JSON.stringify(classic), "default must equal classic (zero-break)");
  assert(JSON.stringify(def) !== JSON.stringify(oklch), "oklch should differ from classic");
});

test("OKLCH engine keeps dark text.primary at AA contrast", () => {
  const { tokens } = DesignTokens.generateTokens(Object.assign(seedFor("ios-app"), { paletteEngine: "oklch" }));
  const pairs = DesignTokens.checkContrastPairs(tokens, DesignTokens.resolveAllTokenValues(tokens));
  const dp = pairs.find((r) => r.fg === "color.text.primary" && r.bg === "color.bg.page" && r.mode === "dark");
  assert(dp && dp.ratio >= 4.5, "OKLCH dark text.primary/page contrast too low: " + (dp && dp.ratio));
});

// =============================================================================
// 7) 2.0 reverse-audit pure core (figma-plugin/code.js AUDIT-CORE region)
// =============================================================================
test("auditDeltaE: identical=0, near-dupe small, far large", () => {
  eq(Math.round(auditDeltaE("#3366FF", "#3366FF")), 0, "identical → 0");
  assert(auditDeltaE("#3366FF", "#3367FF") < 1, "1-bit diff should be tiny ΔE");
  assert(auditDeltaE("#000000", "#FFFFFF") > 90, "black vs white should be ~100 ΔE");
});

test("auditIsNeutral: grays neutral, saturated chromatic", () => {
  assert(auditIsNeutral("#808080"), "mid gray is neutral");
  assert(auditIsNeutral("#1C232C"), "dark slate (low sat) is neutral");
  assert(!auditIsNeutral("#3366FF"), "saturated blue is chromatic");
});

test("auditTally: frequency desc, auditClusterNumbers: groups within tol", () => {
  const t = auditTally([16, 16, 16, 14, 14, 24]);
  eq(t[0].value, 16, "most frequent first"); eq(t[0].count, 3, "count");
  const cl = auditClusterNumbers([4, 5, 4, 12, 13, 40], 2);
  eq(cl.length, 3, "→ 3 clusters {4,5,4}{12,13}{40}");
  eq(cl[0].rep, 4, "rep = mode of first cluster");
});

test("auditClusterColors: near-dupes collapse, distinct stay split", () => {
  const cl = auditClusterColors(["#3366FF", "#3367FF", "#3366FE", "#FF0000"], 2.5);
  eq(cl.length, 2, "3 near-identical blues + 1 red → 2 clusters");
});

test("buildAuditReport: counts, near-dupes, off-grid, flags", () => {
  const obs = {
    nodeCount: 10,
    fills: [
      { hex: "#3366FF" }, { hex: "#3366FF" }, { hex: "#3367FF" }, // 2 exact + 1 near-dupe
      { hex: "#808080" }, { hex: "#1C232C" },
    ],
    strokes: [{ hex: "#FF0000" }],
    texts: [
      { size: 12, family: "Inter", style: "Regular" },
      { size: 14, family: "Inter", style: "Regular" },
      { size: 16, family: "Inter", style: "Bold" },
      { size: 17, family: "PingFang SC", style: "Regular" },
      { size: 20, family: "Inter", style: "Bold" },
      { size: 24, family: "Inter", style: "Bold" },
      { size: 32, family: "Inter", style: "Bold" },
    ],
    radii: [4, 8, 8, 12],
    shadows: [{ type: "DROP_SHADOW", x: 0, y: 2, blur: 8, spread: 0, hex: "#000000", alpha: 0.1 }],
    spacings: [8, 8, 16, 7, 13], // 7 & 13 are off the 4px grid
  };
  const r = buildAuditReport(obs, { colorDelta: 2.5 });
  eq(r.counts.fills, 5, "fill count"); eq(r.counts.texts, 7, "text count");
  eq(r.colors.uniqueCount, 5, "5 distinct colors (#3366FF,#3367FF,#808080,#1C232C,#FF0000)");
  assert(r.colors.nearDupes.length >= 1, "should flag the #3366FF≈#3367FF near-dupe");
  eq(r.colors.neutralCount, 2, "gray + slate are neutral");
  eq(r.type.sizeCount, 7, "7 distinct font sizes");
  eq(r.spacing.offGrid.length, 2, "7 and 13 are off-grid");
  assert(r.spacing.offGrid.indexOf(7) >= 0 && r.spacing.offGrid.indexOf(13) >= 0, "off-grid lists 7 & 13");
  assert(r.flags.some((f) => f.text.indexOf("字号") >= 0), "should flag too many font sizes");
  assert(r.flags.some((f) => f.text.indexOf("网格") >= 0), "should flag off-grid spacing");
});

test("buildAuditReport: clean input → no redundancy warnings", () => {
  const obs = {
    nodeCount: 4,
    fills: [{ hex: "#3366FF" }, { hex: "#FFFFFF" }],
    strokes: [],
    texts: [{ size: 16, family: "Inter", style: "Regular" }],
    radii: [8], shadows: [], spacings: [8, 16],
  };
  const r = buildAuditReport(obs);
  eq(r.spacing.offGrid.length, 0, "all spacing on grid");
  assert(!r.flags.some((f) => f.level === "warn"), "no warn flags for clean input");
});

// =============================================================================
// 8) 2.0 reverse-rebuild pure core (figma-plugin/code.js REBUILD-CORE region)
// =============================================================================
test("rebuildSemanticBand maps hue → role", () => {
  eq(rebuildSemanticBand(5), "error"); eq(rebuildSemanticBand(355), "error");
  eq(rebuildSemanticBand(40), "warning"); eq(rebuildSemanticBand(140), "success");
  eq(rebuildSemanticBand(220), "info"); eq(rebuildSemanticBand(300), null);
});

test("rebuildColorSystem: primary=most-used chromatic, semantics by hue, neutrals split", () => {
  const obs = {
    fills: [
      // dominant blue (primary) ×5
      { hex: "#2563EB" }, { hex: "#2563EB" }, { hex: "#2563EB" }, { hex: "#2563EB" }, { hex: "#2563EB" },
      { hex: "#10B981" }, { hex: "#10B981" },             // green → success
      { hex: "#EF4444" },                                  // red → error
      { hex: "#F59E0B" },                                  // amber → warning
      { hex: "#8B5CF6" },                                  // purple → accent
      { hex: "#FFFFFF" }, { hex: "#111827" }, { hex: "#6B7280" }, // neutrals
    ],
    strokes: [],
  };
  const cs = rebuildColorSystem(obs, { colorDelta: 2.5 });
  assert(cs.primary.length >= 1 && cs.primary[0].hex === "#2563EB", "primary base = dominant blue");
  eq(cs.semantic.success.hex, "#10B981", "green → success");
  eq(cs.semantic.error.hex, "#EF4444", "red → error");
  eq(cs.semantic.warning.hex, "#F59E0B", "amber → warning");
  assert(cs.accents.some((a) => a.hex === "#8B5CF6"), "purple → accent");
  eq(cs.neutral.length, 3, "3 neutral steps");
  // neutral steps sorted light→dark by assigned step
  for (let i = 1; i < cs.neutral.length; i++) assert(cs.neutral[i].step > cs.neutral[i - 1].step, "neutral steps ascending");
  // every emitted token has a mapping back to a raw hex
  assert(cs.mapping.every((m) => m.kind === "color" && /^#/.test(m.from) && /^color\./.test(m.to)), "color mapping well-formed");
});

test("rebuildTypeScale: most-frequent mid size = body, neighbors get roles", () => {
  const obs = { texts: [
    { size: 14 }, { size: 14 }, { size: 14 }, // body (most frequent, in 12–18)
    { size: 11 }, { size: 20 }, { size: 28 }, // well-separated → no merging
  ] };
  const ts = rebuildTypeScale(obs);
  const body = ts.roles.find((r) => r.role === "body");
  assert(body && body.size === 14, "body = 14");
  assert(!ts.roles.some((r) => r.size === 11 && r.role === "body"), "11 is not body");
  eq(ts.mapping.length, 4, "one mapping per distinct raw size");
});

test("rebuildTypeScale consolidation: merges ±1 noise, keeps distinct steps", () => {
  const obs = { texts: [
    { size: 14 }, { size: 14 }, { size: 14 }, { size: 14 }, // 14 dominant
    { size: 13 }, { size: 12 },                              // noise around 14
    { size: 16 }, { size: 16 }, { size: 16 }, { size: 17 },  // 16 + noise
    { size: 20 }, { size: 24 },                              // distinct
  ] };
  const ts = rebuildTypeScale(obs);
  eq(ts.rawCount, 7, "7 distinct raw sizes");
  assert(ts.roles.length < ts.rawCount, "consolidated to fewer levels (" + ts.roles.length + ")");
  assert(ts.merges.length >= 1, "recorded merges");
  const m13 = ts.merges.find((m) => m.from === 13);
  assert(m13 && m13.to === 14, "13 → 14 (folds into nearest common)");
  eq(ts.mapping.length, 7, "every raw size has a mapping");
  assert(ts.mapping.every((m) => /^font\.size\./.test(m.to)), "all map to a role token");
});

test("rebuildRadius / rebuildSpacing: cluster, name, snap to grid", () => {
  const r = rebuildRadius({ radii: [4, 4, 8, 8, 8, 12, 9999] });
  assert(r.scale.some((x) => x.name === "radius.full"), "huge radius → full");
  const sp = rebuildSpacing({ spacings: [7, 8, 8, 16, 16, 24] }, 4);
  const s1 = sp.scale[0];
  eq(s1.value % 4, 0, "spacing snapped to 4px grid");
});

test("buildRebuildPlan: aggregates all dims + flat mapping + JSON round-trips", () => {
  const obs = {
    fills: [{ hex: "#2563EB" }, { hex: "#2563EB" }, { hex: "#FFFFFF" }, { hex: "#111827" }],
    strokes: [],
    texts: [{ size: 14 }, { size: 14 }, { size: 20 }],
    radii: [8, 8, 12],
    spacings: [8, 16],
    shadows: [{ type: "DROP_SHADOW", x: 0, y: 2, blur: 8, spread: 0, hex: "#000000", alpha: 0.1 }],
  };
  const plan = buildRebuildPlan(obs, { colorDelta: 2.5 });
  assert(plan.tokenCount > 0, "produces tokens");
  // mapping is raw→token (one per raw value / cluster member), so ≥ token count
  assert(plan.mapping.length >= plan.tokenCount, "raw→token mapping covers at least every token");
  assert(plan.mapping.every((m) => m.from != null && typeof m.to === "string" && m.to.length), "mapping well-formed");
  const json = JSON.parse(rebuildToJson(plan));
  assert(json.$meta && json.color && json.font && json.font.size, "JSON has expected top-level shape");
  assert(json.color.primary, "primary present in JSON");
});

// --- report ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed ? 1 : 0);
