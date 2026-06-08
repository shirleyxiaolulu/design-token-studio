# 设计规范生成器 Design Token Studio

从品牌色一键生成完整的 Design Token 体系，支持导出 JSON / CSS / Less / TS，配合 Figma 插件同步变量库。

## 在线使用

**打开主页：https://shirleyxiaolulu.github.io/design-token-studio/** —— 介绍页，点「打开工具」进入生成器（也可直达 https://shirleyxiaolulu.github.io/design-token-studio/app.html ）。

> 站点结构：`index.html` = 介绍落地页，`app.html` = 生成器工具本体。

内设多模式 light/dark，需要 figma 付费账号才能使用（教育版都可以）

无需安装，浏览器打开即可。数据保存在你的浏览器本地，不会上传到任何服务器。

## 使用流程

### 第一步：配置设计规范

1. 打开上面的链接
2. 左侧栏设置品牌主色、设计场景（iOS / Web）、默认模式（Light / Dark）等参数
3. 中间预览区实时展示所有 Token：色板、语义色、字体、圆角、阴影、间距

### 第二步：导出

1. 左侧「导出」面板选择格式（JSON / CSS / Less / TS）
2. 点击「复制」或「下载」

### 第三步：同步到 Figma（可选）

1. 在 Figma 中安装 `Design System v2` 插件（👇查看最后一步figma插件安装👇）
3. 打开插件 → 粘贴第二步复制的 JSON
4. 点击「同步 Figma 变量」→ 自动创建/更新变量集合
5. 点击「生成预览页」→ 在 Figma 中生成 Token 可视化文档

## 功能说明

| 功能 | 说明 |
|------|------|
| 品牌色板 | 输入主色自动生成 10 阶梯度，精确保留原始色值 |
| 语义色 | 8 个品牌梯度 + 功能色 + 文本 8 级 + 背景 + 边框 + 常量 |
| 辅助色 | 支持添加多个辅助色，各生成 10 阶色板 |
| Light / Dark | 所有语义色自动适配双模式，品牌核心色保持一致 |
| 对比度参考 | 展示常见文字/背景配对的 WCAG 对比度 |
| 字体排印 | 支持苹方、SF Pro、鸿蒙黑体等 6 种字体方案 |
| 圆角 / 阴影 / 间距 | 可调策略，覆盖全部界面层级 |
| 多项目管理 | 右侧面板管理多个项目，支持版本记录和恢复 |

## Figma 插件安装

插件文件在 `figma-plugin/` 目录下：

1. 下载整个 `figma-plugin` 文件夹到本地
2. 打开 Figma 桌面端 → 菜单 → Plugins → Development → Import plugin from manifest
3. 选择 `figma-plugin/manifest.json`
4. 之后在任意文件中按 `Cmd + /` 搜索「Design System」即可运行

## 开发 / 测试

字号阶梯是单一数据源：只在 `tokens.js` 的 `TYPE_SCALES` 定义一次，web 预览（`app.js`）、Figma 文本样式与规范页（`figma-plugin/code.js`）、各端导出都从它派生。增删 / 改名 / 调序字号只改这一处。

零依赖回归测试（覆盖单一源一致性、行高、15/17/19 命名、颜色别名解析、深色对比度、DTCG 导出合法性）：

```bash
npm test        # 等价于 node tests/run-tests.js
```
