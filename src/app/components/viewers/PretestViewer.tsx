"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FlagIcon } from "@heroicons/react/24/outline";
import QuizRunner from "./QuizRunner";

type QuizRow = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  type: "pre_test";
  time_limit_minutes: number | null;
  available_from: string | null;
  expires_at: string | null;
  max_attempts: number | null;
  reveal_correct_answers: boolean | null;
  is_published: boolean | null;
  shuffle: boolean | null;
};

export default function PretestViewer({ moduleId }: { moduleId: string }) {
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select<
          "id,module_id,title,description,type,time_limit_minutes,available_from,expires_at,max_attempts,reveal_correct_answers,is_published,shuffle"
        >()
        .eq("module_id", moduleId)
        .eq("type", "pre_test")
        .eq("is_published", true)
        .limit(1)
        .maybeSingle();

      if (error) console.error(error);
      setQuiz((data as unknown) as QuizRow | null);
      setLoading(false);
    })();
  }, [moduleId]);

  const title = useMemo(() => quiz?.title || "Pre-Test", [quiz]);

  if (loading) {
    return <div className="rounded-2xl border bg-white p-4">Loading Pre-Test…</div>;
  }

  if (!quiz) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center gap-2">
          <FlagIcon className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold">Pre-Test</h2>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          No Pre-Test has been published for this module yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FlagIcon className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="ml-2 rounded-full bg-slate-100 text-slate-700 text-xs px-2 py-0.5">
          Pre-Test
        </span>
      </div>
      <QuizRunner quiz={quiz} moduleId={moduleId} />
    </div>
  );
}
