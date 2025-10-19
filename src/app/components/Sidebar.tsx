"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HomeIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import LogOutModal from "@/app/components/LogOutModal";
import { useUser } from "@/app/UserContext";

type Props = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function cx(...c: Array<string | boolean | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const { role } = useUser(); // "admin" | "teacher" | "student" | null
  const pathname = usePathname();
  const W = collapsed ? "w-[72px]" : "w-64";
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const handleLoggedOut = () => {
    setShowLogout(false);
    onCloseMobile();
    window.location.href = "/";
  };

  const openLogout = () => setShowLogout(true);

  const Item = ({
    href,
    label,
    Icon,
  }: {
    href: string;
    label: string;
    Icon: React.ElementType;
  }) => {
    const active =
      pathname === href || pathname?.startsWith(href + "/");

    const linkBase =
      "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";
    const linkState = active
      ? "bg-indigo-600 text-white shadow-md"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";

    const layoutExpanded = "justify-start px-3 gap-3 h-11";
    const layoutCollapsed = "justify-center px-0 h-11";

    return (
      <Link
        href={href}
        className={cx(linkBase, linkState, collapsed ? layoutCollapsed : layoutExpanded)}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  /* -------------------- Role-based nav -------------------- */
  const TeacherNav = (
    <>
      <Item href="/Dashboard" label="Home" Icon={HomeIcon} />
      <Item href="/GrammarChecker" label="Grammar Checker" Icon={SparklesIcon} />
      <Item href="/quarters" label="English 8 MELCs" Icon={AcademicCapIcon} />
      <Item href="/ManageStudent" label="Manage Student" Icon={UserGroupIcon} />
      <Item href="/StudentProgress" label="Student Progress" Icon={ChartBarIcon} />
    </>
  );

  const StudentNav = (
    <>
      <Item href="/Dashboard" label="Home" Icon={HomeIcon} />
      <Item href="/GrammarChecker" label="Grammar Checker" Icon={SparklesIcon} />
      <Item href="/quarters" label="English 8 MELCs" Icon={AcademicCapIcon} />
    </>
  );

  // Admin: no nav items, but keep Logout visible
  const NavList =
    role === "teacher" ? TeacherNav :
    role === "student" ? StudentNav :
    null;

  const LogoutButton = (
    <button
      onClick={openLogout}
      className={cx(
        "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600",
        "hover:bg-red-50 transition-all duration-200"
      )}
    >
      <ArrowLeftOnRectangleIcon className="h-5 w-5" />
      {!collapsed && <span>Logout</span>}
    </button>
  );

  const Panel = (
    <aside
      className={cx(
        "hidden lg:flex flex-col border-r bg-white/90 backdrop-blur-sm",
        "sticky top-14 h-[calc(100dvh-3.5rem)] shadow-sm",
        W,
        "transition-[width] duration-300 ease-in-out"
      )}
      aria-label="Sidebar"
    >
      <div className="flex flex-col justify-between h-full">
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {NavList}
        </nav>
        <div className="border-t px-2 py-3">{LogoutButton}</div>
      </div>
    </aside>
  );

  const Drawer = (
    <div className={cx("fixed inset-0 z-40 lg:hidden", mobileOpen ? "" : "pointer-events-none")}>
      <div
        className={cx(
          "absolute inset-0 bg-black/40 transition-opacity",
          mobileOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <div
        className={cx(
          "absolute left-0 top-14 h-[calc(100dvh-3.5rem)] bg-white border-r shadow-xl transition-transform flex flex-col justify-between",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          W
        )}
        role="dialog"
        aria-modal="true"
      >
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {NavList}
        </nav>
        <div className="border-t px-2 py-3">{LogoutButton}</div>
      </div>
    </div>
  );

  return (
    <>
      {Panel}
      {Drawer}
      {showLogout && (
        <LogOutModal closeModal={() => setShowLogout(false)} onLogOut={handleLoggedOut} />
      )}
    </>
  );
}
