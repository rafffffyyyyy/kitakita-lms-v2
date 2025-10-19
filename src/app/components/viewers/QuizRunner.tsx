// /app/components/viewers/QuizRunner.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ClockIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { useUser } from "@/app/UserContext";

/* --------------------------------- Types ---------------------------------- */
type QuizRow = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  type: "pre_test" | "post_test" | "quiz";
  time_limit_minutes: number | null;
  available_from: string | null;
  expires_at: string | null;
  max_attempts: number | null;
  reveal_correct_answers: boolean | null;
  is_published: boolean | null;
  shuffle: boolean | null;
};

type QuestionRich = {
  underline?: { text: string; caseSensitive?: boolean };
};

type QuestionRow = {
  id: string;
  quiz_id: string;
  order_index: number | null;
  question_text: string | null;
  instruction_text: string | null;
  instruction_images: string[] | null; // _text[]
  points: number | null;
  question_rich?: QuestionRich | null; // JSONB from AddQuiz
};

type ChoiceRow = {
  id: string;
  question_id: string;
  order_index: number | null;
  choice_text: string | null;
  is_correct: boolean | null;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  student_id: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_seconds: number | null;
  score: number | null;
  is_preview: boolean | null;
  attempt_number: number | null;
  meta: any | null; // { answers: Record<qid, string[]> }
};

/* ----------------------------- Helpers ------------------------------------ */
function findFirstOccurrence(haystack: string, needle: string, caseSensitive?: boolean) {
  if (!needle) return -1;
  return caseSensitive ? haystack.indexOf(needle) : haystack.toLowerCase().indexOf(needle.toLowerCase());
}

function UnderlineOnce({
  text,
  phrase,
  caseSensitive,
}: {
  text: string;
  phrase?: string;
  caseSensitive?: boolean;
}) {
  if (!phrase) return <>{text}</>;
  const idx = findFirstOccurrence(text, phrase, caseSensitive);
  if (idx < 0) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + phrase.length);
  const after = text.slice(idx + phrase.length);
  return (
    <>
      {before}
      <span className="underline underline-offset-2 decoration-2">{match}</span>
      {after}
    </>
  );
}

/* ----------------------------- Component ---------------------------------- */
export default function QuizRunner({
  quiz,
  moduleId, // reserved; not used for now
  onBack,
}: {
  quiz: QuizRow;
  moduleId: string;
  onBack?: () => void;
}) {
  /* identity & role */
  const { role, userId: ctxUid, loading: userLoading, refreshRole } = useUser();
  const normRole = useMemo(() => `${role ?? ""}`.trim().toLowerCase(), [role]);
  const isStudent = normRole === "student";
  const isTeacher = normRole === "teacher";

  const [authUid, setAuthUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUid(data.user?.id ?? null));
    refreshRole().catch(() => void 0);
  }, [refreshRole]);

  const studentId = ctxUid ?? authUid ?? null;

  /* run state */
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [attemptInfo, setAttemptInfo] = useState<{ total: number; lastScore?: number | null }>({ total: 0 });
  const [started, setStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [choicesByQ, setChoicesByQ] = useState<Record<string, ChoiceRow[]>>({});
  const [answers, setAnswers] = useState<Record<string, string[]>>({}); // qid -> choiceIds

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // ⏱️ robust timer
  const tickRef = useRef<number | null>(null);
  const autoSubmitTimeoutRef = useRef<number | null>(null);
  const deadlineTsRef = useRef<number | null>(null);
  const autoSubmittingRef = useRef<boolean>(false);
  const startedAtRef = useRef<Date | null>(null);

  /* review state (also loaded from DB on open) */
  const [success, setSuccess] = useState<{ score: number } | null>(null);
  const [review, setReview] = useState<{
    score: number;
    answers: Record<string, string[]>;
    submittedAt: string;
  } | null>(null);

  /* lightbox */
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* derived values */
  const timeLimitSeconds = useMemo(
    () => (quiz.time_limit_minutes ? quiz.time_limit_minutes * 60 : null),
    [quiz.time_limit_minutes]
  );

  const withinWindow = useMemo(() => {
    const af = quiz.available_from ? new Date(quiz.available_from) : null;
    const ex = quiz.expires_at ? new Date(quiz.expires_at) : null;
    const n = new Date();
    if (af && n < af) return false;
    if (ex && n > ex) return false;
    return true;
  }, [quiz.available_from, quiz.expires_at]);

  const maxAttempts = quiz.max_attempts ?? 1;

  /* --------------------------------- Data ---------------------------------- */
  const fetchQuestions = async () => {
    const { data: qs, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id,quiz_id,order_index,question_text,instruction_text,instruction_images,points,question_rich")
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true });
    if (qErr) throw qErr;

    const qsArr = ((qs as unknown) as QuestionRow[]) ?? [];
    const qids = qsArr.map((q) => q.id);
    if (!qids.length) {
      setQuestions([]);
      setChoicesByQ({});
      return;
    }

    const { data: ch, error: cErr } = await supabase
      .from("quiz_choices")
      .select("id,question_id,order_index,choice_text,is_correct")
      .in("question_id", qids)
      .order("order_index", { ascending: true });
    if (cErr) throw cErr;

    const byQ: Record<string, ChoiceRow[]> = {};
    for (const id of qids) byQ[id] = [];
    (((ch as unknown) as ChoiceRow[]) ?? []).forEach((c) => {
      (byQ[c.question_id] ||= []).push(c);
    });

    if (quiz.shuffle) {
      qsArr.sort(() => Math.random() - 0.5);
      for (const q of qsArr) byQ[q.id]?.sort(() => Math.random() - 0.5);
    }

    setQuestions(qsArr);
    setChoicesByQ(byQ);
  };

  /** Load last submitted attempt (for persistent review on reopen). */
  const loadLatestSubmission = async (sid: string) => {
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("submitted_at, score, meta, attempt_number")
      .eq("quiz_id", quiz.id)
      .eq("student_id", sid)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.submitted_at) {
      setReview(null);
      return;
    }
    try {
      const meta = (data as any)?.meta || {};
      const ans = (meta?.answers ?? {}) as Record<string, string[]>;
      if (ans && typeof ans === "object") {
        setReview({
          score: data.score ?? 0,
          answers: ans,
          submittedAt: data.submitted_at!,
        });
      } else {
        setReview(null);
      }
    } catch {
      setReview(null);
    }
  };

  /* load questions always; load attempts only for students */
  useEffect(() => {
    if (userLoading) return;
    (async () => {
      await fetchQuestions();

      if (!isStudent || !studentId) {
        setAttemptInfo({ total: 0, lastScore: undefined });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("quiz_attempts")
        .select("id,score,attempt_number,submitted_at")
        .eq("quiz_id", quiz.id)
        .eq("student_id", studentId)
        .order("attempt_number", { ascending: false });

      if (error) {
        console.error("[attempts]", error);
        setAttemptInfo({ total: 0 });
      } else {
        const rows = (data as AttemptRow[]) ?? [];
        setAttemptInfo({ total: rows.length, lastScore: rows.length ? rows[0].score : null });

        const lastSubmitted = rows.find((r) => r.submitted_at) ?? null;
        if (lastSubmitted) await loadLatestSubmission(studentId);
        else setReview(null);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, isStudent, studentId, quiz.id]);

  /* ----------------------------- Timer helpers ----------------------------- */
  const clearRunningTimers = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoSubmitTimeoutRef.current) {
      window.clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
  };

  const forceAutoSubmit = () => {
    if (autoSubmittingRef.current || submitting) return;
    autoSubmittingRef.current = true;
    submitAttempt(true);
  };

  const setupTimer = (limitSeconds: number) => {
    const deadline = Date.now() + limitSeconds * 1000;
    deadlineTsRef.current = deadline;

    const compute = () => Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    setSecondsLeft(compute());

    tickRef.current = window.setInterval(() => {
      const remain = compute();
      setSecondsLeft(remain);
      if (remain <= 0) {
        clearRunningTimers();
        forceAutoSubmit();
      }
    }, 1000) as unknown as number;

    autoSubmitTimeoutRef.current = window.setTimeout(() => {
      clearRunningTimers();
      forceAutoSubmit();
    }, limitSeconds * 1000) as unknown as number;
  };

  // re-sync timer on visibility change / wake
  useEffect(() => {
    const onVis = () => {
      if (!started || !deadlineTsRef.current) return;
      const remain = Math.max(0, Math.floor((deadlineTsRef.current - Date.now()) / 1000));
      setSecondsLeft(remain);
      if (remain <= 0) {
        clearRunningTimers();
        forceAutoSubmit();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [started]);

  /* ----------------------------- Start attempt ----------------------------- */
  const startAttempt = async () => {
    if (!isStudent || !studentId) return;
    if (!withinWindow) return;
    if (!(quiz.is_published ?? false)) return;
    if (attemptInfo.total >= maxAttempts) return;

    setStarting(true);
    try {
      await fetchQuestions();

      const { data: prev, error: prevErr } = await supabase
        .from("quiz_attempts")
        .select("attempt_number")
        .eq("quiz_id", quiz.id)
        .eq("student_id", studentId)
        .order("attempt_number", { ascending: false })
        .limit(1);
      if (prevErr) throw prevErr;

      const prevRows = (prev as AttemptRow[]) ?? [];
      const nextAttempt = (prevRows[0]?.attempt_number ?? 0) + 1;

      const { data: inserted, error: insErr } = await supabase
        .from("quiz_attempts")
        .insert([
          {
            quiz_id: quiz.id,
            student_id: studentId,
            started_at: new Date().toISOString(),
            is_preview: false,
            attempt_number: nextAttempt,
            duration_seconds: 0,
            score: 0,
            meta: null,
          } as Partial<AttemptRow>,
        ])
        .select("id")
        .single();
      if (insErr) throw insErr;

      setAttemptId((inserted as { id: string }).id);
      setStarted(true);
      setReview(null);
      autoSubmittingRef.current = false;
      startedAtRef.current = new Date();

      if (timeLimitSeconds) setupTimer(timeLimitSeconds);
      else setSecondsLeft(null);
    } catch (e: any) {
      console.error("[startAttempt error]", e);
      alert("Failed to start the quiz.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      clearRunningTimers();
    };
  }, []);

  const isMulti = (q: QuestionRow) => {
    const choices = choicesByQ[q.id] || [];
    return choices.filter((c) => !!c.is_correct).length > 1;
  };

  const toggleAnswer = (qid: string, cid: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qid] || [];
      if (multi) {
        const next = cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid];
        return { ...prev, [qid]: next };
      }
      return { ...prev, [qid]: [cid] };
    });
  };

  const computeScore = () => {
    let total = 0;
    for (const q of questions) {
      const pts = q.points ?? 1;
      const selected = (answers[q.id] ?? []).slice().sort();
      const correct = (choicesByQ[q.id] || [])
        .filter((c) => !!c.is_correct)
        .map((c) => c.id)
        .sort();
      const isExact = selected.length === correct.length && selected.every((v, i) => v === correct[i]);
      if (isExact) total += pts;
    }
    return total;
  };

  const refreshAttemptsInBackground = async (scoreJustSaved: number) => {
    if (!isStudent || !studentId) return;
    try {
      const { data } = await supabase
        .from("quiz_attempts")
        .select("id,score,attempt_number,submitted_at")
        .eq("quiz_id", quiz.id)
        .eq("student_id", studentId)
        .order("attempt_number", { ascending: false });
      const rows = (data as AttemptRow[]) ?? [];
      setAttemptInfo({ total: rows.length, lastScore: scoreJustSaved });
      await loadLatestSubmission(studentId);
    } catch {
      setAttemptInfo((p) => ({ total: p.total || 1, lastScore: scoreJustSaved }));
    }
  };

  const submitAttempt = async (auto = false) => {
    if (!attemptId || submitting) return;

    setSubmitting(true);
    try {
      const score = computeScore();
      const startedAt = startedAtRef.current ?? new Date();
      const dur = Math.max(1, Math.floor((Date.now() - startedAt.getTime()) / 1000));
      const payloadMeta = { answers, autoSubmitted: auto };

      const { error: upErr } = await supabase
        .from("quiz_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          duration_seconds: dur,
          score,
          meta: payloadMeta as any,
        })
        .eq("id", attemptId);
      if (upErr) throw upErr;

      clearRunningTimers();
      setStarted(false);
      setSuccess({ score });
      setReview({
        score,
        answers: JSON.parse(JSON.stringify(answers)),
        submittedAt: new Date().toISOString(),
      });

      void refreshAttemptsInBackground(score);
    } catch (e: any) {
      console.error("[submitAttempt error]", e);
      alert("Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------- UI helpers ------------------------------ */
  const timeBadge = () => {
    if (secondsLeft === null) return null;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    const urgent = secondsLeft <= 10;
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-medium bg-white ${
          urgent ? "border-rose-300 text-rose-700" : ""
        }`}
        title="Auto-submit at 00:00"
      >
        <ClockIcon className="h-4 w-4" />
        {m}:{s.toString().padStart(2, "0")}
        <span className="hidden sm:inline text-[11px] text-slate-500">• auto-submit at 00:00</span>
      </span>
    );
  };

  const InfoBanner = ({ text }: { text: string }) => (
    <div className="rounded-lg border bg-amber-50 px-3 py-2 text-xs text-amber-900">{text}</div>
  );

  const QuestionHeader = ({ q, idx }: { q: QuestionRow; idx: number }) => {
    const underline = q.question_rich?.underline;
    return (
      <header className="mb-3">
        <div className="text-sm font-semibold text-slate-900">
          Q{idx + 1}.{" "}
          <UnderlineOnce
            text={q.question_text || "Untitled question"}
            phrase={underline?.text}
            caseSensitive={underline?.caseSensitive}
          />
        </div>
        {q.instruction_text && <div className="mt-1 text-xs text-slate-600">{q.instruction_text}</div>}
        {Array.isArray(q.instruction_images) && q.instruction_images.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <PhotoIcon className="h-4 w-4" />
              {`Additional information ${q.instruction_images.length > 1 ? "images" : "image"}`}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {q.instruction_images.map((url, i) => (
                <button
                  key={`${q.id}-img-${i}`}
                  type="button"
                  onClick={() => setLightbox({ url, alt: `Additional information image ${i + 1}` })}
                  className="group relative overflow-hidden rounded-lg border bg-white p-0"
                  aria-label="Open image"
                >
                  <img
                    src={url}
                    alt={`Additional information image ${i + 1}`}
                    loading="lazy"
                    className="h-44 w-full object-contain transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-slate-200/70" />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-1 text-[11px] text-slate-500">Points: {q.points ?? 1}</div>
      </header>
    );
  };

  const header = (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-0.5">
        <h2 className="truncate text-lg font-semibold">{quiz.title || "Quiz"}</h2>
        {quiz.description && <p className="text-sm text-slate-600">{quiz.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {quiz.time_limit_minutes ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <ClockIcon className="h-4 w-4" />
              {quiz.time_limit_minutes} min limit
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <ClockIcon className="h-4 w-4" />
              No time limit
            </span>
          )}
          {quiz.available_from && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <InformationCircleIcon className="h-4 w-4" />
              Opens: {new Date(quiz.available_from).toLocaleString()}
            </span>
          )}
          {quiz.expires_at && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <InformationCircleIcon className="h-4 w-4" />
              Closes: {new Date(quiz.expires_at).toLocaleString()}
            </span>
          )}
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <CheckCircleIcon className="h-4 w-4" />
            Attempts: {attemptInfo.total}/{quiz.max_attempts ?? 1}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 whitespace-nowrap">
        {started && timeBadge()}
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
            <ArrowUturnLeftIcon className="h-4 w-4" /> Back
          </button>
        )}
      </div>
    </div>
  );

  const SuccessModal = () =>
    !success ? null : (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircleIcon className="h-6 w-6" />
            <h3 className="text-lg font-semibold">Submitted successfully</h3>
          </div>
          <p className="mt-2 text-slate-700">
            Your score: <span className="font-semibold">{success.score}</span>
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setSuccess(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      </div>
    );

  const Lightbox = () =>
    !lightbox ? null : (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        onClick={() => setLightbox(null)}
      >
        <div className="max-h-[90vh] max-w-[95vw]">
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );

  /* -------------------------------- Renders -------------------------------- */

  // skeleton
  if (userLoading || loading) {
    return (
      <div className="rounded-2xl border bg-white p-4">
        {header}
        <div className="mt-6 space-y-3">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  /* ------------------------- TEACHER PREVIEW MODE -------------------------- */
  if (isTeacher) {
    return (
      <div className="rounded-2xl border bg-white p-4">
        {header}
        <div className="mt-4">
          <InfoBanner text="Teacher preview — answers are revealed. No attempts or scores are recorded." />
        </div>

        <div className="mt-4 space-y-6">
          {questions.map((q, idx) => {
            const cset = choicesByQ[q.id] || [];
            return (
              <section key={`t-${q.id}`} className="rounded-xl border p-4">
                <QuestionHeader q={q} idx={idx} />
                <ul className="space-y-2">
                  {cset.map((c) => {
                    const correct = !!c.is_correct;
                    return (
                      <li
                        key={`t-${c.id}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          correct
                            ? "border-emerald-300 bg-emerald-50/60"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <span className="mr-2">{correct ? "✓" : "○"}</span>
                        <span className={correct ? "font-medium" : ""}>{c.choice_text}</span>
                        {correct && <span className="ml-2 text-xs text-emerald-700">(correct)</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <Lightbox />
      </div>
    );
  }

  /* ----------------------------- STUDENT FLOWS ----------------------------- */

  // compute start availability (do NOT early-return anymore)
  const noAttemptsLeft = attemptInfo.total >= maxAttempts;
  const canStart = isStudent && (quiz.is_published ?? false) && withinWindow && !noAttemptsLeft;

  // Not started: header + score + banners + review (if any)
  if (!started) {
    const closedBanner = !withinWindow
      ? review
        ? "This quiz is closed. You can still review your submission below."
        : "This quiz isn’t available right now."
      : null;

    const unpublishedBanner = withinWindow && !(quiz.is_published ?? false)
      ? review
        ? "This quiz is not published, but you can still review your previous submission."
        : "This quiz isn’t published yet."
      : null;

    let startLabel = "Start attempt";
    if (!withinWindow) startLabel = "Closed";
    else if (!(quiz.is_published ?? false)) startLabel = "Not published";
    else if (noAttemptsLeft) startLabel = "No attempts left";

    return (
      <div className="rounded-2xl border bg-white p-4">
        {header}

        <div className="mt-4 space-y-3">
          {closedBanner && <InfoBanner text={closedBanner} />}
          {unpublishedBanner && <InfoBanner text={unpublishedBanner} />}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border bg-slate-50 p-4">
          <div className="text-sm text-slate-700">
            {attemptInfo.lastScore !== undefined && attemptInfo.lastScore !== null ? (
              <div>
                Score: <span className="font-semibold">{attemptInfo.lastScore}</span>
              </div>
            ) : (
              <div>No attempts yet.</div>
            )}
          </div>
          <button
            onClick={startAttempt}
            disabled={!canStart || starting}
            className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {starting ? "Starting…" : startLabel}
          </button>
        </div>

        {/* Persistent review panel (from DB) */}
        {review && (
          <div className="mt-4 rounded-xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your last submission</h3>
              <span className="text-xs text-slate-600">{new Date(review.submittedAt).toLocaleString()}</span>
            </div>
            <div className="text-sm text-slate-700">
              Total score: <span className="font-semibold">{review.score}</span>
            </div>

            <div className="mt-4 space-y-4">
              {questions.map((q, idx) => {
                const selected = (review.answers[q.id] ?? []).slice().sort();
                const correct = (choicesByQ[q.id] || [])
                  .filter((c) => !!c.is_correct)
                  .map((c) => c.id)
                  .sort();
                const isExact = selected.length === correct.length && selected.every((v, i) => v === correct[i]);

                return (
                  <div
                    key={`rv-${q.id}`}
                    className={`rounded-lg border p-4 ${
                      isExact ? "border-emerald-300 bg-emerald-50/40" : "border-rose-300 bg-rose-50/40"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-900">
                        Q{idx + 1}.{" "}
                        <UnderlineOnce
                          text={q.question_text || "Untitled question"}
                          phrase={q.question_rich?.underline?.text}
                          caseSensitive={q.question_rich?.underline?.caseSensitive}
                        />
                      </div>
                      <span className={`text-xs font-medium ${isExact ? "text-emerald-700" : "text-rose-700"}`}>
                        {isExact ? "Correct" : "Incorrect"}
                      </span>
                    </div>

                    {q.instruction_text && <div className="text-xs text-slate-600">{q.instruction_text}</div>}

                    {Array.isArray(q.instruction_images) && q.instruction_images.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                          <PhotoIcon className="h-4 w-4" />
                          {`Additional information ${q.instruction_images.length > 1 ? "images" : "image"}`}
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {q.instruction_images.map((url, i) => (
                            <button
                              key={`rv-${q.id}-img-${i}`}
                              type="button"
                              onClick={() => setLightbox({ url, alt: `Additional information image ${i + 1}` })}
                              className="group overflow-hidden rounded-lg border"
                            >
                              <img
                                src={url}
                                alt={`Additional information image ${i + 1}`}
                                loading="lazy"
                                className="h-44 w-full object-contain transition-transform group-hover:scale-[1.02]"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <ul className="mt-3 space-y-2">
                      {(choicesByQ[q.id] || []).map((c) => {
                        const chosen = selected.includes(c.id);
                        const isCorrect = !!c.is_correct;
                        const showCorrect = !!quiz.reveal_correct_answers;
                        const showTick = (showCorrect && isCorrect) || (chosen && isExact) || (chosen && isCorrect);

                        return (
                          <li
                            key={`rv-${c.id}`}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              chosen ? "border-slate-400 bg-white ring-2 ring-slate-200" : "border-transparent bg-white"
                            } ${showCorrect && isCorrect ? "outline outline-1 -outline-offset-1 outline-emerald-300" : ""}`}
                          >
                            <span className="mr-2">{chosen ? "•" : "○"}</span>
                            <span className={chosen ? "font-medium" : ""}>{c.choice_text}</span>
                            {showTick && <span className="ml-2 text-xs text-emerald-700">(correct)</span>}
                            {chosen && !isCorrect && !isExact && (
                              <span className="ml-2 text-xs text-rose-700">(your choice)</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <SuccessModal />
        <Lightbox />
      </div>
    );
  }

  // STARTED — quiz view (students)
  return (
    <div className="rounded-2xl border bg-white p-4">
      {header}

      <form
        className="mt-6 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          submitAttempt(false);
        }}
      >
        {questions.map((q, idx) => {
          const cset = choicesByQ[q.id] || [];
          const multi = isMulti(q);
          const selectedIds = answers[q.id] || [];

          return (
            <section key={q.id} className="rounded-xl border p-4">
              <QuestionHeader q={q} idx={idx} />

              <div className="space-y-2">
                {cset.map((c) => {
                  const cid = c.id;
                  const checked = selectedIds.includes(cid);

                  const cardBase = "flex items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors";
                  const cardChecked = "border-slate-400 bg-white ring-2 ring-slate-200";
                  const cardUnchecked = "border-slate-200 hover:bg-slate-50";

                  return (
                    <label key={cid} className={`${cardBase} ${checked ? cardChecked : cardUnchecked}`}>
                      <input
                        type={multi ? "checkbox" : "radio"}
                        name={multi ? `q-${q.id}-${cid}` : `q-${q.id}`}
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleAnswer(q.id, cid, multi)}
                        aria-label="option"
                      />
                      <span className="min-w-0">{c.choice_text}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="flex items-center justify-end gap-2">
          {timeBadge()}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
          >
            <CheckCircleIcon className="h-4 w-4" />
            {submitting ? "Submitting…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("End attempt without submitting? Your answers will be lost.")) {
                clearRunningTimers();
                setStarted(false);
                setAttemptId(null);
                setAnswers({});
              }
            }}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
          >
            <XMarkIcon className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </form>

      <SuccessModal />
      <Lightbox />
    </div>
  );
}
