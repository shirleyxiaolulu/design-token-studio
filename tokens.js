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
    { id: "purple", name: "Purple", color: "#8B5CF6" },
    { id: "cyan", name: "Cyan", color: "#06B6D4" },
    { id: "pink", name: "Pink", color: "#EC4899" },
    { id: "gold", name: "Gold", color: "#F59E0B" },
    { id: "teal", name: "Teal", color: "#10B981" },
  ];

  const fontStacks = {
    pingfang: "'PingFang SC', 'Hiragino Sans GB', sans-serif",
    sf: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif",
    harmony: "'HarmonyOS Sans SC', 'HarmonyOS Sans', 'PingFang SC', sans-serif",
    misans: "'MiSans', 'PingFang SC', sans-serif",
    alimama: "'Alimama FangYuanTi VF', 'PingFang SC', sans-serif",
    system: "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
  };

  const fontLabels = {
    pingfang: {
      cjk: "苹方",
      latin: "PingFang SC",
      intro: "系统默认采用苹方 PingFang SC，保持中文界面在 macOS / iOS 设计稿中的清晰度与系统一致性。",
    },
    sf: {
      cjk: "苹方",
      latin: "SF Pro",
      intro: "系统采用 Apple 原生字体：中文使用 PingFang SC，拉丁字符使用 SF Pro，通过系统字体栈自动调用。",
    },
    harmony: {
      cjk: "鸿蒙黑体",
      latin: "HarmonyOS Sans",
      intro: "适合偏 Android / HarmonyOS 的跨端界面，中文与拉丁字符都保持中性、清晰的几何结构。",
    },
    misans: {
      cjk: "MiSans",
      latin: "MiSans",
      intro: "适合年轻、轻量的移动产品界面，字形紧凑，适合高信息密度页面。",
    },
    alimama: {
      cjk: "阿里妈妈方圆体",
      latin: "Alimama",
      intro: "更有品牌感和圆润特征，适合希望在标题和运营页面里增加识别度的设计系统。",
    },
    system: {
      cjk: "系统默认",
      latin: "System UI",
      intro: "跟随设备系统字体，适合希望减少字体依赖并保持平台原生体验的界面。",
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

  function slugifyAuxiliaryName(name, fallback) {
    const raw = String(name || fallback || "auxiliary").trim().toLowerCase();
    const slug = raw
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || fallback || "auxiliary";
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
    return buildScale(hsl.h, hsl.s);
  }

  function normalizeAuxiliaryColors(items) {
    const source = Array.isArray(items) && items.length ? items : defaultAuxiliaryColors;
    const used = {};
    return source.map((item, index) => {
      const fallback = defaultAuxiliaryColors[index]?.id || `auxiliary-${index + 1}`;
      const name = String(item?.name || fallback).trim() || fallback;
      let id = slugifyAuxiliaryName(item?.id || name, fallback);
      if (used[id]) id = `${id}-${index + 1}`;
      used[id] = true;
      return {
        id,
        name,
        color: normalizeAuxHex(item?.color),
      };
    });
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
    const primaryHsl = rgbToHsl(hexToRgb(seed.primaryColor));
    const neutralHue = getNeutralHue(seed.neutralStrategy, primaryHsl.h);
    const palette = {
      primary: buildScale(primaryHsl.h, primaryHsl.s, "color", primaryHsl.l, primaryHsl.s),
      gray: buildScale(neutralHue, seed.neutralStrategy === "warm" ? 9 : 12, "gray"),
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

  function typography(platform, base, fontStack) {
    if (platform === "ios-app") {
      return {
        "font.family.base": {
          value: fontStack,
          usage: "iOS 界面默认字体栈",
        },
        "font.size.mini": { value: 10 },
        "font.size.caption": { value: 11 },
        "font.size.footnote": { value: 12 },
        "font.size.subhead": { value: 13 },
        "font.size.body": { value: 14 },
        "font.size.title3": { value: 16 },
        "font.size.title2": { value: 18 },
        "font.size.title1": { value: 22 },
        "font.size.largeTitle": { value: 28 },
        "font.lineHeight.body": { value: 22 },
      };
    }

    return {
      "font.family.base": {
        value: fontStack,
        usage: "Web 后台默认字体栈",
      },
      "font.size.xs": { value: 12 },
      "font.size.sm": { value: 13 },
      "font.size.md": { value: base },
      "font.size.lg": { value: 16 },
      "font.size.xl": { value: 20 },
      "font.size.2xl": { value: 24 },
      "font.size.3xl": { value: 32 },
      "font.lineHeight.body": { value: Math.round(base * 1.55) },
    };
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
        return name.replace("color.custom.", "color/auxiliary/").replaceAll(".", "/");
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
        return name.replace("color.custom.", "primitive/color/auxiliary/").replaceAll(".", "/");
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

    const commonColors = {
      "color.common.white": ["#FFFFFF", "#FFFFFF", "基础白色"],
      "color.common.black": ["#000000", "#000000", "基础黑色"],
      "color.common.dark.page": ["#101216", "#101216", "深色页面背景原始值"],
      "color.common.dark.surface": ["#181B20", "#181B20", "深色容器背景原始值"],
      "color.common.dark.elevated": ["#20242B", "#20242B", "深色浮层背景原始值"],
      "color.common.dark.overlay": ["#000000", "#000000", "深色遮罩原始值 (72%透明度)"],
      "color.common.overlay": ["#0F172A", "#0F172A", "浅色遮罩原始值 (48%透明度)"],
      "color.common.dark.border.default": ["#303640", "#303640", "深色默认描边原始值"],
      "color.common.dark.border.subtle": ["#252A32", "#252A32", "深色弱描边原始值"],
      "color.common.dark.border.strong": ["#4A5361", "#4A5361", "深色强描边原始值"],
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
      "color.function.success": ["color.palette.green.5", "color.palette.green.4", "成功反馈"],
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
        dark: `{color.custom.${item.id}.dark}`,
      }, `${item.name} 辅助色`, {
        tier: "semantic",
        alias: { light: `color.custom.${item.id}`, dark: `color.custom.${item.id}` },
        auxiliaryName: item.name,
      });
    });

    Object.entries(typography(seed.platform, seed.baseFontSize, seed.fontStack)).forEach(([name, item]) => {
      tokens[name] = makeToken(name, name.includes("family") ? "fontFamily" : "dimension", item.value, item.usage || "字体变量", { tier: "primitive" });
    });

    const radiusNames = ["none", "xs", "sm", "md", "lg", "xl", "full"];
    radiusScale(seed.radiusScale).forEach((value, index) => {
      const name = `radius.${radiusNames[index]}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "圆角变量", { tier: "primitive" });
    });

    const spaces = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 };
    Object.entries(spaces).forEach(([step, value]) => {
      const name = `space.${step}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "间距变量", { tier: "primitive" });
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

    // ===== v2: Spacing Extras =====
    const extraSpaces = { 16: 64, 20: 80 };
    Object.entries(extraSpaces).forEach(([step, value]) => {
      const name = `space.${step}`;
      tokens[name] = makeToken(name, "dimension", `${value}px`, "大间距变量", { tier: "primitive" });
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

    if (seed.platform === "ios-app") {
      const iosTokens = {
        "ios.screen.background": ["color.bg.page", semanticColors["color.bg.page"]],
        "ios.safeArea.background": ["color.bg.surface", semanticColors["color.bg.surface"]],
        "ios.navigation.background": ["color.bg.surface", semanticColors["color.bg.surface"]],
        "ios.navigation.title": ["color.text.primary", semanticColors["color.text.primary"]],
        "ios.tabbar.background": ["color.bg.elevated", semanticColors["color.bg.elevated"]],
        "ios.card.background": ["color.bg.surface", semanticColors["color.bg.surface"]],
        "ios.list.item.background": ["color.bg.surface", semanticColors["color.bg.surface"]],
        "ios.divider.default": ["color.border.subtle", semanticColors["color.border.subtle"]],
        "ios.sheet.background": ["color.bg.elevated", semanticColors["color.bg.elevated"]],
        "ios.overlay.mask": ["color.bg.overlay", semanticColors["color.bg.overlay"]],
      };

      Object.entries(iosTokens).forEach(([name, [alias, [, , usage]]]) => {
        tokens[name] = makeToken(name, "color", {
          light: `{${alias}.light}`,
          dark: `{${alias}.light}`,
        }, usage, { tier: "semantic", alias: { light: alias, dark: alias } });
      });
    }

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
    },
  });
})();
