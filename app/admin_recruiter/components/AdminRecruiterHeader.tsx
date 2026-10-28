"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  isCandidateDetailPage,
  navigateCandidateDetailBack,
} from "./candidate-detail-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import GodAdminTenantSwitcher from "./GodAdminTenantSwitcher";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { accountRoleLabel, getAccountDisplayName } from "@/lib/account/display-name";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { recruiterLogoutLoginHref } from "@/lib/auth/recruiter-sign-in";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { BRAAS_PLATFORM_FAVICON } from "@/lib/tenant/tenant-branding";
import {
  formatMessageTime,
  type ApplicantMessageListRow,
  type StaffConversation,
} from "@/lib/messaging/staff-conversations";
import { useApplicantConversationsRealtime } from "@/lib/messaging/useApplicantConversationsRealtime";
import { HeaderIconCountBadge } from "@/app/components/HeaderIconCountBadge";
import { useAdminHeaderData, ADMIN_HEADER_DATA_QUERY_KEY, type AdminHeaderDataPayload } from "@/lib/admin/hooks/use-admin-header-data";
import { useStaffConversations } from "@/lib/messaging/hooks/use-staff-conversations";
import { useMarkConversationRead } from "@/lib/messaging/hooks/use-mark-conversation-read";
import { useQueryClient } from "@tanstack/react-query";
import { StaffProfileAvatar } from "@/app/admin_recruiter/components/StaffProfileAvatar";
import { isLimitedStaffConsoleRole } from "@/lib/admin/staff-directory-types";

type ConversationItem = StaffConversation;

type AdminRecruiterHeaderProps = {
  onMenuClick?: () => void;
  mobileNavOpen?: boolean;
  sidebarCollapsed?: boolean;
  onSidebarToggle?: () => void;
};

const DEFAULT_TENANT_LOGO = BRAAS_PLATFORM_FAVICON;
const SIDEBAR_TOGGLE_ICON = "/icons/admin-recruiter/header/sidebar-toggle.svg";
const HEADER_SEARCH_ICON = "/icons/admin-recruiter/header/search.svg";
const HEADER_CHAT_ICON = "/icons/admin-recruiter/header/chat.svg";
const HEADER_BELL_ICON = "/icons/admin-recruiter/header/bell.svg";
const HEADER_HELP_SUPPORT_ICON = "/icons/admin-recruiter/help-support.svg";
const HEADER_PROFILE_CHEVRON_ICON = "/icons/admin-recruiter/header/chevron-down.svg";

/** 32px hit area around a 20px Figma icon; neighbours use 2px gaps → 14px visual spacing. */
const HEADER_ICON_BUTTON_CLASS =
  "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition hover:bg-slate-100";

/** Static count removed — use live unreadNotifications from header data API. */

export function AdminRecruiterHeader({
  onMenuClick,
  mobileNavOpen = false,
  sidebarCollapsed = false,
  onSidebarToggle,
}: AdminRecruiterHeaderProps) {
  const branding = useTenantBranding();
  const { user, profile, organization, loading: accountLoading } = useAccountData();
  const {
    notifications,
    unreadNotifications,
    displayName: headerDisplayName,
    isLoading: headerDataLoading,
    isError: headerDataError,
    error: headerDataErrorObj,
    refetch: refetchHeaderData,
  } = useAdminHeaderData();
  const queryClient = useQueryClient();
  const markConversationRead = useMarkConversationRead();
  const {
    conversations,
    tenantId,
    unreadMessages,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useStaffConversations();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [tenantLogoSrc, setTenantLogoSrc] = useState(
    branding.faviconUrl || branding.logoUrl || DEFAULT_TENANT_LOGO
  );
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const profileAreaRef = useRef<HTMLDivElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      const previous = queryClient.getQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY);
      const target = previous?.notifications.find((item) => item.id === notificationId);
      const wasUnread = target ? !target.is_read : true;
      if (!wasUnread) return;

      queryClient.setQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY, (current) => {
        if (!current) return current;
        return {
          ...current,
          notifications: current.notifications.map((item) =>
            item.id === notificationId ? { ...item, is_read: true } : item
          ),
          unreadNotifications: wasUnread
            ? Math.max(0, current.unreadNotifications - 1)
            : Math.max(0, current.unreadNotifications),
        };
      });

      try {
        const res = await fetch("/api/admin/header-data", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_notification_read", notificationId }),
        });
        if (!res.ok) throw new Error("mark failed");
        await queryClient.invalidateQueries({ queryKey: ADMIN_HEADER_DATA_QUERY_KEY });
      } catch {
        if (previous) queryClient.setQueryData(ADMIN_HEADER_DATA_QUERY_KEY, previous);
      }
    },
    [queryClient]
  );

  const clearAllNotifications = useCallback(async () => {
    if (clearingAll || notifications.length === 0) return;
    setClearingAll(true);
    const previous = queryClient.getQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY);
    queryClient.setQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY, (current) => {
      if (!current) return current;
      return {
        ...current,
        notifications: [],
        unreadNotifications: 0,
      };
    });

    try {
      const res = await fetch("/api/admin/header-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_notifications" }),
      });
      if (!res.ok) throw new Error("clear failed");
      await queryClient.invalidateQueries({ queryKey: ADMIN_HEADER_DATA_QUERY_KEY });
    } catch {
      if (previous) queryClient.setQueryData(ADMIN_HEADER_DATA_QUERY_KEY, previous);
    } finally {
      setClearingAll(false);
    }
  }, [clearingAll, notifications.length, queryClient]);

  const markAllNotificationsRead = useCallback(async () => {
    if (markingAllRead || unreadNotifications <= 0) return;
    setMarkingAllRead(true);
    const previous = queryClient.getQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY);
    queryClient.setQueryData<AdminHeaderDataPayload>(ADMIN_HEADER_DATA_QUERY_KEY, (current) => {
      if (!current) return current;
      return {
        ...current,
        notifications: current.notifications.map((item) => ({ ...item, is_read: true })),
        unreadNotifications: 0,
      };
    });

    try {
      const res = await fetch("/api/admin/header-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_notifications_read" }),
      });
      if (!res.ok) throw new Error("mark failed");
      await queryClient.invalidateQueries({ queryKey: ADMIN_HEADER_DATA_QUERY_KEY });
    } catch {
      if (previous) queryClient.setQueryData(ADMIN_HEADER_DATA_QUERY_KEY, previous);
    } finally {
      setMarkingAllRead(false);
    }
  }, [markingAllRead, queryClient, unreadNotifications]);

  useEffect(() => {
    if (!showNotifications && !showMessages && !showProfileMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showMessages && messagesAreaRef.current && !messagesAreaRef.current.contains(target)) {
        setShowMessages(false);
      }
      if (showProfileMenu && profileAreaRef.current && !profileAreaRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (
        showNotifications &&
        messagesAreaRef.current &&
        !messagesAreaRef.current.contains(target)
      ) {
        setShowNotifications(false);
        notificationsButtonRef.current?.focus();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showNotifications) {
        setShowNotifications(false);
        notificationsButtonRef.current?.focus();
      }
      if (showMessages) setShowMessages(false);
      if (showProfileMenu) setShowProfileMenu(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMessages, showProfileMenu, showNotifications]);

  const handleConversationInsert = useCallback(
    (_message: ApplicantMessageListRow) => {
      void refetchConversations();
    },
    [refetchConversations]
  );

  useApplicantConversationsRealtime(
    tenantId,
    handleConversationInsert,
    !headerDataLoading && !conversationsLoading
  );

  useEffect(() => {
    setTenantLogoSrc(branding.faviconUrl?.trim() || branding.logoUrl?.trim() || DEFAULT_TENANT_LOGO);
  }, [branding.faviconUrl, branding.logoUrl]);

  const accountName = getAccountDisplayName(profile, user);
  const displayName = accountLoading
    ? headerDisplayName?.trim() || null
    : accountName;
  const displayRole = accountRoleLabel(profile);
  const isRecruiter = isLimitedStaffConsoleRole(profile?.role, profile?.is_admin);
  const profilePhoto = profile?.avatar_url ?? null;
  /** Profile label should not stay on Loading… when only notifications fail. */
  const profileNameLoading = accountLoading && !displayName;
  const showBackButton = isCandidateDetailPage(pathname ?? "");

  const handleBackClick = useCallback(() => {
    navigateCandidateDetailBack(router, pathname ?? "");
  }, [router, pathname]);

  return (
    <header className="admin-recruiter-topbar sticky top-0 z-40 w-full bg-white max-[999px]:z-30">
      <div className="flex h-full min-w-0 w-full items-center gap-2 px-3 sm:gap-3 sm:px-5 min-[1000px]:px-[30px] max-[999px]:pr-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2 min-[1000px]:-ml-1.5">
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
                unoptimized
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
                unoptimized
              />
            </button>
          ) : null}
          {showBackButton ? (
            <button
              type="button"
              onClick={handleBackClick}
              className="inline-flex items-center gap-1 rounded-md bg-transparent px-1 py-1 transition hover:bg-slate-50"
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5 shrink-0 text-[#64748B]" aria-hidden />
              <span className="hidden text-sm font-medium text-[color:var(--brand-primary)] min-[420px]:inline">Back</span>
            </button>
          ) : null}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 sm:flex">
          <GodAdminTenantSwitcher />
          <label className="hidden w-[317px] min-w-0 max-w-full cursor-text items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 transition focus-within:border-[color:var(--brand-primary)] md:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HEADER_SEARCH_ICON} alt="" width={20} height={20} className="size-5 shrink-0" aria-hidden />
            <input
              type="search"
              placeholder="Search anything"
              aria-label="Search anything"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] leading-4 font-light text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:ring-0"
            />
          </label>
        </div>

        <div className="relative flex min-w-0 flex-1 justify-end">
          <div className="flex items-center">
            <div ref={messagesAreaRef} className="relative flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setShowMessages((prev) => !prev);
                  setShowNotifications(false);
                  setShowProfileMenu(false);
                }}
                className={HEADER_ICON_BUTTON_CLASS}
                aria-label="Open messages"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={HEADER_CHAT_ICON} alt="" width={20} height={20} className="size-5 shrink-0" aria-hidden />
                {unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#0EA5A4] px-1 text-[10px] font-semibold text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </button>
              <button
                ref={notificationsButtonRef}
                type="button"
                onClick={() => {
                  setShowNotifications((prev) => !prev);
                  setShowMessages(false);
                  setShowProfileMenu(false);
                }}
                className={HEADER_ICON_BUTTON_CLASS}
                aria-label={
                  unreadNotifications > 0
                    ? `Notifications, ${unreadNotifications} unread`
                    : "Notifications"
                }
                aria-expanded={showNotifications}
                title={
                  unreadNotifications > 0
                    ? `Notifications, ${unreadNotifications} unread`
                    : "Notifications"
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={HEADER_BELL_ICON} alt="" width={20} height={20} className="size-5 shrink-0" aria-hidden />
                <HeaderIconCountBadge count={unreadNotifications} />
              </button>

              {showNotifications ? (
                <div
                  role="dialog"
                  aria-label="Notifications"
                  className="absolute right-0 top-10 z-[120] w-[320px] overflow-hidden rounded-lg border border-[#d7e4e1] bg-white shadow-xl max-[499px]:fixed max-[499px]:left-[calc(50%+28px)] max-[499px]:right-auto max-[499px]:top-[68px] max-[499px]:w-[calc(100vw-88px)] max-[499px]:max-w-[360px] max-[499px]:-translate-x-1/2"
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
                    {headerDataLoading ? (
                      <p className="px-4 py-4 text-sm text-[#64748B]">Loading notifications...</p>
                    ) : headerDataError ? (
                      <div className="px-4 py-4">
                        <p className="text-sm text-red-600">
                          {headerDataErrorObj instanceof Error
                            ? headerDataErrorObj.message
                            : "Could not load notifications."}
                        </p>
                        <button
                          type="button"
                          onClick={() => void refetchHeaderData()}
                          className="mt-2 text-xs font-semibold text-[#0EA5A4] hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : notifications.length === 0 ? (
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
                              {formatMessageTime(notification.sent_at)}
                            </p>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {showMessages ? (
                <div className="absolute right-0 top-10 z-[120] w-[320px] overflow-hidden rounded-lg border border-[#d7e4e1] bg-white shadow-xl max-[499px]:fixed max-[499px]:left-[calc(50%+28px)] max-[499px]:right-auto max-[499px]:top-[68px] max-[499px]:w-[calc(100vw-88px)] max-[499px]:max-w-[360px] max-[499px]:-translate-x-1/2">
                  <div className="border-b border-[#E2E8F0] px-4 py-3">
                    <p className="text-sm font-semibold text-[#0F172A]">Messages</p>
                    <p className="text-xs text-[#64748B]">Applicant conversations</p>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {conversations.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-[#64748B]">No applicant messages yet.</p>
                    ) : (
                      conversations.slice(0, 8).map((conversation) => (
                        <Link
                          key={conversation.workerId}
                          href={conversation.href}
                          onClick={() => {
                            setShowMessages(false);
                            void markConversationRead(conversation.workerId);
                          }}
                          className="block border-b border-[#F1F5F9] px-4 py-3 transition hover:bg-[#F8FAFC]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#0F172A]">
                                {conversation.applicantName}
                              </p>
                              <p className="mt-1 truncate text-sm text-[#64748B]">{conversation.preview}</p>
                              <p className="mt-1 text-[11px] text-[#94A3B8]">
                                {formatMessageTime(conversation.sentAt)}
                              </p>
                            </div>
                            {conversation.unreadCount > 0 ? (
                              <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#0EA5A4] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {conversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                  <div className="border-t border-[#E2E8F0] px-4 py-3">
                    <Link
                      href="/admin_recruiter/messages"
                      onClick={() => setShowMessages(false)}
                      className="text-sm font-medium text-[#0EA5A4] hover:underline"
                    >
                      View all messages
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            <Link
              href="/admin_recruiter/help-support"
              onClick={() => {
                setShowMessages(false);
                setShowNotifications(false);
                setShowProfileMenu(false);
              }}
              className={`ml-0.5 ${HEADER_ICON_BUTTON_CLASS}`}
              aria-label="Help and support"
              title="Help and support"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HEADER_HELP_SUPPORT_ICON}
                alt=""
                width={17}
                height={17}
                className="size-[17px] shrink-0"
                aria-hidden
              />
            </Link>

            <div ref={profileAreaRef} className="relative ml-2 sm:ml-[14px]">
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu((prev) => !prev);
                setShowMessages(false);
                setShowNotifications(false);
              }}
              className="flex max-w-full items-center gap-3 rounded-md bg-transparent transition hover:opacity-90"
              aria-label="Open profile menu"
              aria-expanded={showProfileMenu}
            >
            <span className="flex min-w-0 items-center gap-2">
              <StaffProfileAvatar
                name={displayName ?? "Account"}
                photoUrl={profilePhoto}
                size="sm"
                className="text-[14px]!"
              />
              <span className="hidden min-w-0 flex-col text-left sm:flex">
                <span className="-mb-[3px] max-w-[88px] truncate text-[14px] leading-5 font-semibold text-black md:max-w-[140px]">
                  {profileNameLoading ? "Loading..." : displayName ?? "Account"}
                </span>
                <span className="max-w-[88px] truncate text-[10px] leading-[15px] font-light text-[#64748B] md:max-w-[140px]">
                  {displayRole}
                </span>
              </span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HEADER_PROFILE_CHEVRON_ICON}
              alt=""
              width={6}
              height={3.5}
              className="h-[3.5px] w-[6px] shrink-0"
              aria-hidden
            />
            </button>

          {showProfileMenu ? (
            <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-lg border border-[#d7e4e1] bg-white p-2 shadow-xl">
              <div className="mb-1 flex items-center gap-2 px-2">
                <img
                  src={tenantLogoSrc}
                  alt={branding.companyName}
                  className="h-4 w-4 object-contain"
                  onError={() => setTenantLogoSrc(DEFAULT_TENANT_LOGO)}
                />
                <span className="truncate text-[11px] text-[#64748B]">{branding.companyName}</span>
              </div>
              <p className="px-2 py-1 text-xs font-semibold text-[#0F172A]">{displayName}</p>
              <p className="px-2 pb-2 text-[11px] text-[#64748B]">{displayRole}</p>
              <Link
                href={isRecruiter ? "/admin_recruiter/account/personal" : "/admin_recruiter/settings/branding"}
                className="block rounded-md px-2 py-1 text-xs text-[#0F172A] hover:bg-[#f2f8f7]"
              >
                {isRecruiter ? "Profile" : "Settings"}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  const { error } = await supabaseBrowser.auth.signOut();
                  if (error) {
                    console.error("[AdminRecruiterHeader] Supabase error", error);
                    return;
                  }
                  router.push(
                    recruiterLogoutLoginHref({
                      brandingSlug: branding.slug,
                      organizationSubdomain: organization?.subdomain,
                    })
                  );
                }}
                className="mt-1 block w-full rounded-md px-2 py-1 text-left text-xs text-[#0F172A] hover:bg-[#f2f8f7]"
              >
                Logout
              </button>
            </div>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
