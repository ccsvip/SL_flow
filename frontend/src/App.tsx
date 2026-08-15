import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Spin } from "antd";

import { useAuthStore } from "@/store/auth";
import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/layout/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import StoriesPage from "@/pages/StoriesPage";
import TasksPage from "@/pages/TasksPage";
import BugsPage from "@/pages/BugsPage";
import CalendarPage from "@/pages/CalendarPage";
import NotificationsPage from "@/pages/NotificationsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import AISettingsPage from "@/pages/AISettingsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import BackupsPage from "@/pages/BackupsPage";
import PRDListPage from "@/pages/PRDListPage";
import PRDDetailPage from "@/pages/PRDDetailPage";
import APIKeysPage from "@/pages/APIKeysPage";
import MemoPage from "@/pages/MemoPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, hydrated } = useAuthStore();
  const location = useLocation();
  if (!hydrated) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  React.useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="bugs" element={<BugsPage />} />
        <Route path="prd" element={<PRDListPage />} />
        <Route path="prd/:id" element={<PRDDetailPage />} />
        <Route path="api-keys" element={<APIKeysPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="ai-settings"
          element={
            <RequireAdmin>
              <AISettingsPage />
            </RequireAdmin>
          }
        />
        <Route path="audit-logs" element={<AuditLogsPage />} />
        <Route path="memos" element={<MemoPage />} />
        <Route
          path="backups"
          element={
            <RequireAdmin>
              <BackupsPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
