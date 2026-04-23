import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { AgentsPage } from "./pages/AgentsPage";
import { ChatPage } from "./pages/ChatPage";
import { CommandCenterPage } from "./pages/CommandCenterPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillDetailPage } from "./pages/SkillDetailPage";
import { SkillsPage } from "./pages/SkillsPage";
import { UnmatchedChatPage } from "./pages/UnmatchedChatPage";
import { useBridgeEvents } from "./lib/ws";

export default function App() {
  useBridgeEvents();

  return (
    <AppShell>
      <Routes>
        <Route element={<CommandCenterPage />} path="/" />
        <Route element={<AgentsPage />} path="/agents" />
        <Route element={<SkillsPage />} path="/skills" />
        <Route element={<SkillDetailPage />} path="/skills/:name" />
        <Route element={<KnowledgePage />} path="/knowledge" />
        <Route element={<ChatPage />} path="/chat" />
        <Route element={<UnmatchedChatPage />} path="/chat/unmatched" />
        <Route element={<NotificationsPage />} path="/notifications" />
        <Route element={<SettingsPage />} path="/settings" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </AppShell>
  );
}
