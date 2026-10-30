"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { WorkerListRow } from "../figma-demo-data";

const MENU_WIDTH = 208; // w-52
const MENU_ESTIMATED_HEIGHT = 180;

export type WorkerActionsMenuPortalProps = {
  worker: WorkerListRow;
  anchor: HTMLElement;
  onClose: () => void;
  onAction: (action: "facilities" | "manager" | "history" | "message" | "email", worker: WorkerListRow) => void;
};

export function WorkerActionsMenuPortal({
  worker,
  anchor,
  onClose,
  onAction,
}: WorkerActionsMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const updatePosition = useCallback(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();

    // If anchor is completely out of the viewport, close menu
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onClose();
      return;
    }

    let top = rect.bottom + 4;
    // If opening downward would clip below the viewport, flip upward
    if (top + MENU_ESTIMATED_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, rect.top - MENU_ESTIMATED_HEIGHT - 4);
    }

    // Keep horizontally within viewport boundaries
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));

    setStyle({
      position: "fixed",
      top,
      left,
      width: MENU_WIDTH,
      visibility: "visible",
    });
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Worker actions"
      style={style}
      className="z-[250] overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAction("facilities", worker);
          onClose();
        }}
        className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition cursor-pointer"
      >
        View Assigned Facilities
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAction("manager", worker);
          onClose();
        }}
        className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition cursor-pointer"
      >
        Change Manager
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAction("history", worker);
          onClose();
        }}
        className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition cursor-pointer"
      >
        Status History
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAction("message", worker);
          onClose();
        }}
        className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition cursor-pointer"
      >
        Message
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAction("email", worker);
          onClose();
        }}
        className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition cursor-pointer"
      >
        Email
      </button>
    </div>,
    document.body
  );
}

