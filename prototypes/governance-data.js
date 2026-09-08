(function (root) {
    const details = {
      color: {
        label: "颜色",
        title: "颜色 48 种",
        meta: "17 种可合并为 6 组 · 23 处未绑定",
        chips: [
          "#111928 ×23", "#111827 ×16", "#101827 ×8", "#FFFFFF ×44", "#F7F8FA ×18", "#9BC814 ×12", "#93BF10 ×7", "#FF7070 ×3",
          "#2F80ED ×2", "#CBD5E1 ×21", "#0F172A ×19", "#1E293B ×15", "#334155 ×11", "#475569 ×9", "#64748B ×14", "#94A3B8 ×13",
          "#E2E8F0 ×17", "#F1F5F9 ×20", "#F8FAFC ×22", "#000000 ×31", "#FEF3C7 ×4", "#F59E0B ×5", "#D97706 ×2", "#FEE2E2 ×6",
          "#EF4444 ×4", "#B91C1C ×2", "#DCFCE7 ×7", "#22C55E ×5", "#15803D ×2", "#DBEAFE ×8", "#3B82F6 ×6", "#1D4ED8 ×3",
          "#EDE9FE ×5", "#8B5CF6 ×4", "#6D28D9 ×2", "#FCE7F3 ×3", "#EC4899 ×2", "#BE185D ×1", "#FFF398 ×6", "#FFE7C4 ×5",
          "#FFE69F ×4", "#FFD897 ×3", "#F1D8BC ×2", "#F3BA65 ×7", "#9D7A46 ×3", "#7E571D ×2", "#051C48 ×5", "#082351 ×4"
        ],
        issue: ["未绑定颜色", "#111928 ×23 → color/text/primary"]
      },
      font: {
        label: "字体",
        title: "字体 4 种",
        meta: "共 179 处使用",
        chips: ["PingFang SC ×126", "Inter ×42", "Arial ×8", "SF Pro ×3"],
        issue: ["字体使用情况", "4 种字体 · 179 处使用"],
        replace: true
      },
      type: {
        label: "字号",
        title: "字号 14 档",
        meta: "3 个小数值默认修正 · 整数偏离项可选",
        chips: ["11", "12", "13", "14", "15", "15.5", "16", "17", "17.5", "18", "19", "19.5", "20", "24"],
        issue: ["字号整理", "只自动修正小数值"]
      },
      radius: {
        label: "圆角",
        title: "圆角 28 种",
        meta: "3 个小数值默认修正 · 整数收敛可选",
        chips: ["0", "1", "2", "3.5", "4", "5", "6", "7.5", "8", "9", "10", "11.5", "12", "14", "15", "16", "18", "20", "22", "24", "28", "32", "36", "40", "48", "56", "64", "999"],
        issue: ["圆角整理", "只自动修正小数值"]
      },
      space: {
        label: "间距",
        title: "间距 34 种",
        meta: "7px / 13px / 19px 等偏离 4pt 网格",
        chips: ["2", "3", "4", "5", "6", "7", "8", "10", "11", "12", "13", "14", "16", "18", "19", "20", "22", "24", "28", "30", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96", "120", "144"],
        issue: ["间距偏离网格", "7 / 13 / 19px → 最近 4pt 网格"]
      },
      shadow: {
        label: "阴影",
        title: "阴影 9 种",
        meta: "4 种视觉接近，可合并",
        chips: ["0 2 8 / 12%", "0 4 12 / 14%", "0 6 18 / 16%", "0 8 24 / 18%", "0 10 28 / 20%", "0 12 32 / 20%", "0 18 48 / 22%", "0 24 64 / 25%", "0 34 90 / 28%"],
        issue: ["阴影重复", "4 组近似参数 → 合并为 2 组"]
      }
    };
    const tokenReview = [
      { title: "主色", count: 8, rows: [
        ["primary.50", "#FFF398", "#FFF398"], ["primary.100", "#FFE7C4", "#FFE7C4"],
        ["primary.200", "#FFE69F", "#FFE69F"], ["primary.300", "#FFD897", "#FFD897"],
        ["primary.400", "#F1D8BC", "#F1D8BC"], ["primary.500", "#F3BA65", "#F3BA65"],
        ["primary.600", "#9D7A46", "#9D7A46"], ["primary.700", "#7E571D", "#7E571D"]
      ]},
      { title: "中性色", count: 5, rows: [
        ["neutral.50", "#FFFFFF", "#FFFFFF"], ["neutral.100", "#D9D9D9", "#D9D9D9"],
        ["neutral.200", "#666666", "#666666"], ["neutral.300", "#0A0A0A", "#0A0A0A"],
        ["neutral.400", "#000000", "#000000"]
      ]},
      { title: "功能色", count: 2, rows: [
        ["warning", "#FFE81A", "#FFE81A"], ["info", "#001947", "#001947"]
      ]},
      { title: "强调色", count: 4, rows: [
        ["accent.1", "#051C48", "#051C48"], ["accent.2", "#0B2A5A", "#0B2A5A"],
        ["accent.3", "#052147", "#052147"], ["accent.4", "#082351", "#082351"]
      ]},
      { title: "字体", count: 4, rows: [
        ["font.family.primary", "PingFang SC", "Aa"], ["font.family.latin", "Inter", "Aa"],
        ["font.family.outlier", "Arial", "Aa"], ["font.family.apple", "SF Pro", "Aa"]
      ]},
      { title: "字号角色", count: 5, rows: [
        ["font.size.caption", "12", "Aa"], ["font.size.body", "16", "Aa"],
        ["font.size.subtitle", "20", "Aa"], ["font.size.title", "24", "Aa"],
        ["font.size.display", "32", "Aa"]
      ]},
      { title: "圆角", count: 3, rows: [
        ["radius.sm", "4", "Aa"], ["radius.md", "8", "Aa"], ["radius.full", "999", "Aa"]
      ]},
      { title: "间距", count: 2, rows: [
        ["space.8", "8", "Aa"], ["space.16", "16", "Aa"]
      ]}
    ];
    const fontMappings = {
      "PingFang SC": { target: "", weight: "auto", count: 126, selected: false, weights: [["Regular", 86], ["Medium", 32], ["Semibold", 8]], weightMap: { Regular: "Regular", Medium: "Medium", Semibold: "Semibold" } },
      "Inter": { target: "", weight: "auto", count: 42, selected: false, weights: [["Regular", 24], ["Medium", 12], ["Semibold", 6]], weightMap: { Regular: "Regular", Medium: "Medium", Semibold: "Semibold" } },
      "Arial": { target: "", weight: "auto", count: 8, selected: false, weights: [["Regular", 6], ["Bold", 2]], weightMap: { Regular: "Regular", Bold: "Bold" } },
      "SF Pro": { target: "", weight: "auto", count: 3, selected: false, weights: [["Regular", 2], ["Medium", 1]], weightMap: { Regular: "Regular", Medium: "Medium" } }
    };
    const availableFonts = {
      "PingFang SC": ["Regular", "Medium", "Semibold"],
      "Inter": ["Regular", "Medium", "Semibold", "Bold"],
      "Arial": ["Regular", "Bold"],
      "SF Pro": ["Regular", "Medium", "Semibold", "Bold"],
      "HarmonyOS Sans": ["Regular", "Medium", "Bold"],
      "MiSans": ["Light", "Regular", "Medium", "Semibold", "Bold"],
      "Noto Sans SC": ["Regular", "Medium", "Bold"],
      "Source Han Sans SC": ["Regular", "Medium", "Bold"]
    };


  const data = { details, tokenReview, fontMappings, availableFonts };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.GovernanceData = data;
})(typeof globalThis !== "undefined" ? globalThis : this);

