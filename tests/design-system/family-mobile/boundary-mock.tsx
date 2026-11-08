import type { ReactNode } from "react";
export function ChatProvider({ children }: { children: ReactNode }) { return children; }
export function ChatDock() { return null; }
export function SettingsModalHost() { return null; }
export function CycleBadge() { return null; }
const notifications: never[] = [];
export function useNotifications() { return { notifications, unreadCount: 0, markAsRead() {}, markAllAsRead() {} }; }
