# OPC 超级中枢 UI 设计系统 v2.0

## 1. 审美目标

关键词：light / dopamine / liquid glass / soft depth / translucent / rounded / calm / energetic / premium

不像传统后台管理系统，像未来感个人 AI 指挥中心。

---

## 2. CSS Token

```css
:root {
  /* 背景 */
  --opc-bg-0: #f8fbff;
  --opc-bg-1: #fff7fb;
  --opc-bg-2: #f6f2ff;
  --opc-bg-3: #f0fff9;

  /* 玻璃 */
  --opc-glass: rgba(255,255,255,0.58);
  --opc-glass-strong: rgba(255,255,255,0.74);
  --opc-glass-soft: rgba(255,255,255,0.42);
  --opc-glass-border: rgba(255,255,255,0.72);
  --opc-glass-border-strong: rgba(255,255,255,0.92);

  /* 文字 */
  --opc-text-0: #182033;
  --opc-text-1: #46516a;
  --opc-text-2: #77819a;
  --opc-text-inverse: #ffffff;

  /* 多巴胺色 */
  --opc-sky: #6ec9ff;
  --opc-lavender: #b9a6ff;
  --opc-mint: #85e6c5;
  --opc-lemon: #ffe17a;
  --opc-coral: #ff9db0;
  --opc-peach: #ffc6a8;
  --opc-aqua: #9ff3ff;
  --opc-rose: #ffb8df;

  /* 语义色 */
  --opc-success: #53d89b;
  --opc-warning: #ffd166;
  --opc-danger: #ff7a90;
  --opc-info: #68bfff;

  /* 阴影 */
  --opc-shadow-soft: 0 18px 55px rgba(93,116,152,0.16);
  --opc-shadow-card: 0 14px 40px rgba(91,107,134,0.13);
  --opc-shadow-float: 0 24px 90px rgba(91,107,134,0.22);

  /* 圆角 */
  --opc-radius-xs: 10px;
  --opc-radius-sm: 14px;
  --opc-radius-md: 20px;
  --opc-radius-lg: 28px;
  --opc-radius-xl: 36px;

  /* 模糊 */
  --opc-blur: 26px;
  --opc-blur-strong: 42px;
}
```

---

## 3. 核心组件规范

### GlassCard
```css
background: var(--opc-glass);
backdrop-filter: blur(var(--opc-blur));
border: 1px solid var(--opc-glass-border);
border-radius: var(--opc-radius-lg);
box-shadow: var(--opc-shadow-card);
```

### LiquidButton
- 主色：渐变 lavender → sky
- 悬停：`box-shadow: 0 8px 32px rgba(185,166,255,0.45)`
- 圆角：`var(--opc-radius-sm)`
- 过渡：`all 0.22s cubic-bezier(0.34,1.56,0.64,1)`

### StatusPill
- connected：`--opc-mint` 背景
- disconnected：`--opc-coral` 背景
- running：`--opc-sky` 背景 + 脉冲动画
- idle：`--opc-glass-soft` 背景

### MetricCard
- GlassCard 基础 + 顶部渐变色条（4px，颜色按 agent 类型区分）
- 数字用大号字体（2rem），颜色 `--opc-text-0`
- 副标题 `--opc-text-2`

### ConnectionBadge
- 小圆点 + 文字，颜色语义同 StatusPill
- 脉冲动画：`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`

---

## 4. 布局规范

### AppShell（桌面）
```
┌─────┬──────────────────────────┬──────────┐
│ Nav │     MainWorkspace        │  Right   │
│ 64px│       flex-1             │  Rail    │
│     │                          │  280px   │
└─────┴──────────────────────────┴──────────┘
TopBar: 56px，全宽
```

### 响应式
- 平板（<1024px）：隐藏右侧 Rail
- 移动（<768px）：底部 Tab 导航，左 Nav 收起

### 动效
- 页面切换：`fadeInUp 0.18s ease`
- 卡片出现：`scaleIn 0.22s cubic-bezier(0.34,1.56,0.64,1)`
- `prefers-reduced-motion`：所有动画降为 `0.01ms`

---

## 5. 图标规范

使用 lucide-react。Agent 类型对应图标：
- Conductor: `Cpu`
- Evolver: `Sparkles`
- Codex: `Code2`
- Claude Code: `Terminal`
- Knowledge: `BookOpen`
- Skill: `Zap`
- Memory: `Brain`

---

## 6. 禁止事项

- 不使用默认 shadcn 灰黑配色
- 不使用 `#000000` 纯黑文字（用 `--opc-text-0`）
- 不使用无 backdrop-filter 的实色卡片（除非性能降级）
- 不使用 Arial / Inter 等无特色字体（推荐 Plus Jakarta Sans 或 DM Sans）
