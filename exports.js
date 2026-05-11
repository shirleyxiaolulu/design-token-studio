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

      if (token.type === "fontFamily" || token.type === "dimension" || token.type === "number") {
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

  function createExports(seed, tokens, version) {
    return {
      json: exportJson(seed, tokens, version),
      css: exportCss(tokens, seed.defaultMode),
      less: exportLess(tokens),
      ts: exportTs(seed, tokens, version),
      tailwind: exportTailwind(tokens),
      figmaPlugin: exportFigmaPlugin(tokens, seed),
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
      createExports,
    },
  });
})();
