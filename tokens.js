(function () {
  const hueAnchors = {
    red: 4,
    orange: 32,
    yellow: 52,
    green: 146,
    cyan: 188,
    blue: 214,
    purple: 268,
  };

  const paletteLabels = [
    ["primary", "Primary"],
    ["red", "Red"],
    ["orange", "Orange"],
    ["yellow", "Yellow"],
    ["green", "Green"],
    ["cyan", "Cyan"],
    ["blue", "Blue"],
    ["purple", "Purple"],
    ["gray", "Gray"],
  ];

  const defaultAuxiliaryColors = [
    { id: "1", name: "辅助色 1", color: "#8B5CF6" },
    { id: "2", name: "辅助色 2", color: "#06B6D4" },
    { id: "3", name: "辅助色 3", color: "#EC4899" },
    { id: "4", name: "辅助色 4", color: "#F59E0B" },
    { id: "5", name: "辅助色 5", color: "#10B981" },
  ];

  const fontStacks = {
    pingfang: "'PingFang SC', 'Hiragino Sans GB', sans-serif",
    sf: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif",
    harmony: "'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', sans-serif",
    misans: "'MiSans', 'PingFang SC', sans-serif",
    alimama: "'Alimama FangYuanTi VF', 'PingFang SC', sans-serif",
    source: "'Source Han Sans SC', 'Noto Sans SC', 'Noto Sans CJK SC', 'PingFang SC', sans-serif",
    system: "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
  };

  // Per-font weight ladders ([label, numeric font-weight]) — each font shows the
  // weights it actually ships. PingFang/HarmonyOS have no independent Semibold/Bold
  // beyond what's listed, so those rungs are omitted rather than synthesized.
  const WL_PINGFANG = [["Light", 300], ["Regular", 400], ["Medium", 500], ["Semibold", 600]];
  const WL_HARMONY = [["Light", 300], ["Regular", 400], ["Medium", 500], ["Bold", 700]];
  const WL_MISANS = [["Light", 300], ["Regular", 400], ["Medium", 500], ["Semibold", 600], ["Bold", 700]];
  const WL_SOURCE = [["Light", 300], ["Regular", 400], ["Medium", 500], ["SemiBold", 600], ["Bold", 700]];
  const WL_ALIMAMA = [["Light", 300], ["Regular", 400], ["Medium", 500], ["Bold", 700]];

  const fontLabels = {
    pingfang: {
      cjk: "苹方",
      latin: "PingFang SC",
      intro: "系统默认采用苹方 PingFang SC，保持中文界面在 macOS / iOS 设计稿中的清晰度与系统一致性。",
      cjkStack: "PingFang SC, system-ui",
      latinStack: "PingFang SC, system-ui",
      weights: WL_PINGFANG,
    },
    sf: {
      cjk: "苹方",
      latin: "SF Pro",
      intro: "系统采用 Apple 原生字体：中文使用 PingFang SC，拉丁字符使用 SF Pro，通过系统字体栈自动调用。",
      cjkStack: "PingFang SC, system-ui",
      latinStack: "SF Pro Text, system-ui",
      weights: WL_PINGFANG,
    },
    harmony: {
      cjk: "鸿蒙黑体",
      latin: "HarmonyOS Sans",
      intro: "适合偏 Android / HarmonyOS 的跨端界面，中文与拉丁字符都保持中性、清晰的几何结构。",
      cjkStack: "HarmonyOS Sans SC",
      latinStack: "HarmonyOS Sans",
      weights: WL_HARMONY,
    },
    misans: {
      cjk: "MiSans",
      latin: "MiSans",
      intro: "适合年轻、轻量的移动产品界面，字形紧凑，适合高信息密度页面。",
      cjkStack: "MiSans",
      latinStack: "MiSans",
      weights: WL_MISANS,
    },
    alimama: {
      cjk: "阿里妈妈方圆体",
      latin: "Alimama",
      intro: "更有品牌感和圆润特征，适合希望在标题和运营页面里增加识别度的设计系统。",
      cjkStack: "Alimama FangYuanTi VF",
      latinStack: "Alimama FangYuanTi",
      weights: WL_ALIMAMA,
    },
    source: {
      cjk: "思源黑体",
      latin: "Source Han Sans",
      intro: "开源的泛 CJK 黑体（Source Han Sans / Noto Sans CJK），跨平台一致、字重齐全，适合面向多端用户的 Web 设计系统。",
      cjkStack: "Noto Sans SC, Source Han Sans SC",
      latinStack: "Source Han Sans SC",
      weights: WL_SOURCE,
    },
    system: {
      cjk: "系统默认",
      latin: "System UI",
      intro: "跟随设备系统字体，适合希望减少字体依赖并保持平台原生体验的界面。",
      cjkStack: "system-ui",
      latinStack: "system-ui",
      weights: WL_PINGFANG,
    },
  };

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function hexToRgb(hex) {
    const normalized = hex.replace("#", "").trim();
    const full = normalized.length === 3
      ? normalized.split("").map((char) => char + char).join("")
      : normalized.padEnd(6, "0").slice(0, 6);

    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => {
      return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
    }).join("")}`.toUpperCase();
  }

  function rgbToHsl({ r, g, b }) {
    const nextR = r / 255;
    const nextG = g / 255;
    const nextB = b / 255;
    const max = Math.max(nextR, nextG, nextB);
    const min = Math.min(nextR, nextG, nextB);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case nextR:
          h = (nextG - nextB) / d + (nextG < nextB ? 6 : 0);
          break;
        case nextG:
          h = (nextB - nextR) / d + 2;
          break;
        default:
          h = (nextR - nextG) / d + 4;
          break;
      }
      h *= 60;
    }

    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const sat = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (hue < 60) [r, g, b] = [c, x, 0];
    else if (hue < 120) [r, g, b] = [x, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, x];
    else if (hue < 240) [r, g, b] = [0, x, c];
    else if (hue < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    return rgbToHex({
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255,
    });
  }

  function normalizeAuxHex(value) {
    const raw = String(value || "").trim().replace("#", "");
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return "#8B5CF6";
    if (raw.length === 3) {
      return `#${raw.split("").map((char) => char + char).join("")}`.toUpperCase();
    }
    return `#${raw}`.toUpperCase();
  }


  function deriveAuxiliaryDark(hex) {
    const hsl = rgbToHsl(hexToRgb(hex));
    return hslToHex(hsl.h, Math.max(hsl.s, 62), clamp(hsl.l + 16, 56, 78));
  }

  // ===== v2: WCAG Contrast Ratio =====
  function relativeLuminance({ r, g, b }) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(hexToRgb(hex1));
    const l2 = relativeLuminance(hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function wcagLevel(ratio) {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    if (ratio >= 3) return "AA-large";
    return "FAIL";
  }

  function checkContrastPairs(tokens, resolvedTokens) {
    const pairs = [
      ["color.text.primary", "color.bg.page", "主文本 / 页面背景"],
      ["color.text.primary", "color.bg.surface", "主文本 / 容器背景"],
      ["color.text.primary", "color.bg.elevated", "主文本 / 浮层背景"],
      ["color.text.secondary", "color.bg.page", "次文本 / 页面背景"],
      ["color.text.secondary", "color.bg.surface", "次文本 / 容器背景"],
      ["color.text.tertiary", "color.bg.surface", "弱文本 / 容器背景"],
      ["color.brand.primary", "color.bg.surface", "品牌色 / 容器背景"],
      ["color.constant.white", "color.brand.primary", "白色文字 / 品牌色按钮"],
      ["color.function.danger", "color.bg.surface", "危险色 / 容器背景"],
      ["color.function.success", "color.bg.surface", "成功色 / 容器背景"],
    ];

    const results = [];
    for (const [fgName, bgName, label] of pairs) {
      for (const mode of ["light", "dark"]) {
        const fg = resolvedTokens[fgName]?.[mode];
        const bg = resolvedTokens[bgName]?.[mode];
        if (fg && bg && !fg.startsWith("rgba") && !bg.startsWith("rgba")) {
          const ratio = contrastRatio(fg, bg);
          results.push({
            label,
            mode,
            fg: fgName,
            bg: bgName,
            fgColor: fg,
            bgColor: bg,
            ratio: Math.round(ratio * 100) / 100,
            level: wcagLevel(ratio),
            pass: ratio >= 4.5,
          });
        }
      }
    }
    return results;
  }

  // ===== v2: Auxiliary Color Full Scale =====
  function buildAuxiliaryScale(hex) {
    const hsl = rgbToHsl(hexToRgb(hex));
    // Anchor like the primary: the input color lands precisely on step 5 and the
    // whole ramp is derived from it (using its lightness AND saturation, not just hue).
    return buildScale(hsl.h, hsl.s, "color", hsl.l, hsl.s);
  }

  function normalizeAuxiliaryColors(items) {
    const source = Array.isArray(items) && items.length ? items : defaultAuxiliaryColors;
    return source.map((item, index) => {
      // 变量名用稳定的「位置编号」（color.auxiliary.1/2…），与反推端命名一致。
      // 换色不破：第 N 个槽位永远是 .N，无论它这版是红还是绿；入参 item.id 被忽略。
      // name 仅作 UI 显示 / 备注，不进变量名。
      const id = String(index + 1);
      const name = String(item?.name || `辅助色 ${index + 1}`).trim() || `辅助色 ${index + 1}`;
      return {
        id,
        name,
        color: normalizeAuxHex(item?.color),
      };
    });
  }

  // ===========================================================================
  // OKLCH color engine (opt-in) — perceptually-uniform palette scales.
  // OKLab/OKLCH math per Björn Ottosson (https://bottosson.github.io/posts/oklab/).
  // Active only when seed.paletteEngine === "oklch"; the default stays HSL.
  // ===========================================================================
  function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linearToSrgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  function rgbToOklch({ r, g, b }) {
    const lr = srgbToLinear(r / 255), lg = srgbToLinear(g / 255), lb = srgbToLinear(b / 255);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    const C = Math.sqrt(a * a + bb * bb);
    let H = Math.atan2(bb, a) * 180 / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
  }

  function oklchToLinearRgb(L, C, H) {
    const hr = H * Math.PI / 180;
    const a = C * Math.cos(hr), b = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return {
      r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    };
  }

  function oklchToHex(L, C, H) {
    const inGamut = (v) => v.r >= -1e-4 && v.r <= 1.0001 && v.g >= -1e-4 && v.g <= 1.0001 && v.b >= -1e-4 && v.b <= 1.0001;
    let lin = oklchToLinearRgb(L, C, H);
    if (!inGamut(lin)) {
      // Reduce chroma (keep L + H) until the colour fits the sRGB gamut.
      let lo = 0, hi = C;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(oklchToLinearRgb(L, mid, H))) lo = mid; else hi = mid;
      }
      lin = oklchToLinearRgb(L, lo, H);
    }
    return rgbToHex({
      r: Math.round(clamp(linearToSrgb(clamp(lin.r, 0, 1)), 0, 1) * 255),
      g: Math.round(clamp(linearToSrgb(clamp(lin.g, 0, 1)), 0, 1) * 255),
      b: Math.round(clamp(linearToSrgb(clamp(lin.b, 0, 1)), 0, 1) * 255),
    });
  }

  // Perceptual lightness ladder (light → dark, index 0..9) + chroma curve (peaks mid).
  const OKLCH_L = [0.971, 0.936, 0.882, 0.808, 0.730, 0.648, 0.567, 0.482, 0.397, 0.318];
  const OKLCH_C = [0.18, 0.34, 0.55, 0.75, 0.92, 1.00, 0.96, 0.86, 0.73, 0.60];

  function buildScaleOklch(opts) {
    let H, Cbase, Loff = 0;
    if (opts.anchorHex) {
      const o = rgbToOklch(hexToRgb(opts.anchorHex));
      H = o.H;
      Cbase = o.C / OKLCH_C[5]; // so step 5 chroma === input chroma
      Loff = o.L - OKLCH_L[5];  // so step 5 lightness === input lightness (step 5 ≈ input)
    } else {
      H = opts.hue;
      Cbase = opts.chroma;
    }
    return OKLCH_L.map((L0, i) => {
      const blend = Math.max(0, 1 - Math.abs(i - 5) * 0.16); // fade the anchor offset toward the ends
      const L = clamp(L0 + Loff * blend, 0.05, 0.99);
      return oklchToHex(L, Cbase * OKLCH_C[i], H);
    });
  }

  const oklchHueOf = (hex) => rgbToOklch(hexToRgb(hex)).H;

  function makePaletteOklch(seed) {
    const primaryHsl = rgbToHsl(hexToRgb(seed.primaryColor));
    const neutralHslHue = getNeutralHue(seed.neutralStrategy, primaryHsl.h);
    const palette = {
      primary: buildScaleOklch({ anchorHex: seed.primaryColor }),
      gray: buildScaleOklch({ hue: oklchHueOf(hslToHex(neutralHslHue, 30, 55)), chroma: 0.012 }),
    };
    Object.entries(hueAnchors).forEach(([name, hslHue]) => {
      palette[name] = buildScaleOklch({ hue: oklchHueOf(hslToHex(hslHue, 80, 55)), chroma: 0.16 });
    });
    return palette;
  }

  function buildScale(hue, saturation, mode = "color", anchorLight, anchorSat) {
    const lights = [97, 92, 84, 74, 64, 54, 44, 34, 24, 15];
    const sats = [45, 52, 60, 68, 76, 84, 82, 78, 70, 62];

    if (mode === "gray") {
      return lights.map((light, index) => {
        return hslToHex(hue, saturation, light - (index > 7 ? 2 : 0));
      });
    }

    // If anchor values provided (from user's actual input color),
    // adjust the scale so step 5 matches the input color exactly
    if (anchorLight !== undefined && anchorSat !== undefined) {
      const lightOffset = anchorLight - lights[5]; // diff from default 54
      const satOffset = anchorSat - sats[5];       // diff from default 84
      return lights.map((light, index) => {
        // Gradually blend offset: strongest at step 5, fading toward edges
        const distance = Math.abs(index - 5);
        const blend = Math.max(0, 1 - distance * 0.18);
        const adjustedLight = clamp(light + lightOffset * blend, 3, 99);
        const adjustedSat = clamp(sats[index] + satOffset * blend, 10, 100);
        return hslToHex(hue, adjustedSat, adjustedLight);
      });
    }

    return lights.map((light, index) => hslToHex(hue, sats[index], light));
  }

  function getNeutralHue(strategy, primaryHue) {
    if (strategy === "warm") return 38;
    if (strategy === "neutral") return 220;
    return clamp(primaryHue + 8, 195, 232);
  }

  function makePalette(seed) {
    if (seed.paletteEngine === "oklch") return makePaletteOklch(seed);
    const primaryHsl = rgbToHsl(hexToRgb(seed.primaryColor));
    const neutralHue = getNeutralHue(seed.neutralStrategy, primaryHsl.h);
    const palette = {
      primary: buildScale(primaryHsl.h, primaryHsl.s, "color", primaryHsl.l, primaryHsl.s),
      gray: buildScale(neutralHue, seed.neutralStrategy === "warm" ? 9 : (seed.neutralStrategy === "neutral" ? 3 : 13), "gray"),
    };

    Object.entries(hueAnchors).forEach(([name, hue]) => {
      palette[name] = buildScale(hue, 78);
    });

    return palette;
  }

  function radiusScale(name) {
    if (name === "sharp") return [0, 2, 4, 6, 8, 12, 999];
    if (name === "balanced") return [0, 4, 6, 8, 12, 16, 999];
    return [0, 6, 8, 12, 16, 24, 999];
  }

  function shadowLayer(label, x, y, blur, spread, color, alpha) {
    return { label, x, y, blur, spread, color, alpha };
  }

  function shadowLayerToCss(layer) {
    return `${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px rgba(${layer.color},${layer.alpha})`;
  }

  function shadowToCss(layers) {
    if (layers === "none") return "none";
    return layers.map(shadowLayerToCss).join(", ");
  }

  function shadowScale(name) {
    const opacity = name === "strong" ? 0.22 : name === "subtle" ? 0.10 : 0.16;
    const alpha = (value) => Number(value.toFixed(3));
    return {
      none: {
        light: "none",
        dark: "none",
      },
      sm: {
        light: [shadowLayer("投影", 0, 2, 8, 0, "20,30,55", alpha(opacity * 0.45))],
        dark: [
          shadowLayer("高光", 0, 1, 0, 0, "255,255,255", 0.05),
          shadowLayer("轮廓", 0, 0, 0, 1, "78,255,175", 0.10),
          shadowLayer("投影", 0, 10, 28, 0, "0,0,0", alpha(opacity * 1.15)),
        ],
      },
      md: {
        light: [shadowLayer("投影", 0, 8, 24, 0, "20,30,55", alpha(opacity))],
        dark: [
          shadowLayer("高光", 0, 1, 0, 0, "255,255,255", 0.06),
          shadowLayer("轮廓", 0, 0, 0, 1, "78,255,175", 0.14),
          shadowLayer("投影", 0, 18, 42, 0, "0,0,0", alpha(opacity * 1.45)),
        ],
      },
      lg: {
        light: [shadowLayer("投影", 0, 18, 48, 0, "20,30,55", alpha(opacity * 1.15))],
        dark: [
          shadowLayer("高光", 0, 1, 0, 0, "255,255,255", 0.08),
          shadowLayer("轮廓", 0, 0, 0, 1, "78,255,175", 0.18),
          shadowLayer("投影", 0, 28, 70, 0, "0,0,0", alpha(opacity * 1.75)),
        ],
      },
      overlay: {
        light: [shadowLayer("投影", 0, 24, 64, 0, "0,0,0", alpha(opacity * 1.35))],
        dark: [
          shadowLayer("轮廓", 0, 0, 0, 1, "78,255,175", 0.22),
          shadowLayer("投影", 0, 34, 90, 0, "0,0,0", alpha(opacity * 2)),
        ],
      },
    };
  }

  // ===========================================================================
  // Type scale — SINGLE SOURCE OF TRUTH
  // Declarative scale per platform. Consumed by: token generation (below),
  // the web preview (app.js via DesignTokens.getTypeScale), and the Figma
  // plugin (text styles + spec page, via the role/weight/lineHeight metadata
  // carried on each font.size token in the export). To add/rename/reorder a
  // size, edit ONLY here — every consumer derives from this.
  //   - weight: numeric CSS weight; the Figma plugin maps weight >= 600 → bold.
  //   - order:  ascending (small → large) so Figma variables list small → large.
  // ===========================================================================
  const LINE_HEIGHT_RATIO = 1.5;
  function scaleLineHeight(size) {
    return Math.round(size * LINE_HEIGHT_RATIO);
  }

  const TYPE_SCALES = {
    "ios-app": [
      { key: "mini",       size: 10, weight: 400, role: "Mini",        usage: "角标、最小标注" },
      { key: "caption",    size: 11, weight: 400, role: "Caption",     usage: "时间戳、辅助标签" },
      { key: "footnote",   size: 12, weight: 400, role: "Footnote",    usage: "脚注、次要信息" },
      { key: "subhead",    size: 13, weight: 400, role: "Subhead",     usage: "副标题、列表描述" },
      { key: "body",       size: 14, weight: 400, role: "Body",        usage: "正文、段落" },
      { key: "callout",    size: 15, weight: 400, role: "Callout",     usage: "紧凑正文、次要信息" },
      { key: "title3",     size: 16, weight: 600, role: "Title 3",     usage: "三级标题、列表组头" },
      { key: "headline",   size: 17, weight: 400, role: "Headline",    usage: "舒适正文、重点信息" },
      { key: "title2",     size: 18, weight: 600, role: "Title 2",     usage: "二级标题、卡片头" },
      { key: "subtitle",   size: 19, weight: 400, role: "Subtitle",    usage: "强调正文、小标题" },
      { key: "title1",     size: 22, weight: 700, role: "Title 1",     usage: "一级标题、模块头" },
      { key: "largeTitle", size: 28, weight: 700, role: "Large Title", usage: "大标题、首屏展示" },
    ],
    "web-admin": [
      { key: "mini",    size: 10, weight: 400, role: "Mini",       usage: "角标、最小标注" },
      { key: "caption", size: 12, weight: 400, role: "Caption",    usage: "标签、图注" },
      { key: "sm",      size: 13, weight: 400, role: "Body Small", usage: "辅助文本" },
      { key: "md",      size: 14, weight: 400, role: "Body",       usage: "正文默认" },
      { key: "lg",      size: 16, weight: 400, role: "Body Large", usage: "大正文、导语" },
      { key: "xl",      size: 18, weight: 600, role: "Heading 4",  usage: "卡片标题" },
      { key: "2xl",     size: 20, weight: 600, role: "Heading 3",  usage: "模块标题" },
      { key: "3xl",     size: 24, weight: 700, role: "Heading 2",  usage: "页面标题" },
      { key: "4xl",     size: 32, weight: 700, role: "Heading 1",  usage: "页面大标题" },
      { key: "5xl",     size: 40, weight: 800, role: "Display",    usage: "展示标题、Hero 区" },
    ],
    "app-web": [
      { key: "mini",     size: 10, weight: 400, role: "Mini",       usage: "角标（通用最小）" },
      { key: "caption",  size: 11, weight: 400, role: "Caption",    usage: "标签（iOS caption）" },
      { key: "footnote", size: 12, weight: 400, role: "Footnote",   usage: "脚注（iOS footnote）/ 辅助" },
      { key: "sm",       size: 13, weight: 400, role: "Body Small", usage: "副标题（iOS subhead）" },
      { key: "body",     size: 14, weight: 400, role: "Body",       usage: "正文（通用）" },
      { key: "callout",  size: 15, weight: 400, role: "Callout",    usage: "紧凑正文、次要信息" },
      { key: "lg",       size: 16, weight: 400, role: "Body Large", usage: "大正文（Web）/ title3（iOS）" },
      { key: "headline", size: 17, weight: 400, role: "Headline",   usage: "舒适正文、重点信息" },
      { key: "xl",       size: 18, weight: 600, role: "Heading 4",  usage: "卡片标题（Web）/ title2（iOS）" },
      { key: "subtitle", size: 19, weight: 400, role: "Subtitle",   usage: "强调正文、小标题" },
      { key: "2xl",      size: 20, weight: 600, role: "Heading 3",  usage: "模块标题（Web）/ title1（iOS）" },
      { key: "3xl",      size: 24, weight: 700, role: "Heading 2",  usage: "页面标题（Web）/ largeTitle（iOS）" },
      { key: "4xl",      size: 32, weight: 700, role: "Heading 1",  usage: "页面大标题（Web）" },
      { key: "5xl",      size: 40, weight: 800, role: "Display",    usage: "展示标题、Hero 区（Web）" },
    ],
  };

  const FONT_FAMILY_USAGE = {
    "ios-app": "iOS 界面默认字体栈",
    "web-admin": "Web 后台默认字体栈",
    "app-web": "App+Web 统一字体栈",
  };

  // Web preview / any web-side consumer reads the scale through this.
  function getTypeScale(platform) {
    const scale = TYPE_SCALES[platform] || TYPE_SCALES["app-web"];
    return scale.map((s) => ({
      key: s.key,
      tokenName: "font.size." + s.key,
      size: s.size,
      weight: s.weight,
      role: s.role,
      usage: s.usage,
      lineHeight: scaleLineHeight(s.size),
    }));
  }

  function typography(platform, base, fontStack) {
    const scale = TYPE_SCALES[platform] || TYPE_SCALES["app-web"];
    const out = {};
    out["font.family.base"] = {
      value: fontStack,
      usage: FONT_FAMILY_USAGE[platform] || FONT_FAMILY_USAGE["app-web"],
    };
    scale.forEach((s) => {
      out["font.size." + s.key] = {
        value: s.size,
        usage: s.usage,
        role: s.role,
        weight: s.weight,
        lineHeight: scaleLineHeight(s.size),
      };
    });
    out["font.lineHeight.body"] = { value: 22 };
    return out;
  }

  // v2: naming strategy - "prefixed" (primitive/semantic/) or "flat" (直接 color/brand/primary)
  let namingStrategy = "flat";

  function setNamingStrategy(strategy) {
    namingStrategy = strategy === "prefixed" ? "prefixed" : "flat";
  }

  function figmaVariableName(name, tier) {
    if (namingStrategy === "flat") {
      if (name.startsWith("color.palette.")) {
        return name.replace("color.palette.", "color/").replaceAll(".", "/");
      }
      if (name.startsWith("color.common.")) {
        return name.replace("color.common.", "color/common/").replaceAll(".", "/");
      }
      if (name.startsWith("color.custom.")) {
        return name.replace("color.custom.", "color/custom/").replaceAll(".", "/");
      }
      return name.replaceAll(".", "/");
    }

    // Prefixed: original behavior
    if (tier === "primitive") {
      if (name.startsWith("color.palette.")) {
        return name.replace("color.palette.", "primitive/color/").replaceAll(".", "/");
      }
      if (name.startsWith("color.common.")) {
        return name.replace("color.common.", "primitive/color/common/").replaceAll(".", "/");
      }
      if (name.startsWith("color.custom.")) {
        return name.replace("color.custom.", "primitive/color/custom/").replaceAll(".", "/");
      }
      return "primitive/" + name.replaceAll(".", "/");
    }
    if (tier === "semantic") {
      return "semantic/" + name.replaceAll(".", "/");
    }
    return name.replaceAll(".", "/");
  }

  function makeToken(name, type, value, usage = "", extra = {}) {
    const tier = extra.tier || (name.includes("palette") ? "primitive" : "semantic");
    return {
      name,
      type,
      tier,
      category: tier,
      value,
      css: { name: `--${name.replaceAll(".", "-")}` },
      figma: {
        collection: "current",
        variable: figmaVariableName(name, tier),
        scopes: type === "color" ? ["ALL_FILLS"] : ["ALL_SCOPES"],
      },
      usage,
      ...extra,
    };
  }

  function generateTokens(seed) {
    const palette = makePalette(seed);
    const tokens = {};
    const auxiliaryColors = normalizeAuxiliaryColors(seed.auxiliaryColors);

    Object.entries(palette).forEach(([family, scale]) => {
      scale.forEach((color, index) => {
        tokens[`color.palette.${family}.${index}`] = makeToken(
          `color.palette.${family}.${index}`,
          "color",
          { light: color, dark: scale[9 - index] },
          `${family} 色阶 ${index}`,
          { tier: "primitive" }
        );
      });
    });

    // 深色中性（背景/边框）按「中性色倾向」轻微染色：保留各自明度（深浅层次/对比不变），
    // 只把色相改成中性色相、并加很低的饱和，让暖灰/冷灰在深色模式也生效。遮罩纯黑不染。
    const neutralTintHue = getNeutralHue(seed.neutralStrategy, rgbToHsl(hexToRgb(seed.primaryColor)).h);
    const neutralTintSat = seed.neutralStrategy === "warm" ? 10 : seed.neutralStrategy === "neutral" ? 4 : 14;
    const tintDark = (hex) => hslToHex(neutralTintHue, neutralTintSat, rgbToHsl(hexToRgb(hex)).l);

    const commonColors = {
      "color.common.white": ["#FFFFFF", "#FFFFFF", "基础白色"],
      "color.common.black": ["#000000", "#000000", "基础黑色"],
      "color.common.dark.page": [tintDark("#101216"), tintDark("#101216"), "深色页面背景原始值"],
      "color.common.dark.surface": [tintDark("#181B20"), tintDark("#181B20"), "深色容器背景原始值"],
      "color.common.dark.elevated": [tintDark("#20242B"), tintDark("#20242B"), "深色浮层背景原始值"],
      "color.common.dark.overlay": ["#000000", "#000000", "深色遮罩原始值 (72%透明度)"],
      "color.common.overlay": ["#0F172A", "#0F172A", "浅色遮罩原始值 (48%透明度)"],
      "color.common.dark.border.default": [tintDark("#303640"), tintDark("#303640"), "深色默认描边原始值"],
      "color.common.dark.border.subtle": [tintDark("#252A32"), tintDark("#252A32"), "深色弱描边原始值"],
      "color.common.dark.border.strong": [tintDark("#4A5361"), tintDark("#4A5361"), "深色强描边原始值"],
    };

    Object.entries(commonColors).forEach(([name, [light, dark, usage]]) => {
      tokens[name] = makeToken(name, "color", { light, dark }, usage, { tier: "primitive" });
    });

    auxiliaryColors.forEach((item) => {
      const name = `color.custom.${item.id}`;
      tokens[name] = makeToken(name, "color", {
        light: item.color,
        dark: deriveAuxiliaryDark(item.color),
      }, `${item.name} 辅助色原始值`, {
        tier: "primitive",
        auxiliaryName: item.name,
      });
    });

    const semanticColors = {
      "color.brand.subtle": ["color.palette.primary.0", "color.palette.primary.9", "品牌最浅底色（标签、徽章背景）"],
      "color.brand.soft": ["color.palette.primary.1", "color.palette.primary.8", "品牌浅色（卡片高亮、选中行）"],
      "color.brand.muted": ["color.palette.primary.2", "color.palette.primary.7", "品牌中浅色（进度条底、分割）"],
      "color.brand.primary.hover": ["color.palette.primary.4", "color.palette.primary.4", "品牌主操作悬停"],
      "color.brand.primary": ["color.palette.primary.5", "color.palette.primary.5", "品牌主操作"],
      "color.brand.primary.active": ["color.palette.primary.6", "color.palette.primary.6", "品牌主操作按下"],
      "color.brand.emphasis": ["color.palette.primary.7", "color.palette.primary.3", "品牌深强调色（图标、边框）"],
      "color.brand.strong": ["color.palette.primary.8", "color.palette.primary.2", "品牌最深色（深底文字、暗调CTA）"],
      "color.function.success": ["color.palette.green.6", "color.palette.green.4", "成功反馈"],
      "color.function.warning": ["color.palette.orange.5", "color.palette.orange.4", "警示反馈"],
      "color.function.danger": ["color.palette.red.5", "color.palette.red.4", "危险反馈"],
      "color.function.info": ["color.palette.blue.5", "color.palette.blue.4", "信息反馈"],
      "color.text.primary": ["color.palette.gray.9", "color.palette.gray.0", "最主要文本"],
      "color.text.secondary": ["color.palette.gray.7", "color.palette.gray.2", "次主要文本"],
      "color.text.tertiary": ["color.palette.gray.6", "color.palette.gray.4", "稍次要文本"],
      "color.text.quaternary": ["color.palette.gray.5", "color.palette.gray.5", "最次要文本"],
      "color.text.disabled": ["color.palette.gray.3", "color.palette.gray.6", "禁用文本"],
      "color.text.placeholder": ["color.palette.gray.2", "color.palette.gray.7", "占位符、输入提示文本"],
      "color.text.light": ["color.palette.gray.1", "color.palette.gray.8", "水印、极弱辅助文本"],
      "color.text.inverse": ["color.common.white", "color.palette.gray.9", "反色文本"],
      "color.constant.black": ["color.common.black", "color.common.black", "常量黑色，不跟随主题切换"],
      "color.constant.white": ["color.common.white", "color.common.white", "常量白色，不跟随主题切换"],
      "color.bg.page": ["color.palette.gray.0", "color.common.dark.page", "页面背景"],
      "color.bg.surface": ["color.common.white", "color.common.dark.surface", "基础容器"],
      "color.bg.elevated": ["color.common.white", "color.common.dark.elevated", "浮层容器"],
      "color.bg.overlay": ["color.common.overlay", "color.common.dark.overlay", "遮罩背景"],
      "color.border.default": ["color.palette.gray.2", "color.common.dark.border.default", "默认描边"],
      "color.border.subtle": ["color.palette.gray.1", "color.common.dark.border.subtle", "弱描边"],
      "color.border.strong": ["color.palette.gray.4", "color.common.dark.border.strong", "强描边"],
    };

    // v2 fix: semantic tokens always reference .light of the target palette step
    // The semantic layer selects WHICH step, the palette step .light is the canonical color
    Object.entries(semanticColors).forEach(([name, [lightAlias, darkAlias, usage]]) => {
      const lightRef = lightAlias.startsWith("color.common.") ? `{${lightAlias}.light}` : `{${lightAlias}.light}`;
      const darkRef = darkAlias.startsWith("color.common.") ? `{${darkAlias}.light}` : `{${darkAlias}.light}`;
      tokens[name] = makeToken(name, "color", {
        light: lightRef,
        dark: darkRef,
      }, usage, {
        tier: "semantic",
        alias: { light: lightAlias, dark: darkAlias },
      });
    });

    auxiliaryColors.forEach((item) => {
      const name = `color.auxiliary.${item.id}`;
      tokens[name] = makeToken(name, "color", {
        light: `{color.custom.${item.id}.light}`,
        dark: `{color.custom.${item.id}.light}`,
      }, `${item.name} 辅助色`, {
        tier: "semantic",
        alias: { light: `color.custom.${item.id}`, dark: `color.custom.${item.id}` },
        auxiliaryName: item.name,
      });
    });

    Object.entries(typography(seed.platform, seed.baseFontSize, seed.fontStack)).forEach(([name, item]) => {
      const extra = { tier: "semantic" };
      // Carry typography metadata (role / weight / lineHeight) onto font.size
      // tokens so the Figma plugin can derive text styles + the spec page from
      // the export — single source of truth, no re-hardcoding in the plugin.
      if (item.role !== undefined) extra.role = item.role;
      if (item.weight !== undefined) extra.weight = item.weight;
      if (item.lineHeight !== undefined) extra.lineHeight = item.lineHeight;
      tokens[name] = makeToken(name, name.includes("family") ? "fontFamily" : "dimension", item.value, item.usage || "字体变量", extra);
    });

    const radiusNames = ["none", "xs", "sm", "md", "lg", "xl", "full"];
    radiusScale(seed.radiusScale).forEach((value, index) => {
      const name = `radius.${radiusNames[index]}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "圆角变量", { tier: "semantic" });
    });

    const spaces = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 };
    Object.entries(spaces).forEach(([step, value]) => {
      const name = `space.${step}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "间距变量", { tier: "semantic" });
    });

    Object.entries(shadowScale(seed.shadowStrength)).forEach(([level, value]) => {
      const name = `shadow.${level}`;
      tokens[name] = makeToken(name, "shadow", value, "阴影变量", { tier: "semantic" });
    });


    // ===== v2: Extra Semantic Colors =====
    const extraSemanticColors = {
      "color.text.link": ["color.palette.primary.5", "color.palette.primary.3", "链接文本"],
      "color.bg.brand": ["color.palette.primary.5", "color.palette.primary.5", "品牌背景色"],
      "color.bg.disabled": ["color.palette.gray.1", "color.common.dark.border.subtle", "禁用背景"],
      "color.function.danger-bg": ["color.palette.red.0", "color.palette.red.9", "危险浅底色"],
      "color.function.success-bg": ["color.palette.green.0", "color.palette.green.9", "成功浅底色"],
      "color.function.warning-bg": ["color.palette.orange.0", "color.palette.orange.9", "警告浅底色"],
      "color.function.info-bg": ["color.palette.blue.0", "color.palette.blue.9", "信息浅底色"],
    };

    Object.entries(extraSemanticColors).forEach(([name, [lightAlias, darkAlias, usage]]) => {
      tokens[name] = makeToken(name, "color", {
        light: `{${lightAlias}.light}`,
        dark: `{${darkAlias}.light}`,
      }, usage, {
        tier: "semantic",
        alias: { light: lightAlias, dark: darkAlias },
      });
    });

    // ===== v2: Opacity Tokens =====
    const opacities = {
      "opacity.5": [0.05, "微弱叠加、极轻悬停"],
      "opacity.10": [0.10, "悬停态、轻量叠加"],
      "opacity.20": [0.20, "按下态、次级遮罩"],
      "opacity.40": [0.40, "禁用态、中度遮罩"],
      "opacity.60": [0.60, "遮罩层、浮层底"],
      "opacity.80": [0.80, "重度遮罩、模态背景"],
    };

    Object.entries(opacities).forEach(([name, [value, usage]]) => {
      tokens[name] = makeToken(name, "number", value, usage, { tier: "semantic" });
    });

    // ===== v3: Motion / Transition Tokens =====
    const motions = {
      "motion.duration.fast": ["100ms", "微交互：开关、复选框"],
      "motion.duration.normal": ["200ms", "常规过渡：按钮、颜色变化"],
      "motion.duration.slow": ["350ms", "展开收起：手风琴、抽屉"],
      "motion.duration.slower": ["500ms", "页面切换、模态弹窗"],
      "motion.easing.default": ["cubic-bezier(0.25, 0.1, 0.25, 1)", "默认缓动"],
      "motion.easing.in": ["cubic-bezier(0.42, 0, 1, 1)", "加速进入（元素退出时）"],
      "motion.easing.out": ["cubic-bezier(0, 0, 0.58, 1)", "减速退出（元素进入时）"],
      "motion.easing.spring": ["cubic-bezier(0.34, 1.56, 0.64, 1)", "弹性效果（按钮按下回弹）"],
    };

    Object.entries(motions).forEach(([name, [value, usage]]) => {
      tokens[name] = makeToken(name, "string", value, usage, { tier: "primitive" });
    });

    // ===== v2: Spacing Extras =====
    const extraSpaces = { 16: 64, 20: 80 };
    Object.entries(extraSpaces).forEach(([step, value]) => {
      const name = `space.${step}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "大间距变量", { tier: "semantic" });
    });

    // ===== v2: Auxiliary Color Full Scale =====
    auxiliaryColors.forEach((item) => {
      const scale = buildAuxiliaryScale(item.color);
      scale.forEach((color, index) => {
        const name = `color.custom.${item.id}.${index}`;
        tokens[name] = makeToken(name, "color", {
          light: color,
          dark: scale[9 - index],
        }, `${item.name} 辅助色阶 ${index}`, {
          tier: "primitive",
          auxiliaryName: item.name,
        });
      });
    });

    return { palette, tokens };
  }

  function normalizeHex(value) {
    const raw = value.trim().replace("#", "");
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return "#3366FF";
    if (raw.length === 3) {
      return `#${raw.split("").map((char) => char + char).join("")}`.toUpperCase();
    }
    return `#${raw}`.toUpperCase();
  }

  function tokenValue(token, mode, tokens = null) {
    if (token.value && typeof token.value === "object" && "light" in token.value) {
      const value = token.value[mode];
      const aliasMatch = typeof value === "string" ? value.match(/^\{(.+)\.(light|dark)\}$/) : null;
      if (aliasMatch && tokens && tokens[aliasMatch[1]]) {
        return tokenValue(tokens[aliasMatch[1]], aliasMatch[2], tokens);
      }
      return token.type === "shadow" ? shadowToCss(value) : value;
    }
    return token.type === "shadow" ? shadowToCss(token.value) : token.value;
  }

  function cssValue(token, tokens, mode = "light") {
    const value = tokenValue(token, mode, tokens);
    if (token.type === "dimension" && typeof value === "number") return `${value}px`;
    return value;
  }

  // ===== v2: Figma Plugin API Code Generator =====
  function generateFigmaPluginCode(tokens, seed) {
    const collections = {
      Primitives: [],
      Tokens: [],
    };

    Object.values(tokens).forEach((token) => {
      if (token.type !== "color") return;
      const target = token.tier === "primitive" ? "Primitives" : "Tokens";
      const figmaName = token.figma.variable;
      const lightVal = tokenValue(token, "light", tokens);
      const darkVal = tokenValue(token, "dark", tokens);
      if (lightVal && darkVal && !lightVal.startsWith("rgba") && !darkVal.startsWith("rgba") && !lightVal.startsWith("{")) {
        collections[target].push({ name: figmaName, light: lightVal, dark: darkVal });
      }
    });

    const lines = [
      "// Auto-generated by Design System Generator v2",
      "// Paste into Figma Plugin Console or use_figma tool",
      "",
      "function hexToFigmaRgb(hex) {",
      "  const r = parseInt(hex.slice(1,3), 16) / 255;",
      "  const g = parseInt(hex.slice(3,5), 16) / 255;",
      "  const b = parseInt(hex.slice(5,7), 16) / 255;",
      "  return { r, g, b };",
      "}",
      "",
    ];

    for (const [colName, vars] of Object.entries(collections)) {
      if (vars.length === 0) continue;
      lines.push(`// ===== ${colName} (${vars.length} variables) =====`);
      lines.push(`const ${colName.toLowerCase()}Col = figma.variables.createVariableCollection('${colName}');`);
      lines.push(`${colName.toLowerCase()}Col.renameMode(${colName.toLowerCase()}Col.modes[0].modeId, 'Light');`);
      lines.push(`const ${colName.toLowerCase()}DarkModeId = ${colName.toLowerCase()}Col.addMode('Dark');`);
      lines.push("");

      for (const v of vars) {
        const varName = `v_${v.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`const ${varName} = figma.variables.createVariable('${v.name}', ${colName.toLowerCase()}Col, 'COLOR');`);
        lines.push(`${varName}.setValueForMode(${colName.toLowerCase()}Col.modes[0].modeId, hexToFigmaRgb('${v.light}'));`);
        lines.push(`${varName}.setValueForMode(${colName.toLowerCase()}DarkModeId, hexToFigmaRgb('${v.dark}'));`);
      }
      lines.push("");
    }

    lines.push("return 'Done: created ' + " +
      Object.entries(collections).map(([k, v]) => `'${k}: ${v.length}'`).join(" + ', ' + ") + ";");

    return lines.join("\n");
  }

  // ===== v2: Resolve all token values for contrast checking =====
  function resolveAllTokenValues(tokens) {
    const resolved = {};
    Object.entries(tokens).forEach(([name, token]) => {
      if (token.type === "color") {
        resolved[name] = {
          light: tokenValue(token, "light", tokens),
          dark: tokenValue(token, "dark", tokens),
        };
      }
    });
    return resolved;
  }

  Object.assign(window, {
    DesignTokens: {
      paletteLabels,
      fontStacks,
      fontLabels,
      defaultAuxiliaryColors,
      normalizeAuxiliaryColors,
      generateTokens,
      normalizeHex,
      tokenValue,
      cssValue,
      // v2 additions
      setNamingStrategy,
      contrastRatio,
      wcagLevel,
      checkContrastPairs,
      resolveAllTokenValues,
      generateFigmaPluginCode,
      buildAuxiliaryScale,
      getTypeScale,
      rgbToOklch,
      oklchToHex,
    },
  });
})();
