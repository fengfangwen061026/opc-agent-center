# OPC SkillOS Agent Center — UI 设计系统 v0.2

> 本文档定义 Agent Center 的视觉语言。主工程规格见 `opc_skillos_spec_main.md`。

---

## 1. 审美目标

关键词：light / dopamine / liquid glass / soft depth / translucent / rounded / calm / energetic / premium / readable

不要像传统后台管理系统，要像未来感的个人 AI 指挥中心。

---

## 2. 色彩 Token

淡色系多巴胺，不使用高饱和刺眼色。

```css
:root {
  /* 背景 */
  --opc-bg-0: #f8fbff;
  --opc-bg-1: #fff7fb;
  --opc-bg-2: #f6f2ff;
  --opc-bg-3: #f0fff9;

  /* 玻璃 */
  --opc-glass: rgba(255, 255, 255, 0.58);
  --opc-glass-strong: rgba(255, 255, 255, 0.74);
  --opc-glass-soft: rgba(255, 255, 255, 0.42);
  --opc-glass-border: rgba(255, 255, 255, 0.72);
  --opc-glass-border-strong: rgba(255, 255, 255, 0.92);

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
  --opc-shadow-soft: 0 18px 55px rgba(93, 116, 152, 0.16);
  --opc-shadow-card: 0 14px 40px rgba(91, 107, 134, 0.13);
  --opc-shadow-float: 0 24px 90px rgba(91, 107, 134, 0.22);

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

## 3. Agent 状态色

| 状态             | 色彩                | 视觉效果                  |
| ---------------- | ------------------- | ------------------------- |
| idle             | text-2 / soft glass | 淡灰蓝圆点                |
| planning         | lavender            | 呼吸动画                  |
| running          | sky + mint          | 流动进度条                |
| waiting_approval | lemon               | 明亮边框、轻微 pulse      |
| blocked          | coral               | 图标 + 阻塞原因           |
| failed           | danger              | 清晰红色但不刺眼          |
| completed        | success             | 绿色 check + capsule link |
| evolving         | rose + lavender     | Hermes 进化状态           |

---

## 4. 背景

主背景使用柔和渐变 + 流体色斑：

```css
.opc-shell-bg {
  background:
    radial-gradient(circle at 12% 18%, rgba(110, 201, 255, 0.34), transparent 34%),
    radial-gradient(circle at 78% 8%, rgba(185, 166, 255, 0.32), transparent 32%),
    radial-gradient(circle at 86% 78%, rgba(133, 230, 197, 0.28), transparent 34%),
    radial-gradient(circle at 20% 84%, rgba(255, 157, 176, 0.24), transparent 30%),
    linear-gradient(135deg, #f8fbff 0%, #fff7fb 42%, #f3fff8 100%);
}
```

---

## 5. 液态玻璃面板

所有核心面板用统一 glass card：

```css
.opc-glass-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.46));
  border: 1px solid rgba(255, 255, 255, 0.74);
  box-shadow: var(--opc-shadow-card);
  backdrop-filter: blur(var(--opc-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--opc-blur)) saturate(150%);
  border-radius: var(--opc-radius-lg);
  position: relative;
  overflow: hidden;
}

.opc-glass-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.65), transparent 38%),
    radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.82), transparent 18%);
  opacity: 0.58;
}
```

---

## 6. 字体

系统字体栈，不嵌入字体文件：

```css
font-family:
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "Inter",
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

---

## 7. 动效原则

克制，不炫技：

- 页面切换：160–220ms ease-out
- 卡片 hover：scale 1.01 + shadow stronger
- 运行中 Agent：柔和 breathing glow
- 任务流：从左到右淡入
- 通知中心：新通知从顶部滑入
- Agent Graph：状态改变时节点一次 ripple

---

## 8. 可访问性

- 所有文字对比度必须可读（WCAG AA）。
- 动效支持 `prefers-reduced-motion`。
- 所有可点击元素有 focus ring。
- 不能只靠颜色表达状态，必须有图标/文字。

---

## 9. 核心组件清单

Phase 1 必须实现的组件：

| 组件               | 用途                             |
| ------------------ | -------------------------------- |
| `GlassCard`        | 通用容器                         |
| `LiquidButton`     | 主操作按钮                       |
| `StatusPill`       | Agent/Task 状态标签              |
| `AgentAvatar`      | Agent 头像 + 状态指示            |
| `MetricCard`       | 数值指标卡                       |
| `NotificationCard` | 通知条目                         |
| `SkillCard`        | Skill 列表项                     |
| `TaskTimelineItem` | 任务时间线条目                   |
| `ConnectionBadge`  | Gateway/Hermes/Obsidian 连接状态 |

---

## 10. 响应式断点

```css
/* Mobile */
@media (max-width: 768px) {
  /* 单栏，底部 Tab */
}
/* Tablet */
@media (max-width: 1024px) {
  /* 隐藏 Right Rail */
}
/* Desktop */
@media (min-width: 1025px) {
  /* 三栏布局 */
}
```

---

## 11. Dark Theme

Phase 1 不实现 dark theme，但 design token 须为 dark theme 预留。所有颜色使用 CSS variables，不硬编码。
