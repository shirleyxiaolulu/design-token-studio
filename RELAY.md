# 设计规范生成器 v2 接力文档

## 项目路径
- **v2 Web 工具**: `/Users/shirley/Documents/design-system-generator-v2/`
- **Figma 文件**: `KlpBuE1r1Fwg6Z234imV5V`
- **现有预览页节点**: `1:179` (Page 1 上, 1180×8808px)

## v2 已完成的改动

### tokens.js (核心引擎)
- **BUG 修复**: 深色模式语义色引用 `.dark` → `.light`，修复 text.primary 对比度 1.13→17.48
- **WCAG 对比度检测**: `contrastRatio` / `checkContrastPairs` / `wcagLevel`
- **命名策略**: `setNamingStrategy('flat'|'prefixed')` — flat 生成 `color/brand/primary`
- **组件级语义色**: text.link / bg.brand / bg.disabled / function.*-bg (7个)
- **Opacity 变量**: hover(0.08) / pressed(0.12) / disabled(0.38) / overlay(0.5) / subtle(0.04)
- **辅助色完整色板**: 每个辅助色生成 10 阶
- **大间距**: space.16(64px) / space.20(80px)
- **Figma Plugin 代码生成**: `generateFigmaPluginCode(tokens, seed)`

### exports.js
- Tailwind 配置导出
- Figma Plugin API 代码导出

### index.html + styles.css + app.js
- 对比度检测面板 (WCAG 2.1)
- Opacity 预览区
- 命名策略选择器
- Tailwind / Figma API 导出 Tab

## 待完成：Figma 预览页生成器

### 现有预览页结构 (节点 1:179)
```
Token Preview / 未命名规范 2 / draft
├── 标题 + 版本 + 描述 (3 个 TEXT)
├── 01 / 色彩系统
│   ├── Brand Scale — Primary (10 色块, 2行×5列, 每块 108px)
│   ├── Auxiliary Colors (5 色块)
│   ├── Neutrals / Gray (10 色块, 2行×5列, 每块 94px)
│   ├── Functional & Warm Accents (5 色块: Success/Warning/Danger/Info/Brand)
│   └── Extended Palette (7组×10色: red/orange/yellow/green/cyan/blue/purple, 每块 70px)
├── 02 / 语义色
│   ├── Brand (10行)
│   ├── Function (12行)
│   ├── Text (11行)
│   ├── Background (13行)
│   ├── Border (11行)
│   ├── Constant (10行)
│   ├── iOS (9行)
│   └── Opacity + Extra (17行)
├── 03 / 字体排版
│   ├── 字体卡片 ×2 (CJK + Latin)
│   └── Type Scale 表格 (48 行)
├── 04 / 圆角 (7 个圆角预览块)
├── 05 / 阴影 (5 个阴影预览块)
└── 06 / 间距与栅格 (10 个间距预览条)
```

### 预览页规格
- 画布: 1180×8808, 深色背景 rgb(7,8,10)
- 无 auto-layout, 绝对定位
- 每个章节: 编号标签(Inter Regular 12) + 标题(Inter Semi Bold 32) + 描述(Inter Regular 14) + 分割线
- 色块: FRAME + 内部颜色矩形(绑定变量) + 标签文本
- 语义色行: 5列(色块+名称+默认值+Light值+Dark值+用途)

### 已完成
- ✅ **Step 1**: 生成 v2 tokens JSON → `/tmp/v2-tokens.json`
- ✅ **Step 2**: 更新 Figma Variables — Primitives 193个 + Tokens 44个 = 237个
  - 修复了 text/primary 深色模式值: 1D1E25 → F6F7F8 (对比度 1.13→17.48)
  - 新增 50 个辅助色完整色板 (5色×10阶)
  - 更新了全部语义色的 dark 模式值

### 已完成 (2026-05-10)
3. ✅ **Step 3**: 重新生成预览页 6 个章节 (1180×6524px)
   - 色彩系统: Brand Scale(10) + Auxiliary(5) + Gray(10) + Functional(5) + Extended(7×10=70)
   - 语义色: 9 个分类 (Brand/Function/Text/Auxiliary/Background/Border/Constant/iOS/Opacity)
   - 字体排版: 2 字体卡 + iOS Type Scale 9 级
   - 圆角: 7 级圆角预览块
   - 阴影: 5 级阴影预览块 (含 CSS 值)
   - 间距: 12 级间距条 (含 v2 新增 space.16/20)
   - 所有色块绑定 Figma Variables，支持变量别名自动解析
4. ✅ **Step 4**: 一键换肤功能
   - 输入新品牌色 hex → 重算 9 系×10 阶 = 90 个色板变量 + 50 辅助色阶
   - 语义色通过变量别名 (alias) 自动跟随更新
   - 已测试: #6533E8 ↔ #2563EB 切换验证通过

### 变量集合结构 (已更新)
- **Primitives (193)**: 色板(9系×10阶=90) + common(10) + auxiliary base(5) + auxiliary scale(50) + 字体/圆角/间距/zIndex(38)
- **Tokens (44)**: 语义色(28) + iOS(10) + 其他(6)
- **Modes**: Light / Dark
- **品牌色**: #6533E8
- **验证**: text/primary dark = rgb(246,247,248) ✅

## Figma 组件库状态
- 84 个组件集, 1145 个变体
- 已分 6 页: Foundation / Data Display / Navigation / Feedback / Business / 51 Drama
- 组件名已加 `/` 前缀

## 用户习惯
- 中文交流
- "继续" = 信任执行
- 不需要二次确认
- 组件 wrapper 风格: 浅色背景 + 标题(32px) + 中文副标题(14px) + 网格排列
