"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import SidebarNavIcon from "@/app/admin_recruiter/components/SidebarNavIcon";
import { HeaderIconCountBadge } from "@/app/components/HeaderIconCountBadge";
import { applicationPath } from "@/lib/tenant/with-tenant";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useApplicantPortal } from "./ApplicantPortalProvider";
import { WorkerPortalUserAvatar } from "./WorkerPortalUserAvatar";
import {
  searchWorkerPortal,
  type WorkerPortalSearchItem,
} from "./worker-portal-search";

const SIDEBAR_TOGGLE_ICON = "/icons/sidebar-on-off-icon.svg";

type WorkerNotification = {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean | null;
  sent_at: string | null;
};

type Props = {
  applicantName: string;
  mobileNavOpen?: boolean;
  onMenuClick?: () => void;
  onSidebarToggle?: () => void;
  sidebarCollapsed?: boolean;
  onOpenMessages?: () => void;
};

function formatNotificationTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ApplicantPortalHeader({
  applicantName,
  mobileNavOpen = false,
  onMenuClick,
  onSidebarToggle,
  sidebarCollapsed = false,
  onOpenMessages,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantQuery = searchParams?.get("tenant");
  const { profilePhotoUrl, authHeaders } = useApplicantPortal();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<WorkerNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const profileAreaRef = useRef<HTMLDivElement>(null);
  const actionsAreaRef = useRef<HTMLDivElement>(null);
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);

  const searchResults = useMemo(() => searchWorkerPortal(searchQuery, 10), [searchQuery]);
  const flatResults = useMemo(() => {
    const items = [...searchResults.pages];
    if (searchQuery.trim() && searchResults.jobsShortcut) {
      items.push(searchResults.jobsShortcut);
    }
    return items;
  }, [searchQuery, searchResults]);

  const loadNotifications = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;

    const res = await fetch("/api/applicant-portal/notifications", {
      headers,
      cache: "no-store",
    });
    const payload = (await res.json().catch(() => ({}))) as {
      notifications?: WorkerNotification[];
      unreadNotifications?: number;
    };
    if (!res.ok) return;

    setNotifications(payload.notifications ?? []);
    setUnreadNotifications(Math.max(0, payload.unreadNotifications ?? 0));
  }, [authHeaders]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      const previousNotifications = notifications;
      const previousUnread = unreadNotifications;
      const target = notifications.find((item) => item.id === notificationId);
      const wasUnread = target ? !target.is_read : false;
      if (!wasUnread) return;

      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
      );
      setUnreadNotifications((current) => Math.max(0, current - 1));

      try {
        const headers = await authHeaders();
        if (!headers) throw new Error("auth");
        const res = await fetch("/api/applicant-portal/notifications", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_notification_read", notificationId }),
        });
        if (!res.ok) throw new Error("mark failed");
      } catch {
        setNotifications(previousNotifications);
        setUnreadNotifications(previousUnread);
      }
    },
    [authHeaders, notifications, unreadNotifications]
  );

  const clearAllNotifications = useCallback(async () => {
    if (clearingAll || notifications.length === 0) return;
    setClearingAll(true);
    const previousNotifications = notifications;
    const previousUnread = unreadNotifications;

    setUnreadNotifications(0);
    setNotifications([]);

    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("auth");
      const res = await fetch("/api/applicant-portal/notifications", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_notifications" }),
      });
      if (!res.ok) throw new Error("clear failed");
    } catch {
      setNotifications(previousNotifications);
      setUnreadNotifications(previousUnread);
    } finally {
      setClearingAll(false);
    }
  }, [authHeaders, clearingAll, notifications, unreadNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    if (markingAllRead || unreadNotifications <= 0) return;
    setMarkingAllRead(true);
    const previousNotifications = notifications;
    const previousUnread = unreadNotifications;

    setUnreadNotifications(0);
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));

    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("auth");
      const res = await fetch("/api/applicant-portal/notifications", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_notifications_read" }),
      });
      if (!res.ok) throw new Error("mark failed");
    } catch {
      setNotifications(previousNotifications);
      setUnreadNotifications(previousUnread);
    } finally {
      setMarkingAllRead(false);
    }
  }, [authHeaders, markingAllRead, notifications, unreadNotifications]);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (!profileOpen && !notificationsOpen && !searchOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileAreaRef.current && !profileAreaRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (actionsAreaRef.current && !actionsAreaRef.current.contains(target)) {
        if (notificationsOpen) {
          setNotificationsOpen(false);
          notificationsButtonRef.current?.focus();
        }
      }
      if (searchAreaRef.current && !searchAreaRef.current.contains(target)) {
        setSearchOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (notificationsOpen) {
        setNotificationsOpen(false);
        notificationsButtonRef.current?.focus();
      }
      if (profileOpen) setProfileOpen(false);
      if (searchOpen) setSearchOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen, notificationsOpen, searchOpen]);

  function navigateToSearchItem(item: WorkerPortalSearchItem) {
    const href = applicationPath(item.href, tenantQuery);
    setSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(flatResults.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSearchOpen(false);
      searchInputRef.current?.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target =
        flatResults[activeIndex] ??
        (searchQuery.trim() ? searchResults.jobsShortcut : flatResults[0] ?? null);
      if (target) navigateToSearchItem(target);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabaseBrowser.auth.signOut();
      router.replace("/");
    } catch (error) {
      console.error("[ApplicantPortalHeader] logout failed", error);
      setLoggingOut(false);
    }
  }

  return (
    <header
      className={`worker-portal-topbar sticky top-0 shrink-0 bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)] ${
        searchOpen ? "z-[60]" : "z-40"
      }`}
    >
      <div className="flex h-full items-center gap-1.5 px-2 min-[1000px]:gap-3 min-[1000px]:px-8 max-[999px]:px-2 max-[499px]:pl-2 max-[499px]:pr-1.5 max-[319px]:gap-1 max-[319px]:px-1.5">
        <div className="flex shrink-0 items-center gap-2">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[#64748B] transition hover:text-[#0F3B76] min-[1000px]:hidden"
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              title="Open menu"
            >
              <Image
                src={SIDEBAR_TOGGLE_ICON}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 shrink-0"
                aria-hidden
              />
            </button>
          ) : null}
          {onSidebarToggle ? (
            <button
              type="button"
              onClick={onSidebarToggle}
              className="hidden h-8 w-8 items-center justify-center bg-transparent text-[#64748B] transition hover:text-[#0F3B76] min-[1000px]:inline-flex"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <Image
                src={SIDEBAR_TOGGLE_ICON}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 shrink-0"
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 justify-center px-1 max-[319px]:px-0.5">
          <div ref={searchAreaRef} className="relative mx-auto w-full max-w-[520px]">
            <label className="relative block w-full">
              <span className="sr-only">Search anything</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8] min-[1000px]:left-3 min-[1000px]:h-4 min-[1000px]:w-4" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search anything"
                autoComplete="off"
                aria-expanded={searchOpen}
                aria-controls="worker-portal-search-results"
                className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white pl-8 pr-2.5 text-[13px] text-[#012352] outline-none placeholder:text-[#94A3B8] focus:border-[color:var(--brand-primary)] min-[1000px]:h-10 min-[1000px]:pl-10 min-[1000px]:pr-4 min-[1000px]:text-[14px]"
              />
            </label>

            {searchOpen ? (
              <div
                id="worker-portal-search-results"
                role="listbox"
                className="worker-portal-search-results absolute left-0 right-0 top-[calc(100%+6px)] z-[130] max-h-[min(360px,70vh)] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-xl"
              >
                <div className="max-h-[min(360px,70vh)] overflow-y-auto py-1">
                  {flatResults.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-[#64748B] min-[1000px]:px-4">No matches found.</p>
                  ) : (
                    flatResults.map((item, index) => {
                      const active = index === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => navigateToSearchItem(item)}
                          className={`flex w-full min-w-0 flex-col gap-0.5 px-3 py-2.5 text-left transition min-[1000px]:px-4 ${
                            active ? "bg-[#F8FAFC]" : "bg-white hover:bg-[#F8FAFC]"
                          }`}
                        >
                          <span className="truncate text-sm font-semibold text-[#0F172A]">{item.label}</span>
                          <span className="truncate text-xs text-[#64748B]">{item.description}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-[#F1F5F9] px-3 py-2 text-[11px] text-[#94A3B8] min-[1000px]:px-4">
                  Enter to open · Esc to close
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-0 flex shrink-0 items-center gap-1 sm:gap-3">
          <div ref={actionsAreaRef} className="relative flex items-center gap-0">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen(false);
                onOpenMessages?.();
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md transition hover:bg-[#F8FAFC]"
              aria-label="Open messages"
            >
              <SidebarNavIcon iconType="Chat" active={false} />
            </button>
            <button
              ref={notificationsButtonRef}
              type="button"
              onClick={() => {
                setProfileOpen(false);
                setNotificationsOpen((prev) => !prev);
              }}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-md transition hover:bg-[#F8FAFC]"
              aria-label={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : "Notifications"
              }
              aria-expanded={notificationsOpen}
              title={
                unreadNotifications > 0
                  ? `Notifications, ${unreadNotifications} unread`
                  : "Notifications"
              }
            >
              <SidebarNavIcon
                iconType="Notifications"
                active={false}
                colorHex={unreadNotifications > 0 ? "#EF4444" : undefined}
              />
              <HeaderIconCountBadge count={unreadNotifications} />
            </button>

            {notificationsOpen ? (
              <div
                role="dialog"
                aria-label="Notifications"
                className="absolute right-0 top-10 z-[120] w-[320px] overflow-hidden rounded-lg border border-[#d7e4e1] bg-white shadow-xl max-[499px]:fixed max-[499px]:left-[calc(50%+28px)] max-[499px]:right-auto max-[499px]:top-[68px] max-[499px]:w-[calc(100vw-88px)] max-[499px]:max-w-[360px] max-[499px]:-translate-x-1/2 max-[429px]:left-[calc(50%+24px)] max-[429px]:w-[calc(100vw-64px)] max-[319px]:left-[calc(50%+20px)] max-[319px]:w-[calc(100vw-48px)]"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] px-4 py-3">
                  <p className="text-sm font-semibold text-[#0F172A]">Notifications</p>
                  <div className="flex items-center gap-3">
                    {notifications.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void clearAllNotifications()}
                        disabled={clearingAll}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline disabled:opacity-60"
                      >
                        Clear all
                      </button>
                    ) : null}
                    {unreadNotifications > 0 ? (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        disabled={markingAllRead}
                        className="text-xs font-semibold text-[#0EA5A4] hover:underline disabled:opacity-60"
                      >
                        Mark all as read
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-[#64748B]">No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          void markNotificationRead(notification.id);
                        }}
                        className={`block w-full border-b border-[#F1F5F9] px-4 py-3 text-left transition hover:bg-[#F8FAFC] ${
                          notification.is_read ? "opacity-70" : "bg-[#F8FAFC]"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[#0F172A]">
                          {notification.title?.trim() || "Notification"}
                        </p>
                        {notification.body ? (
                          <p className="mt-1 text-sm text-[#64748B]">{notification.body}</p>
                        ) : null}
                        {notification.sent_at ? (
                          <p className="mt-1 text-[11px] text-[#94A3B8]">
                            {formatNotificationTime(notification.sent_at)}
                          </p>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div ref={profileAreaRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen(false);
                setProfileOpen((prev) => !prev);
              }}
              className="flex max-w-full items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-1.5 py-1 transition hover:bg-[#F8FAFC] max-[319px]:gap-0.5 max-[319px]:px-1 sm:gap-2 sm:px-2.5 sm:py-1.5"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              <WorkerPortalUserAvatar name={applicantName} photoUrl={profilePhotoUrl} size={30} />
              <div className="hidden min-w-0 leading-tight text-left sm:block">
                <p className="max-w-[88px] truncate text-sm font-semibold text-[#0F172A] md:max-w-[140px]">
                  {applicantName}
                </p>
                <p className="max-w-[88px] truncate text-[11px] text-[#64748B] md:max-w-[140px]">Worker</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#94A3B8]" aria-hidden />
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[#E2E8F0] bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-[12px] font-semibold text-[#012352]">{applicantName}</p>
                <p className="px-2 pb-2 text-[11px] text-[#64748B]">Worker</p>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="mt-1 block w-full rounded-md px-2 py-1 text-left text-xs text-[#0F172A] hover:bg-[#f2f8f7] disabled:opacity-60"
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
