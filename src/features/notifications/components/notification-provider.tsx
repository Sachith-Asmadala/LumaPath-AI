"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDemo } from "@/state/demo-provider";
import type { NotificationInbox, NotificationInboxItem, NotificationPreferences } from "@/features/notifications/domain/notifications";
import { buildNotificationCandidates } from "@/features/notifications/domain/notifications";
import { getNotificationInbox, getNotificationPreferences, markNotificationDelivery, syncNotificationCandidates } from "@/features/notifications/services/notifications";

interface NotificationContextValue {
  inbox: NotificationInboxItem[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  opened: (deliveryId: string) => Promise<void>;
  dismissed: (deliveryId: string) => Promise<void>;
  acted: (deliveryId: string) => Promise<void>;
}
const Context = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { state } = useDemo();
  const [data, setData] = useState<NotificationInbox>({ items: [], unread_count: 0, generated_at: new Date(0).toISOString(), partial: true, calendar_integration_available: false });
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const syncing = useRef(false);

  const refresh = useCallback(async () => {
    if (!state.student.id) return;
    try { const inbox = await getNotificationInbox(state.student.id); setData(inbox); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Notifications are unavailable."); }
    finally { setLoading(false); }
  }, [state.student.id]);

  useEffect(() => {
    if (!state.student.id) return;
    void getNotificationPreferences(state.student.id).then(setPreferences).catch(() => undefined);
  }, [state.student.id]);

  useEffect(() => {
    if (!state.student.id || syncing.current) return;
    const timer = window.setTimeout(async () => {
      syncing.current = true;
      try { await syncNotificationCandidates(state.student.id, buildNotificationCandidates(state)); await refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Notification sync is unavailable."); }
      finally { syncing.current = false; setLoading(false); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state.student.id, state.tasks, state.planBlocks, state.activeAction, state.careerSkills, refresh]);

  const mutate = useCallback(async (deliveryId: string, action: "opened"|"dismissed"|"acted") => {
    if (!state.student.id) return;
    await markNotificationDelivery(state.student.id, deliveryId, action); await refresh();
  }, [refresh, state.student.id]);
  const value = useMemo(() => ({ inbox: data.items, unreadCount: data.unread_count, preferences, loading, error, refresh,
    opened: (id: string) => mutate(id,"opened"), dismissed: (id: string) => mutate(id,"dismissed"), acted: (id: string) => mutate(id,"acted") }), [data, preferences, loading, error, refresh, mutate]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNotifications() {
  const value = useContext(Context); if (!value) throw new Error("useNotifications must be used within NotificationProvider."); return value;
}
