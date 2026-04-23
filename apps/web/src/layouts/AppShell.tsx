import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell,
  Bot,
  BrainCircuit,
  Command,
  DatabaseZap,
  MessageSquareText,
  Settings,
  Sparkles,
} from "lucide-react";
import { ConnectionBadge, GlassCard, NotificationCard } from "@opc/ui";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { getHealth, getNotifications, getTasks } from "../lib/api";

const navItems = [
  { label: "指挥", href: "/", icon: Command },
  { label: "智能体", href: "/agents", icon: Bot },
  { label: "技能", href: "/skills", icon: Sparkles },
  { label: "知识库", href: "/knowledge", icon: DatabaseZap },
  { label: "对话", href: "/chat", icon: MessageSquareText },
  { label: "通知", href: "/notifications", icon: Bell },
  { label: "设置", href: "/settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="opc-shell opc-shell-bg">
      <TopBar />
      <LeftNav />
      <main className="opc-main-workspace">
        <ErrorBoundary title="工作区加载失败">{children}</ErrorBoundary>
      </main>
      <RightNotificationRail />
      <BottomTabs />
    </div>
  );
}

function TopBar() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 5000,
  });

  return (
    <header className="opc-topbar">
      <Link aria-label="OPC SkillOS 首页" className="opc-brand" to="/">
        <span className="opc-brand__mark">
          <BrainCircuit aria-hidden="true" size={24} />
        </span>
        <span>
          <strong>OPC SkillOS</strong>
          <small>智能体中枢</small>
        </span>
      </Link>
      <div className="opc-topbar__badges" aria-label="连接状态">
        <ConnectionBadge label="网关" state={health?.gateway ?? "offline"} />
        <ConnectionBadge label="Hermes" state={health?.hermes ?? "unavailable"} />
        <ConnectionBadge label="Obsidian" state={health?.obsidian ?? "unavailable"} />
      </div>
    </header>
  );
}

function LeftNav() {
  return (
    <nav aria-label="主导航" className="opc-left-nav">
      {navItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            className="opc-left-nav__item"
            end={item.href === "/"}
            key={item.href}
            to={item.href}
          >
            <Icon aria-hidden="true" size={21} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function RightNotificationRail() {
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: getTasks });
  const waitingCount = notifications.filter((item) => item.status === "waiting_action").length;
  const recentNotifications = [...notifications]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const blockedTasks = tasks.filter((task) => task.status === "blocked");

  return (
    <aside className="opc-right-rail">
      <GlassCard className="opc-rail-card">
        <div className="opc-rail-card__header">
          <span>
            <strong>{waitingCount}</strong>
            <small>待审批</small>
          </span>
          <Bell aria-hidden="true" size={20} />
        </div>
        <div className="opc-rail-card__list">
          {blockedTasks.slice(0, 2).map((task) => (
            <article className="opc-rail-blocked" key={task.taskId}>
              <strong>{task.title}</strong>
              <span>阻塞 · {task.risk}</span>
            </article>
          ))}
          {recentNotifications.map((notification) => (
            <NotificationCard compact key={notification.id} notification={notification} />
          ))}
        </div>
      </GlassCard>
    </aside>
  );
}

function BottomTabs() {
  const location = useLocation();
  const mobileItems = navItems.filter((item) =>
    ["/", "/agents", "/chat", "/notifications", "/knowledge"].includes(item.href),
  );

  return (
    <nav aria-label="移动端主导航" className="opc-bottom-tabs">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);

        return (
          <Link className={active ? "is-active" : undefined} key={item.href} to={item.href}>
            <Icon aria-hidden="true" size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
