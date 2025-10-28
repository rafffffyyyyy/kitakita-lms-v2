// File: /src/app/layout.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import localFont from "next/font/local";
import { Bars3Icon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/app/components/Sidebar";
import { UserProvider, useUser } from "@/app/UserContext";
import { supabase } from "@/lib/supabase";
import ClientOnly from "@/app/components/ClientOnly";
import "./globals.css";

/* 🔔 NEW: bell UI */
import NotificationBell from "@/app/components/notifications/NotificationBell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

type Profile = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  profile_picture_url?: string | null;
};

/* ---------- Inner shell so we can use useUser() ---------- */
function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = useMemo(() => (pathname ?? "/") !== "/", [pathname]);

  // Sidebar state
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("sidebar-collapsed");
      return raw ? raw === "true" : true;
    }
    return true;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // From UserContext (same source as profile/page.tsx)
  const { role: ctxRole, userId: ctxUid, refreshRole } = useUser();

  // Header state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  // Fetch display name + avatar (use role from context)
  const runFetch = async () => {
    const ts = Date.now();

    const { data: authRes } = await supabase.auth.getUser();
    const user = authRes?.user ?? null;
    if (!user) {
      setIsLoggedIn(false);
      setProfile(null);
      setProfilePicUrl(null);
      setUid(null);
      return;
    }

    setIsLoggedIn(true);
    setUid(user.id);

    // Profiles row — used for name + (teacher/admin) avatar
    const profSel = await supabase
      .from("profiles")
      .select("id, first_name, middle_name, last_name, email, profile_picture_url")
      .eq("id", user.id)
      .maybeSingle();

    let profilesUrl: string | null = null;
    let profilesRow: any = null;

    if (!profSel.error) {
      profilesRow = profSel.data ?? null;
      profilesUrl = profilesRow?.profile_picture_url ?? null;
    }

    const prof: Profile | null = profilesRow
      ? {
          first_name: profilesRow.first_name,
          middle_name: profilesRow.middle_name,
          last_name: profilesRow.last_name,
          email: profilesRow.email,
          profile_picture_url: profilesUrl,
        }
      : {
          first_name: (user.user_metadata as any)?.first_name ?? null,
          middle_name: (user.user_metadata as any)?.middle_name ?? null,
          last_name: (user.user_metadata as any)?.last_name ?? null,
          email: user.email ?? null,
          profile_picture_url: null,
        };
    setProfile(prof);

    // If we already have avatar from profiles (teachers/admins), use it
    let chosen = profilesUrl;

    // If student (per context role), fallback to students.profile_picture_url
    if (!chosen && ctxRole === "student") {
      const stuSel = await supabase
        .from("students")
        .select("profile_picture_url")
        .eq("id", user.id)
        .maybeSingle();

      const studentUrl = stuSel.error ? null : (stuSel.data?.profile_picture_url ?? null);
      chosen = chosen || studentUrl || null;
    }

    // cache-bust
    const finalUrl = chosen ? `${chosen}${chosen.includes("?") ? "&" : "?"}v=${ts}` : null;
    setProfilePicUrl(finalUrl);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mounted) {
        await runFetch();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      await refreshRole().catch(() => {});
      await runFetch();
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxRole]); // re-run when role from context changes

  // Sidebar toggle
  const handleHamburger = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  // Display info
  const displayName =
    [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "User";
  const initials = (displayName?.[0] ?? "U").toUpperCase();

  const roleLabel =
    ctxRole === "admin" ? "Admin" : ctxRole === "teacher" ? "Teacher" : ctxRole === "student" ? "Student" : "—";

  const profileHref = "/profile";

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-slate-200/70 shadow-sm">
        <div className="h-14 flex items-center gap-3 px-4 lg:px-6">
          {showSidebar && (
            <button
              onClick={handleHamburger}
              className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-slate-100 active:scale-95 transition"
              aria-label="Toggle sidebar"
            >
              <Bars3Icon className="h-6 w-6 text-slate-700" />
            </button>
          )}

          {/* Logo + Title */}
          <div className="flex items-center gap-2">
            <Image
              src="/images/KHS/KHS.png"
              alt="KHS Logo"
              width={40}
              height={40}
              className="h-8 w-8 rounded ring-1 ring-slate-200 object-contain"
            />
            <span className="text-base font-semibold tracking-tight">Kita-Kita LMS</span>
          </div>

          {/* User badge + avatar */}
          {showSidebar && isLoggedIn && (
            <div className="ml-auto flex items-center gap-2">
              {/* 🔔 NEW: show notifications only for Teacher & Student */}
              {(ctxRole === "teacher" || ctxRole === "student") && <NotificationBell />}

              <Link
                href={profileHref}
                className="flex items-center gap-3 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition"
                aria-label="Open profile"
              >
                <div className="hidden sm:block text-right leading-tight">
                  <div className="text-sm font-medium text-slate-900 truncate max-w-[160px]">
                    {displayName}
                  </div>
                  <div className="text-xs text-slate-500">{roleLabel}</div>
                </div>

                {profilePicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePicUrl}
                    alt="User avatar"
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-300"
                    onError={() => {
                      setProfilePicUrl(null);
                    }}
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-slate-800 text-white text-sm grid place-items-center ring-1 ring-slate-300">
                    {initials}
                  </div>
                )}
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Layout Shell */}
      {showSidebar ? (
        <div className="flex flex-1">
          <Sidebar
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />
          <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      ) : (
        <main className="flex-1 min-w-0">{children}</main>
      )}
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-[family-name:var(--font-geist-sans)] antialiased bg-slate-50 text-slate-900`}
      >
        <UserProvider>
          <ClientOnly>
            <div className="min-h-screen flex flex-col">
              <LayoutShell>{children}</LayoutShell>
            </div>
          </ClientOnly>
        </UserProvider>
      </body>
    </html>
  );
}
