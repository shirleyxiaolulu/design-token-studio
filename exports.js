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
        componentsUsageVersion: "2026-06-04",
      },
      // Usage rules embedded so this file is self-contained: drop it in a folder
      // and the AI gets both the rules and the data in one read.
      _instructions: exportAiPrompt(seed, tokens),
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
    // fontFamilyFigma is pinned to a Figma-available font on purpose: the AI cannot
    // load system fonts like PingFang SC in Figma, so component text uses Noto Sans SC.
    // The spec's intended font stays in typography.fontFamily; to actually use it,
    // upload that font to Figma as a shared/team font. fontWeightMapping reflects that
    // Noto Sans SC has no standalone Semibold (it falls back to Medium).
    flat.typography.fontFamilyFigma = "Noto Sans SC";
    flat.typography.fontWeightMapping = { Regular: "Regular", Medium: "Medium", Semibold: "Medium" };
    flat.typography.sizes = fontSizes;

    // Component-usage catalog — the project's real Figma library (synced from
    // tested AI JSON 2026-06-04). Each entry documents what the
    // component is for so the AI picks the right one. Update componentsUsageVersion when changed.
    var COMPONENT_USAGE_CATALOG = {
      "Business/VideoCard": { usage: "视频卡片：封面+时长角标+标题+播放数据。Layout=tag-vertical(竖图)/tag-horizontal(横排)/cover-horizontal/cover-vertical × Platform × Size" },
      "Business/VideoPlayer": { usage: "视频播放器：画面+中央播放键+底部进度控制栏。State=paused/playing/ad × Platform" },
      "Business/VideoGrid": { usage: "视频网格/列表：Layout=grid(双列宫格)/vertical-grid(竖版三列)/list-tag(带标签列表行)/list-icon(带图标列表行)，含封面+标题+数据" },
      "Business/CommentList": { usage: "评论列表项：头像/昵称/正文/时间/点赞，Type=comment(单条)/reply(含子回复)" },
      "Business/CommentInput": { usage: "评论输入栏（贴底通栏）：State=default/replying(引用回复)" },
      "Business/PostCard": { usage: "社区帖子卡片：作者行+正文+互动栏。Layout=text/image(单图)/gallery(多图宫格)" },
      "Business/UserProfile": { usage: "用户信息行：头像+昵称+签名(+关注按钮)。Size=compact(列表用)/full(卡片用)" },
      "Business/ProfileHeader": { usage: "个人主页头部：头像/昵称/ID/签名/三项统计/关注按钮/内部tab行。Variant=self/other。Boolean属性：showBio/showStats/showStat4/showTabs 可裁剪模块" },
      "Business/ProfileFeatureGrid": { usage: "个人页功能宫格入口（钱包/历史/设置等图标矩阵）" },
      "Business/TopicTag": { usage: "话题标签胶囊：Variant=default/hot/new × Size=sm/md" },
      "Business/NewsCard": { usage: "新闻/资讯卡片：标题+来源+时间+阅读数。Layout=large(大图)/three-image(三图)/text(纯文右缩略图)。自带16px内边距，直接FILL" },
      "Business/Banner": { usage: "运营横幅轮播图（含指示点）。无内边距，需16px Wrapper 包裹" },
      "Business/ArticleHeader": { usage: "文章详情页头部：标题+作者行+时间" },
      "Business/NotificationItem": { usage: "通知列表项：Type=system/reply/like，图标+标题+摘要+时间" },
      "Business/EpisodeList": { usage: "剧集选集：Layout=grid(数字宫格)/scroll(横滑卡片)" },
      "Business/DanmakuOverlay": { usage: "弹幕浮层：Density=normal/dense，叠加在播放器上" },
      "Business/LiveBadge": { usage: "直播状态徽标：State=live/replay/upcoming × Size=sm/md" },
      "Business/ShortVideoOverlay": { usage: "竖版短视频叠加层：右侧点赞/评论/分享操作列+底部作者信息" },
      "Business/ChatList": { usage: "聊天会话列表(整列表组件)：顶部快捷入口行(关注/系统消息/群消息/私信)+会话行(头像44/昵称/消息预览/右侧时间+未读角标，已右对齐)。多余行可用 visible=false 隐藏" },
      "Business/ChatBubble": { usage: "聊天气泡：Side=received/sent/center × Type=text/image/voice/system/recalled" },
      "Business/VIPCard": { usage: "会员开通入口横幅：Variant=inactive/active，渐变底+按钮" },
      "Business/MessageGroupItem": { usage: "消息分组入口行：Type=follow/like/collect/system，左圆形图标+标题/摘要+右侧时间和红点(右对齐)。子层命名 icon/content/spacer/meta" },
      "Business/VideoPublishForm": { usage: "视频发布表单：标题输入+封面/视频上传位+发布按钮。State=default/editing" },
      "Business/ChatInput": { usage: "聊天输入栏（贴底）：输入框+表情+发送" },
      "Business/FollowButton": { usage: "关注按钮：State=default(+关注)/following(已关注)/mutual(互相关注) × sm/md" },
      "Business/LikeButton": { usage: "点赞按钮：State=default/liked × sm/md" },
      "Business/BookmarkButton": { usage: "收藏按钮：State=default/saved × sm/md" },
      "Business/FAB": { usage: "浮动操作按钮：Variant=plus(圆形+)/publish(胶囊发布) × md/lg" },
      "Business/ImagePicker": { usage: "图片选择器：相册横滑缩略图行+拍照入口" },
      "Business/iPhone-status-bar(upper)": { usage: "iOS 顶部状态栏 375 通栏：Dark-mode=false/true" },
      "Business/iPhone-status-bar(lower)": { usage: "iOS 底部 Home Indicator：Dark-mode=false/true" },
      "51 Drama/AdBanner": { usage: "广告横幅（图片占位整卡）：Size=md/lg" },
      "51 Drama/AdGrid": { usage: "广告宫格：Columns=6/4，375通栏自带16px内边距" },
      "51 Drama/CategoryFilterRow": { usage: "分类筛选行：Rows=single/multi，375通栏" },
      "51 Drama/ActorCard": { usage: "演员卡片：头像+姓名+角色，Layout=detail 为列表行无底色" },
      "51 Drama/RankingItem": { usage: "榜单行：排名号+封面+标题+热度，Rank=top3(彩色名次)/normal" },
      "51 Drama/DramaDetailCard": { usage: "短剧详情卡：封面+标题+标签+简介，列表行无底色" },
      "51 Drama/ReservationCard": { usage: "预约卡片(白底圆角悬浮卡343)：封面+标题+预约按钮，State=pending/available" },
      "51 Drama/AdPopup": { usage: "全屏广告弹窗：图片位+关闭按钮" },
      "51 Drama/CoinBalance": { usage: "金币余额条 375 通栏：金币图标+余额+充值按钮。State=default/low(红字余额不足)" },
      "51 Drama/RechargeCard": { usage: "充值套餐卡 109 宽(343内容区三列)：金币数+赠送+价格。State=default/selected(品牌描边)/hot(首充角标)" },
      "51 Drama/LockedEpisodeOverlay": { usage: "剧集付费蒙层(深色85%遮罩)：锁图标+说明+解锁按钮。Type=coin(金币+看广告双按钮)/ad(仅广告)" },
      "51 Drama/UnlockSheet": { usage: "解锁底部弹层：单集/全剧选项+余额行+CTA。State=default/insufficient(余额不足变去充值)" },
      "51 Drama/PaymentSheet": { usage: "支付方式弹层：金额+微信/支付宝单选+支付按钮。Selected=wechat/alipay" },
      "Navigation/MobileNavBar": { usage: "移动端导航栏48h：Layout=back+title/back+title+actions/logo+actions/logo+search(展开搜索框) × Variant=default/elevated。title 为 TEXT 属性可 setProperties 覆盖" },
      "Navigation/TabBar": { usage: "底部标签栏56h：ItemCount=3/4/5 × hasLabel，图标+文字" },
      "Navigation/CategoryNav": { usage: "顶部分类tab行40h：Variant=scrollable/fixed，首个为选中态(品牌色+下划线)" },
      "Navigation/SearchBar": { usage: "搜索框：State=default/focus(含联想面板)/filled(已输入)" },
      "Navigation/SearchHistory": { usage: "搜索历史+热搜区块，375通栏自带内边距" },
      "Navigation/FilterBar": { usage: "筛选条：Variant=tabs/dropdown，375通栏" },
      "Navigation/SegmentedControl": { usage: "分段控制器(iOS风格圆角切换)" },
      "Navigation/Breadcrumb": { usage: "面包屑(Web)" },
      "Pagination / Mobile": { usage: "移动端分页：Variant=Load More(按钮)/Infinite Status(加载状态行)" },
      "Navigation/BackTop": { usage: "回到顶部悬浮按钮" },
      "Navigation/AndroidStatusBar": { usage: "Android 状态栏" },
      "Data Display/ListItem": { usage: "通用列表行：Layout=text-only/icon+text/avatar+text-meta/avatar+text-action × sm/md/lg。聊天会话请优先用 Business/ChatList" },
      "Data Display/Card": { usage: "通用卡片容器：Variant=elevated/outlined × Layout=media-only/header+body/header+body+footer/media+body+footer × md/lg" },
      "Data Display/Tag": { usage: "标签：Color=neutral/primary/success/warning/danger/info × sm/md/lg × hasClose" },
      "Data Display/Badge": { usage: "徽标红点/数字角标" },
      "Data Display/Avatar": { usage: "头像(多尺寸/形状)，占位用灰色填充勿用图片" },
      "Data Display/Divider": { usage: "分割线：水平/垂直 × solid/dashed × 粗细。无内边距，列表内缩分割线需 Wrapper(paddingLeft 72)" },
      "Data Display/Statistic": { usage: "数据统计(数值+标签)" },
      "Data Display/Progress": { usage: "进度条" },
      "Data Display/Steps": { usage: "步骤条" },
      "Data Display/Skeleton": { usage: "骨架屏占位" },
      "Data Display/Timeline": { usage: "时间轴列表 375 通栏" },
      "Data Display/Collapse": { usage: "折叠面板" },
      "Data Display/RatingStars": { usage: "星级评分" },
      "Data Display/ImagePreview": { usage: "图片预览浮层" },
      "Data Display/Countdown": { usage: "倒计时" },
      "Data Display/RankList": { usage: "排行榜列表 375 通栏" },
      "Data Display/DescriptionList": { usage: "描述列表(键值对)" },
      "Data Display/Carousel": { usage: "轮播容器" },
      "Data Display/PriceTag": { usage: "价格标签(金额突出显示)" },
      "Data Display/Table": { usage: "表格(Web)" },
      "Feedback/Modal": { usage: "居中弹窗343：Size=md/lg × Layout=simple/with-icon/form/destructive" },
      "Feedback/Drawer": { usage: "侧滑抽屉" },
      "Feedback/Toast": { usage: "轻提示" },
      "Feedback/Alert": { usage: "页内警告条" },
      "Feedback/BottomSheet": { usage: "底部弹层容器(自定义内容用；支付/解锁有专用组件)" },
      "Feedback/ActionSheet": { usage: "操作菜单底部弹层" },
      "Feedback/ActionBar": { usage: "底部操作栏 375 通栏：Size=md/lg" },
      "Feedback/Empty": { usage: "空状态(插图+文案+按钮)" },
      "Feedback/Result": { usage: "结果页(成功/失败/无网络)" },
      "Feedback/Loading": { usage: "加载中" },
      "Feedback/SwipeAction": { usage: "列表左滑操作行：State=idle/swiped" },
      "Feedback/PullToRefresh": { usage: "下拉刷新头部" },
      "Feedback/InfiniteScrollLoader": { usage: "触底加载行" },
      "Feedback/Tooltip": { usage: "气泡提示(Web)" },
      "Feedback/Popover": { usage: "气泡卡片(Web)" },
      "Foundation/Button": { usage: "按钮：Platform × Type=Primary/Secondary/Tertiary/Text × sm/md/lg × State × Pill" },
      "Foundation/Input": { usage: "输入框：Platform × sm/md/lg × State=Default/Focus/Filled/Error/Disabled × 左右图标开关" },
      "Foundation/FormItem": { usage: "表单项(标签+控件+错误提示)" },
      "Foundation/PasswordInput": { usage: "密码输入框(343控件宽，12px为控件内边距非屏幕边距)" },
      "Foundation/PhoneInput": { usage: "手机号输入框(343控件宽)" },
      "Icons": { usage: "Icon/<name> 共53个，Style=line/fill 双变体，24×24，填充绑定 color/text/primary 可改色。命名见 Icons 页；组件内图标一律用 Icon/* 实例 + INSTANCE_SWAP，禁止临时画 SVG" },
    };
    // Component token mapping — built-in 15 (structured) + project catalog (usage)
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
        activeIcon: "color/brand/primary",
        inactiveIcon: "color/text/tertiary",
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
        icon: "color/text/secondary",
        accessoryIcon: "color/text/tertiary",
        border: "color/border/subtle",
        paddingX: "space/4",
        paddingY: "space/3",
        titleSize: "font/size/body",
        subtitleSize: "font/size/subhead",
      },
    };

    Object.assign(flat.components, COMPONENT_USAGE_CATALOG);

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
    const platNames = { "ios-app": "iOS App (375×812)", "web-admin": "Web 后台 (1440)", "app-web": "App+Web 同步" };
    const platLabel = platNames[seed.platform] || seed.platform;
    const modeCN = seed.defaultMode === "dark" ? "深色" : "浅色";
    const altCN = seed.defaultMode === "dark" ? "浅色" : "深色";
    const altMode = seed.defaultMode === "dark" ? "light" : "dark";

    return `你是一位严格遵循设计规范的 UI 设计师。当前项目为「${seed.specName}」，平台 ${platLabel}，品牌色 ${seed.primaryColor}。

⚠️ 默认外观模式：${modeCN}（_meta.defaultMode = "${seed.defaultMode}"）。生成的所有页面必须采用${modeCN}模式——背景、文字、组件一律从 colors.${seed.defaultMode} 取色。原型 / 线框图本身是${altCN}还是${modeCN}与此无关：即使参考原型是${altCN}的，只要规范默认为${modeCN}，就必须生成${modeCN}页面。明暗以 _meta.defaultMode 为唯一依据，严禁被原型外观带偏。

所有色值、字号、间距、组件映射的具体数据在 AI JSON 中，此处只说明使用规则。

## 如何使用设计规范

1. 颜色只从 JSON 的 colors.${seed.defaultMode} 取值（与默认模式一致），不要用另一套 colors.${altMode}，更不要自创颜色。语义色按名称含义使用（brand 用于品牌表达，function 用于状态反馈，text 用于文字层级，bg 用于背景层级）。
   - 图标颜色没有独立 token，直接复用 text 文本色：主图标 = text.primary，次要图标 = text.secondary，弱化图标 = text.tertiary，禁用图标 = text.disabled，品牌强调图标 = brand.primary，深色 / 品牌底上的图标 = constant.white；状态类图标（成功 / 警告 / 危险）= function.success / warning / danger。
2. 品牌色（brand.primary / hover / active）和辅助色在深浅模式下保持不变，不要调亮或调暗。
3. 字号只从 JSON 的 typography.sizes 取值。标题用 Semibold 或 Bold，正文用 Regular。标题与正文之间间距用 space.2，段落间用 space.3。
   - 字体：组件与页面文字统一使用 typography.fontFamilyFigma（当前 Noto Sans SC）。不要使用 PingFang SC 等系统字体——Figma 中 AI 无法调用，会导致文字改不了。字重只用 typography.fontWeightMapping 列出的（Semibold 实际回落 Medium，因此标题用 Medium 或 Bold）。若要使用规范的自选字体（typography.fontFamily），需先在 Figma 团队中将该字体上传为共享字体。
4. 间距基于 4px 倍数，只从 JSON 的 dimensions 中 space/* 取值。组件内 padding 用 space.2~space.4，模块间距用 space.6~space.8，页面边距用 space.4。
5. 圆角：按钮和输入框用 radius.md，卡片用 radius.lg，标签和头像用 radius.full，弹窗用 radius.xl。
6. 阴影：卡片用 shadow.sm，弹窗用 shadow.lg，浮层用 shadow.overlay。
7. 组件结构参考 JSON 的 components 映射，每个组件的背景、文字、描边、圆角、间距都已定义。
8. 动效参考 JSON 的 motion 对象。微交互用 fast，常规过渡用 normal，展开收起用 slow，页面切换用 slower。
9. 原型图只提取功能结构和信息层级，不复制其布局、颜色、字号和明暗模式——设计稿的视觉表现（含明暗）必须来自设计规范；原型是${altCN}的也不影响最终采用${modeCN}。
10. 文本至少区分 primary / secondary / tertiary 三个层级，确保信息有清晰的视觉优先级。${seed.platform === "ios-app" ? "\n11. iOS 安全区：顶部 44px，底部 34px。导航栏高度 44px，Tab 栏高度 49px。" : ""}`;
  }

  // v4: W3C Design Tokens (DTCG) — interoperable with Tokens Studio / Style
  // Dictionary / Figma variable importers. Colors resolve to the default mode's
  // concrete value (no aliases); both modes are kept under $extensions so
  // multi-mode tools can still read them. Dimensions use the "Npx" string form
  // for broad tool compatibility. font.size carries role/weight/lineHeight.
  function exportDtcg(seed, tokens, version) {
    const defaultMode = seed.defaultMode === "dark" ? "dark" : "light";
    const MODE_EXT = "com.designtokenstudio.modes";
    const TYPO_EXT = "com.designtokenstudio.typography";

    const root = {
      $description:
        `${seed.specName} · ${seed.platform} · v${version} — W3C Design Tokens (DTCG). ` +
        `颜色 / 阴影 $value 取默认模式（${defaultMode}）；两套模式见 $extensions["${MODE_EXT}"]。`,
    };

    function setDeep(path, leaf) {
      const parts = path.split(".");
      let obj = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (!obj[k] || typeof obj[k] !== "object" || "$value" in obj[k]) obj[k] = {};
        obj = obj[k];
      }
      obj[parts[parts.length - 1]] = leaf;
    }

    function dimStr(v) {
      if (typeof v === "number") return `${v}px`;
      if (typeof v === "string") {
        if (/(px|rem|em|%)$/.test(v)) return v;
        const n = parseFloat(v);
        return isNaN(n) ? v : `${n}px`;
      }
      return String(v);
    }

    function shadowArr(layers) {
      if (!Array.isArray(layers)) return null;
      return layers.map((l) => ({
        color: `rgba(${l.color},${l.alpha})`,
        offsetX: `${l.x}px`,
        offsetY: `${l.y}px`,
        blur: `${l.blur}px`,
        spread: `${l.spread}px`,
      }));
    }

    function cubicBezier(v) {
      const m = /cubic-bezier\(([^)]+)\)/.exec(String(v));
      if (!m) return null;
      const nums = m[1].split(",").map((x) => parseFloat(x.trim()));
      return nums.length === 4 && nums.every((n) => !isNaN(n)) ? nums : null;
    }

    Object.values(tokens).forEach((token) => {
      const name = token.name;
      const desc = token.usage || "";

      if (token.type === "color") {
        const light = DesignTokens.tokenValue(token, "light", tokens);
        const dark = DesignTokens.tokenValue(token, "dark", tokens);
        const def = defaultMode === "dark" ? dark : light;
        if (!def || (typeof def === "string" && def.startsWith("{"))) return; // unresolved alias
        const leaf = { $type: "color", $value: def };
        if (desc) leaf.$description = desc;
        leaf.$extensions = {};
        leaf.$extensions[MODE_EXT] = { light, dark };
        setDeep(name, leaf);
      } else if (token.type === "dimension") {
        const leaf = { $type: "dimension", $value: dimStr(token.value) };
        if (desc) leaf.$description = desc;
        if (name.indexOf("font.size.") === 0 && (token.role || token.weight || token.lineHeight)) {
          leaf.$extensions = {};
          leaf.$extensions[TYPO_EXT] = { role: token.role, weight: token.weight, lineHeight: token.lineHeight };
        }
        setDeep(name, leaf);
      } else if (token.type === "number") {
        const leaf = { $type: "number", $value: token.value };
        if (desc) leaf.$description = desc;
        setDeep(name, leaf);
      } else if (token.type === "fontFamily") {
        const leaf = { $type: "fontFamily", $value: token.value };
        if (desc) leaf.$description = desc;
        setDeep(name, leaf);
      } else if (token.type === "string") {
        if (name.indexOf("motion.easing.") === 0) {
          const pts = cubicBezier(token.value);
          const leaf = { $type: "cubicBezier", $value: pts || token.value };
          if (desc) leaf.$description = desc;
          setDeep(name, leaf);
        } else if (name.indexOf("motion.duration.") === 0 || /(ms|s)$/.test(String(token.value))) {
          const leaf = { $type: "duration", $value: token.value };
          if (desc) leaf.$description = desc;
          setDeep(name, leaf);
        }
        // other plain strings have no DTCG core type → skip
      } else if (token.type === "shadow") {
        const lightArr = shadowArr(token.value && token.value.light);
        const darkArr = shadowArr(token.value && token.value.dark);
        const defArr = defaultMode === "dark" ? darkArr : lightArr;
        if (!defArr || !defArr.length) return; // skip "none"
        const leaf = { $type: "shadow", $value: defArr.length === 1 ? defArr[0] : defArr };
        if (desc) leaf.$description = desc;
        leaf.$extensions = {};
        leaf.$extensions[MODE_EXT] = { light: lightArr, dark: darkArr };
        setDeep(name, leaf);
      }
    });

    return JSON.stringify(root, null, 2);
  }

  function createExports(seed, tokens, version) {
    return {
      json: exportJson(seed, tokens, version),
      css: exportCss(tokens, seed.defaultMode),
      ts: exportTs(seed, tokens, version),
      tailwind: exportTailwind(tokens),
    };
  }

  Object.assign(window, {
    DesignExports: {
      exportJson,
      exportCss,
      exportTs,
      exportTailwind,
      exportFigmaPlugin,
      exportAiJson,
      exportAiPrompt,
      exportDtcg,
      createExports,
    },
  });
})();
