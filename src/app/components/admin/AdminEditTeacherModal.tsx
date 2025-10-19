"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  XMarkIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export type AdminEditTeacher = {
  id: string;
  email: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

type DebugRecord = {
  phase: "set-password" | "update-teacher" | "bootstrap";
  status?: number;
  url?: string;
  request?: unknown;
  responseJson?: unknown;
  responseText?: string;
  note?: string;
  error?: string;
};

export default function AdminEditTeacherModal({
  teacher,
  onClose,
  onUpdated,
}: {
  teacher: AdminEditTeacher;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [firstName, setFirstName] = useState(teacher.first_name ?? "");
  const [middleName, setMiddleName] = useState(teacher.middle_name ?? "");
  const [lastName, setLastName] = useState(teacher.last_name ?? "");

  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Debug state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState<DebugRecord | null>(null);

  // Small helper to fetch & always capture raw+json for debug
  async function callJSON(
    url: string,
    init: RequestInit,
    phase: DebugRecord["phase"],
    reqPayload?: unknown
  ) {
    try {
      const res = await fetch(url, init);
      const text = await res.text(); // read once
      let json: any = undefined;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        // non-JSON body
      }

      const serverError =
        !res.ok ? json?.error || text || `HTTP ${res.status}` : undefined;

      if (!res.ok) {
        const record: DebugRecord = {
          phase,
          status: res.status,
          url,
          request: reqPayload,
          responseJson: json,
          responseText: text,
          note:
            res.status === 404
              ? "Route not found. Check folder path: src/app/api/teachers/[id]/set-password/route.ts (or /update)."
              : res.status === 401
              ? "Not authenticated. Ensure Authorization: Bearer <access_token> is sent and you’re logged in as an admin."
              : undefined,
        };
        setDebug(record);
        setDebugOpen(true);
      }

      return { res, json, text, serverError };
    } catch (e: any) {
      const record: DebugRecord = {
        phase,
        error: e?.message || String(e),
        url,
        request: reqPayload,
        note:
          "Network/JS error. If using dev server, ensure it’s running and the route compiled without TypeScript errors.",
      };
      setDebug(record);
      setDebugOpen(true);
      return {
        res: undefined as unknown as Response,
        json: undefined,
        text: undefined,
        serverError: e?.message || "Network error",
      };
    }
  }

  const save = async () => {
    setLoading(true);
    setErr(null);
    setMsg(null);
    setDebug(null);
    setDebugOpen(false);

    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (sessErr || !token) {
        setErr("Not authenticated.");
        setDebug({
          phase: "bootstrap",
          error: sessErr?.message || "No session token",
          note:
            "supabase.auth.getSession() returned no token. Log in again as admin.",
        });
        setDebugOpen(true);
        setLoading(false);
        return;
      }

      // 1) Optional: set password (admin-only route)
      if (newPassword.trim().length > 0) {
        const url = `/api/teachers/${teacher.id}/set-password`;
        const payload = { password: newPassword.trim() };

        const { res, json, serverError } = await callJSON(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
          "set-password",
          payload
        );

        if (!res || !res.ok || json?.error) {
          setErr(
            json?.error ||
              serverError ||
              `Failed to set password${
                res?.status ? ` (HTTP ${res.status})` : ""
              }.`
          );
          setLoading(false);
          return;
        }

        setMsg("Password updated.");
      }

      // 2) Update names (always allowed for admin)
      const url2 = `/api/teachers/${teacher.id}/update`;
      const payload2 = {
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
      };

      const { res: res2, json: j2, serverError: err2 } = await callJSON(
        url2,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload2),
        },
        "update-teacher",
        payload2
      );

      if (!res2 || !res2.ok || j2?.error) {
        setErr(j2?.error || err2 || `Failed to update teacher${res2?.status ? ` (HTTP ${res2.status})` : ""}.`);
        setLoading(false);
        return;
      }

      onUpdated();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Unexpected error");
      setDebug({
        phase: "bootstrap",
        error: e?.message ?? "Unexpected error",
      });
      setDebugOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-50 p-2 ring-1 ring-blue-100">
              <UserIcon className="h-5 w-5 text-blue-600" />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Edit Teacher</h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          {err && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5" />
                <p className="flex-1">{err}</p>
                <button
                  onClick={() => setDebugOpen((s) => !s)}
                  className="ml-2 text-xs underline"
                  aria-expanded={debugOpen}
                >
                  {debugOpen ? "Hide details" : "Show details"}
                </button>
              </div>

              {debugOpen && debug && (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-white/70 p-2 text-xs text-gray-800">
{JSON.stringify(debug, null, 2)}
                </pre>
              )}
            </div>
          )}

          {msg && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircleIcon className="mt-0.5 h-5 w-5" />
              <p>{msg}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col">
              <label className="mb-1 text-sm font-medium text-gray-700">First Name</label>
              <input
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label className="mb-1 text-sm font-medium text-gray-700">Last Name</label>
              <input
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="flex flex-col sm:col-span-2">
              <label className="mb-1 text-sm font-medium text-gray-700">
                Middle Name <span className="font-normal text-gray-400">(Optional)</span>
              </label>
              <input
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>
          </div>

          <hr className="my-5 border-gray-200" />

          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
              <KeyIcon className="h-4 w-4 text-blue-600" />
            </span>
            <p className="text-sm font-medium text-gray-900">Set New Password (admin only)</p>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter new password"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <>
                  <EyeSlashIcon className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  Show
                </>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Leave blank to keep the current password.</p>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
