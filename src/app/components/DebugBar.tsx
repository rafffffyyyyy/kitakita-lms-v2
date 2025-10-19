"use client";
import { useMemo, useState } from "react";

export default function DebugBar({
  serverMs, serverRows, clientMs, error,
}: {
  serverMs?: number;
  serverRows?: { roster: number; subs: number };
  clientMs?: { filters?: number; data?: number };
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [whoami, setWhoami] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const blob = useMemo(() => JSON.stringify(
    { serverMs, serverRows, clientMs, error, whoami },
    null, 2
  ), [serverMs, serverRows, clientMs, error, whoami]);

  const check = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/progress/whoami", { cache: "no-store" });
      setWhoami(await res.json());
    } catch (e: any) {
      setWhoami({ fetchError: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-3 left-3 z-40">
      <div className="rounded-2xl shadow-lg bg-white border border-neutral-200">
        <button className="px-3 py-2 text-xs rounded-t-2xl w-full text-left hover:bg-neutral-50"
                onClick={() => setOpen(o => !o)}>
          {open ? "Hide" : "Show"} Debug
        </button>
        {open && (
          <div className="p-3 max-h-72 w-[360px] overflow-auto">
            <div className="mb-2 flex gap-2">
              <button className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                      onClick={check} disabled={busy}>
                {busy ? "Checking…" : "Who am I?"}
              </button>
              <button className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50"
                      onClick={() => navigator.clipboard.writeText(blob)}>
                Copy
              </button>
            </div>
            <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words">{blob}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
