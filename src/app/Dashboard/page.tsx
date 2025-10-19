"use client";

import { useState } from "react";
import Link from "next/link";
import LogOutModal from "../components/LogOutModal";
import { useUser } from "@/app/UserContext";

import {
  UsersIcon,
  ChartBarIcon,
  SparklesIcon,
  BookOpenIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

type Role = "teacher" | "student" | "admin" | null;

export default function Dashboard() {
  const { role } = useUser(); // may be "teacher" | "student" | "admin" | null | undefined (during hydration)
  const [showLogout, setShowLogout] = useState(false);

  // 🔧 Normalize to avoid casing/whitespace issues ("Student", "student ", etc.)
  const normalizedRole = (role ?? "")
    .toString()
    .trim()
    .toLowerCase() as Exclude<Role, null>;

  const isTeacher = normalizedRole === "teacher";
  const isStudent = normalizedRole === "student";
  const showShared = role === null || role === undefined || isTeacher || isStudent;

  return (
    <div className="relative min-h-screen bg-gradient-to-b">
      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Welcome / Banner */}
        <section className="mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="absolute inset-0 -z-0 bg-[radial-gradient(40rem_20rem_at_80%_-10%,rgba(15,23,42,0.08),transparent)]" />
            <div className="relative z-10 flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white sm:flex">
                  <SparklesIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {isTeacher
                      ? "Welcome, Teacher!"
                      : isStudent
                      ? "Welcome, Student!"
                      : "Welcome!"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Access tools and learning materials aligned with English 8 MELCs.
                  </p>
                </div>
              </div>
              <div className="mt-2 sm:mt-0">
                <Link
                  href="/quarters"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  Browse Modules
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Teacher-only */}
            {isTeacher && (
              <>
                <DashCard
                  href="/ManageStudent"
                  title="Manage Students"
                  subtitle="Add, update, or remove student records"
                  Icon={UsersIcon}
                />
                <DashCard
                  href="/StudentProgress"
                  title="Student Progress"
                  subtitle="View scores, submissions, and progress"
                  Icon={ChartBarIcon}
                />
              </>
            )}

            {/* Shared (Teacher + Student + while role is resolving) */}
            {showShared && (
              <>
                <DashCard
                  href="/GrammarChecker"
                  title="Grammar Checker"
                  subtitle="AI-powered feedback on writing"
                  Icon={SparklesIcon}
                />
                <DashCard
                  href="/quarters"
                  title="English 8 MELCs"
                  subtitle="Modules, materials, and activities"
                  Icon={BookOpenIcon}
                />
              </>
            )}
          </div>

          {role === null || role === undefined ? (
            <div className="mt-6 text-xs text-slate-500">
              Loading your role… showing student tools meanwhile.
            </div>
          ) : null}
        </section>
      </main>

      {showLogout && (
        <LogOutModal
          closeModal={() => setShowLogout(false)}
          onLogOut={() => setShowLogout(false)}
        />
      )}
    </div>
  );
}

/* ---------- Card Component ---------- */

type CardProps = {
  href: string;
  title: string;
  subtitle: string;
  Icon: React.ElementType; // ✅ matches your project-wide preference
};

function DashCard({ href, title, subtitle, Icon }: CardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition
                 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-slate-100 transition-all group-hover:scale-110" />
      <div className="relative z-10 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{subtitle}</p>
        </div>
        <ArrowRightIcon className="ml-auto h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
      </div>
    </Link>
  );
}
