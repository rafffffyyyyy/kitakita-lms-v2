"use client";

import { createContext, useContext, useEffect, useState } from "react";

type SidebarCtx = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;

  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
};

const Ctx = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Load persisted desktop collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lms:sidebar-collapsed");
      if (saved != null) setCollapsed(saved === "1");
    } catch {/* ignore */}
  }, []);

  // Persist when changed
  useEffect(() => {
    try {
      localStorage.setItem("lms:sidebar-collapsed", collapsed ? "1" : "0");
    } catch {/* ignore */}
  }, [collapsed]);

  return (
    <Ctx.Provider
      value={{
        collapsed,
        toggleCollapsed: () => setCollapsed(v => !v),
        setCollapsed,
        mobileOpen,
        openMobile: () => setMobileOpen(true),
        closeMobile: () => setMobileOpen(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}
