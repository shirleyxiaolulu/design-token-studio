(function () {
  function exportJson(seed, tokens, version) {
    return JSON.stringify({
      name: seed.specName,
      platform: seed.platform,
      version,
      seed,
      tokens,
    }, null, 2);
  }

  function exportCss(tokens, defaultMode = "light") {
    const root = [];
    const light = [];
    const dark = [];

    Object.values(tokens).forEach((token) => {
      if (token.type === "shadow") {
        root.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, defaultMode)};`);
        light.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, "light")};`);
        dark.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, "dark")};`);
        return;
      }

      if (token.type === "fontFamily" || token.type === "dimension" || token.type === "number" || token.type === "string") {
        root.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens)};`);
        return;
      }

      if (token.type === "color") {
        root.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, defaultMode)};`);
        light.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, "light")};`);
        dark.push(`  ${token.css.name}: ${DesignTokens.cssValue(token, tokens, "dark")};`);
      }
    });

    return `:root {\n${root.join("\n")}\n}\n\n[data-theme="light"] {\n${light.join("\n")}\n}\n\n[data-theme="dark"] {\n${dark.join("\n")}\n}\n`;
  }

  function exportLess(tokens) {
    return Object.values(tokens).map((token) => {
      return `@${token.name.replaceAll(".", "-")}: var(${token.css.name});`;
    }).join("\n");
  }

  function exportTs(seed, tokens, version) {
    return `export const designSystem = ${JSON.stringify({
      name: seed.specName,
      platform: seed.platform,
      version,
      tokens,
    }, null, 2)} as const;\n`;
  }

  // v2: Tailwind config export
  function exportTailwind(tokens) {
    const colors = {};
    const spacing = {};
    const borderRadius = {};

    Object.values(tokens).forEach((token) => {
      if (token.type === "color" && token.tier === "semantic") {
        const parts = token.name.replace("color.", "").split(".");
        let obj = colors;
        parts.forEach((part, i) => {
          if (i === parts.length - 1) {
            obj[part] = `var(${token.css.name})`;
          } else {
            obj[part] = obj[part] || {};
            obj = obj[part];
          }
        });
      }
      if (token.name.startsWith("space.")) {
        const key = token.name.replace("space.", "");
        spacing[key] = typeof token.value === "string" ? token.value : `${token.value}px`;
      }
      if (token.name.startsWith("radius.")) {
        const key = token.name.replace("radius.", "");
        borderRadius[key] = typeof token.value === "string" ? token.value : `${token.value}px`;
      }
    });

    return `// Auto-generated Tailwind config\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: ${JSON.stringify(colors, null, 6)},\n      spacing: ${JSON.stringify(spacing, null, 6)},\n      borderRadius: ${JSON.stringify(borderRadius, null, 6)},\n    },\n  },\n};\n`;
  }

  // v2: Figma Plugin API code export
  function exportFigmaPlugin(tokens, seed) {
    return DesignTokens.generateFigmaPluginCode(tokens, seed);
  }

  // v3: AI-friendly flat JSON — all values resolved, no aliases
  function exportAiJson(seed, tokens, version) {
    const flat = {
      _meta: {
        name: seed.specName,
        platform: seed.platform,
        defaultMode: seed.defaultMode,
        version: version,
        primaryColor: seed.primaryColor,
        generatedAt: new Date().toISOString(),
      },
      colors: { light: {}, dark: {} },
      dimensions: {},
      typography: {},
      components: {},
    };

    Object.values(tokens).forEach((token) => {
      const name = token.figma.variable;

      if (token.type === "color") {
        const light = DesignTokens.tokenValue(token, "light", tokens);
        const dark = DesignTokens.tokenValue(token, "dark", tokens);
        if (light && !light.startsWith("{")) flat.colors.light[name] = light;
        if (dark && !dark.startsWith("{")) flat.colors.dark[name] = dark;
      } else if (token.type === "dimension") {
        const val = typeof token.value === "string" ? parseInt(token.value, 10) : token.value;
        flat.dimensions[name] = val;
      } else if (token.type === "number") {
        flat.dimensions[name] = token.value;
      } else if (token.type === "fontFamily") {
        flat.typography.fontFamily = token.value;
      } else if (token.type === "string" && token.name.startsWith("motion.")) {
        flat.dimensions[name] = token.value;
      }
    });

    // Motion tokens as a readable group
    flat.motion = {};
    Object.values(tokens).forEach((t) => {
      if (t.name.startsWith("motion.")) {
        const key = t.name.replace("motion.", "");
        flat.motion[key] = { value: t.value, usage: t.usage || "" };
      }
    });

    // Font sizes as a readable group
    const fontSizes = {};
    Object.values(tokens).forEach((t) => {
      if (t.name.startsWith("font.size.")) {
        const key = t.name.replace("font.size.", "");
        fontSizes[key] = typeof t.value === "string" ? parseInt(t.value, 10) : t.value;
      }
    });
    flat.typography.sizes = fontSizes;

    // Component token mapping — common components
    flat.components = {
      "Button/Primary": {
        background: "color/brand/primary",
        text: "color/constant/white",
        backgroundHover: "color/brand/primary/hover",
        backgroundActive: "color/brand/primary/active",
        radius: "radius/md",
        paddingX: "space/4",
        paddingY: "space/2",
        fontSize: "font/size/body",
      },
      "Button/Secondary": {
        background: "color/bg/surface",
        text: "color/text/primary",
        border: "color/border/default",
        radius: "radius/md",
        paddingX: "space/4",
        paddingY: "space/2",
        fontSize: "font/size/body",
      },
      "Button/Danger": {
        background: "color/function/danger",
        text: "color/constant/white",
        radius: "radius/md",
        paddingX: "space/4",
        paddingY: "space/2",
        fontSize: "font/size/body",
      },
      "Input": {
        background: "color/bg/surface",
        text: "color/text/primary",
        placeholder: "color/text/placeholder",
        border: "color/border/default",
        borderFocus: "color/brand/primary",
        radius: "radius/md",
        paddingX: "space/3",
        paddingY: "space/2",
        fontSize: "font/size/body",
      },
      "Card": {
        background: "color/bg/surface",
        border: "color/border/subtle",
        radius: "radius/lg",
        padding: "space/4",
        shadow: "shadow/sm",
        titleSize: "font/size/title3",
        bodySize: "font/size/body",
      },
      "Tag/Default": {
        background: "color/brand/subtle",
        text: "color/brand/primary",
        radius: "radius/full",
        paddingX: "space/2",
        paddingY: "space/1",
        fontSize: "font/size/caption",
      },
      "Tag/Success": {
        background: "color/function/success-bg",
        text: "color/function/success",
        radius: "radius/full",
        paddingX: "space/2",
        paddingY: "space/1",
        fontSize: "font/size/caption",
      },
      "Tag/Danger": {
        background: "color/function/danger-bg",
        text: "color/function/danger",
        radius: "radius/full",
        paddingX: "space/2",
        paddingY: "space/1",
        fontSize: "font/size/caption",
      },
      "Avatar": {
        background: "color/brand/soft",
        text: "color/brand/primary",
        radius: "radius/full",
      },
      "Divider": {
        color: "color/border/subtle",
        thickness: 1,
      },
      "Toast": {
        background: "color/bg/elevated",
        text: "color/text/primary",
        border: "color/border/default",
        radius: "radius/lg",
        shadow: "shadow/lg",
        padding: "space/4",
      },
      "Modal": {
        background: "color/bg/elevated",
        overlay: "color/bg/overlay",
        radius: "radius/xl",
        shadow: "shadow/overlay",
        padding: "space/6",
      },
      "TabBar": {
        background: "color/bg/surface",
        activeText: "color/brand/primary",
        inactiveText: "color/text/tertiary",
        border: "color/border/subtle",
        fontSize: "font/size/caption",
      },
      "NavigationBar": {
        background: "color/bg/surface",
        title: "color/text/primary",
        icon: "color/text/secondary",
        border: "color/border/subtle",
        titleSize: "font/size/title3",
      },
      "ListItem": {
        background: "color/bg/surface",
        title: "color/text/primary",
        subtitle: "color/text/secondary",
        border: "color/border/subtle",
        paddingX: "space/4",
        paddingY: "space/3",
        titleSize: "font/size/body",
        subtitleSize: "font/size/subhead",
      },
    };

    // Design guidelines for AI
    flat.guidelines = {
      spacing: "使用 4px 基准间距。组件内 padding 用 space/2~space/4，模块间距用 space/6~space/8，页面边距用 space/4。",
      typography: "标题用 Semibold/Bold，正文用 Regular。标题和正文之间间距用 space/2，段落间距用 space/3。",
      color: "品牌色(brand.primary/hover/active)不跟随深浅模式变化。功能色只用于状态反馈，不用于装饰。文本至少 4 级层次(primary/secondary/tertiary/quaternary)。",
      radius: "按钮和输入框用 radius/md，卡片用 radius/lg，标签用 radius/full，弹窗用 radius/xl。",
      shadow: "卡片用 shadow/sm，弹窗用 shadow/lg，浮层用 shadow/overlay。深色模式下阴影效果减弱。",
      layout: "iOS 375×812 标准屏。安全区顶部 44px，底部 34px。Tab 栏高度 49px，导航栏高度 44px。",
    };

    return JSON.stringify(flat, null, 2);
  }

  // AI Prompt: concise design guidelines for pasting into any AI tool
  function exportAiPrompt(seed, tokens) {
    const T = DesignTokens;
    const platNames = { "ios-app": "iOS App (375×812)", "web-admin": "Web 后台 (1440)", "app-web": "App+Web 同步" };
    const platLabel = platNames[seed.platform] || seed.platform;

    // Collect semantic colors (resolved)
    const colorLines = [];
    const semanticPrefixes = ["color.brand.", "color.function.", "color.text.", "color.bg.", "color.border.", "color.constant."];
    semanticPrefixes.forEach((prefix) => {
      Object.values(tokens).forEach((t) => {
        if (t.name.startsWith(prefix) && t.tier === "semantic") {
          const light = T.tokenValue(t, "light", tokens);
          if (light && !light.startsWith("{") && !light.startsWith("rgba")) {
            colorLines.push(`${t.name}: ${light} — ${t.usage}`);
          }
        }
      });
    });

    // Font sizes
    const fontLines = [];
    Object.values(tokens).forEach((t) => {
      if (t.name.startsWith("font.size.")) {
        fontLines.push(`${t.name}: ${t.value}px`);
      }
    });

    // Spacing
    const spaceLines = [];
    Object.values(tokens).forEach((t) => {
      if (t.name.startsWith("space.")) {
        spaceLines.push(`${t.name}: ${t.value}`);
      }
    });

    // Radius
    const radiusLines = [];
    Object.values(tokens).forEach((t) => {
      if (t.name.startsWith("radius.")) {
        radiusLines.push(`${t.name}: ${t.value}`);
      }
    });

    return `你是一位严格遵循设计规范的 UI 设计师。以下是当前项目的设计规范，生成设计稿时必须遵循。

## 项目
${seed.specName} · ${platLabel} · 品牌色 ${seed.primaryColor} · ${seed.defaultMode === "dark" ? "深色" : "浅色"}模式

## 语义色（${seed.defaultMode} 模式值）
${colorLines.join("\n")}

## 字号
${fontLines.join(" / ")}

## 间距（4px 基准）
${spaceLines.join(" / ")}

## 圆角
${radiusLines.join(" / ")}

## 组件规则
- 主按钮：brand.primary 背景 + constant.white 文字 + radius.md + 间距 space.4×space.2
- 次按钮：bg.surface 背景 + text.primary 文字 + border.default 描边 + radius.md
- 危险按钮：function.danger 背景 + constant.white 文字 + radius.md
- 输入框：bg.surface 背景 + border.default 描边 + 聚焦 brand.primary + radius.md + 间距 space.3×space.2
- 卡片：bg.surface 背景 + border.subtle 描边 + radius.lg + shadow.sm + 内边距 space.4
- 标签：brand.subtle 背景 + brand.primary 文字 + radius.full
- 列表项：bg.surface 背景 + border.subtle 底部分割 + 间距 space.4×space.3
- 弹窗：bg.elevated 背景 + shadow.overlay + radius.xl + 内边距 space.6
- 导航栏：bg.surface 背景 + text.primary 标题 + border.subtle 底部线 + 高度 44px
- Tab 栏：bg.surface 背景 + brand.primary 选中 + text.tertiary 未选中 + 高度 49px

## 动效
快速 100ms / 常规 200ms / 缓慢 350ms / 页面 500ms
缓动 cubic-bezier(0.25,0.1,0.25,1) / 弹性 cubic-bezier(0.34,1.56,0.64,1)

## 约束
- 所有颜色、字号、间距必须从以上 token 取值，禁止自创
- 原型图只提取功能结构和信息层级，不复制其布局、颜色和字号
- 间距使用 4px 倍数
- 文本至少区分 primary/secondary/tertiary 三个层级
- 品牌色（primary/hover/active）和辅助色不跟随深浅模式变化`;
  }

  function createExports(seed, tokens, version) {
    return {
      json: exportJson(seed, tokens, version),
      css: exportCss(tokens, seed.defaultMode),
      less: exportLess(tokens),
      ts: exportTs(seed, tokens, version),
      tailwind: exportTailwind(tokens),
      figmaPlugin: exportFigmaPlugin(tokens, seed),
      ai: exportAiJson(seed, tokens, version),
    };
  }

  Object.assign(window, {
    DesignExports: {
      exportJson,
      exportCss,
      exportLess,
      exportTs,
      exportTailwind,
      exportFigmaPlugin,
      exportAiJson,
      exportAiPrompt,
      createExports,
    },
  });
})();
