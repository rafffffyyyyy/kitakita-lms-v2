"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DebugAuthPage() {
  const [out, setOut] = useState<string>("");

  const log = (x:any) => setOut(p => p + "\n" + (typeof x === "string" ? x : JSON.stringify(x,null,2)));

  return (
    <div className="p-4 space-y-2">
      <button className="border px-3 py-2" onClick={async ()=>{
        const { data } = await supabase.auth.getSession();
        log({ session: !!data.session, user: data.session?.user?.id });
      }}>Check session</button>

      <button className="border px-3 py-2" onClick={async ()=>{
        log("SDK signOut…");
        const { error } = await supabase.auth.signOut();
        log({ sdkError: error?.message ?? null });
      }}>Logout via SDK</button>

      <button className="border px-3 py-2" onClick={async ()=>{
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? "";
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
          },
        });
        log({ restStatus: res.status, restBody: await res.text() });
      }}>Logout via REST</button>

      <pre className="mt-3 bg-slate-100 p-2 text-sm whitespace-pre-wrap">{out}</pre>
    </div>
  );
}
