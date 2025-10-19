// /app/components/AddQuiz.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/app/UserContext";
import {
  PlusIcon,
  MinusIcon,
  ClockIcon,
  CalendarIcon,
  AdjustmentsHorizontalIcon,
  ArrowUturnLeftIcon,
  PhotoIcon,
  CheckCircleIcon,
  XMarkIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

/* ------------------------------ TYPES -------------------------------- */
type QuizType = "pre_test" | "post_test" | "quiz";
type Choice = { text: string; correct: boolean };
type QuestionDraft = {
  question_text: string;
  points: number;
  instruction_text?: string;
  imageFile?: File | null;
  choices: Choice[];
  // underline controls
  underline_enabled?: boolean;
  underline_text?: string;
  underline_case_sensitive?: boolean;
};

type QuestionRich = {
  underline?: { text: string; caseSensitive?: boolean };
};

const QUIZ_IMAGE_BUCKET = "lms-files";

/* ------------------------------ UTILS -------------------------------- */
const isUuid = (s?: string) =>
  !!s &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );

const makeBlankQuestion = (): QuestionDraft => ({
  question_text: "",
  points: 1,
  instruction_text: "",
  imageFile: null,
  choices: [
    { text: "", correct: true },
    { text: "", correct: false },
  ],
  underline_enabled: false,
  underline_text: "",
  underline_case_sensitive: false,
});

function formatPgError(e: any) {
  if (!e) return "Unknown error.";
  if (typeof e === "string") return e;
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ");
}

function findFirstOccurrence(
  haystack: string,
  needle: string,
  caseSensitive: boolean
) {
  if (!needle) return -1;
  if (caseSensitive) return haystack.indexOf(needle);
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

/* Preview component: underline first occurrence of phrase */
function UnderlinePreview({
  text,
  phrase,
  caseSensitive,
}: {
  text: string;
  phrase: string;
  caseSensitive: boolean;
}) {
  if (!phrase) return <span>{text || "\u00A0"}</span>;
  const idx = findFirstOccurrence(text, phrase, caseSensitive);
  if (idx < 0) return <span>{text || "\u00A0"}</span>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + phrase.length);
  const after = text.slice(idx + phrase.length);
  return (
    <span>
      {before}
      <span className="underline underline-offset-2 decoration-2">{match}</span>
      {after}
    </span>
  );
}

/* ---------------------------- COMPONENT ------------------------------ */
export default function AddQuiz({ moduleId }: { moduleId: string }) {
  const router = useRouter();
  const { userId } = useUser();
  const moduleOk = isUuid(moduleId);

  // form meta
  const [title, setTitle] = useState("");
  const [type, setType] = useState<QuizType>("quiz");
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | "">("");
  const [deadline, setDeadline] = useState<string>("");
  const [shuffle, setShuffle] = useState(false);

  // NEW: publish state (Draft by default)
  const [isPublished, setIsPublished] = useState<boolean>(false);

  // start with ONE question
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    makeBlankQuestion(),
  ]);

  const [ownershipOK, setOwnershipOK] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!moduleOk || ownershipOK === false) return false;
    if (!title.trim()) return false;
    if (questions.length < 1) return false;
    for (const q of questions) {
      if (!q.question_text.trim()) return false;
      if (q.points <= 0) return false;
      if (q.choices.length < 2) return false;
      if (q.choices.filter((c) => c.correct).length !== 1) return false;
      if (!q.choices.every((c) => c.text.trim())) return false;

      if (q.underline_enabled) {
        const phrase = q.underline_text?.trim() ?? "";
        const idx = findFirstOccurrence(
          q.question_text,
          phrase,
          !!q.underline_case_sensitive
        );
        if (!phrase || idx < 0) return false;
      }
    }
    return true;
  }, [moduleOk, ownershipOK, title, questions]);

  // verify ownership
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!moduleOk || !userId) {
        setOwnershipOK(null);
        return;
      }
      const { data, error } = await supabase
        .from("modules")
        .select("id, quarter_id, quarters!inner(teacher_id)")
        .eq("id", moduleId)
        .eq("quarters.teacher_id", userId)
        .maybeSingle();
      if (!mounted) return;
      if (error) setOwnershipOK(false);
      else setOwnershipOK(!!data);
    })();
    return () => {
      mounted = false;
    };
  }, [moduleId, moduleOk, userId]);

  /* ---------------------------- Handlers ---------------------------- */
  const addQuestion = () => setQuestions((qs) => [...qs, makeBlankQuestion()]);
  const removeQuestion = (idx: number) =>
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, i) => i !== idx) : qs));
  const addChoice = (qi: number) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi
          ? { ...q, choices: [...q.choices, { text: "", correct: false }] }
          : q
      )
    );
  const removeChoice = (qi: number, ci: number) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi
          ? {
              ...q,
              choices:
                q.choices.length > 2
                  ? q.choices.filter((_, j) => j !== ci)
                  : q.choices,
            }
          : q
      )
    );
  const setCorrect = (qi: number, ci: number) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi
          ? { ...q, choices: q.choices.map((c, j) => ({ ...c, correct: j === ci })) }
          : q
      )
    );

  /* ---------------------------- Submit ------------------------------ */
  const handleSubmit = async () => {
    setError(null);
    if (!moduleOk) {
      setError("Module ID is missing or invalid. Open Add Quiz from a module page.");
      return;
    }
    if (ownershipOK === false) {
      setError("You don’t have permission to add a quiz to this module.");
      return;
    }
    if (!canSubmit) {
      setError(
        "Complete all fields. Each question must have 2+ choices and exactly one correct. If underline is enabled, the phrase must exist in the question."
      );
      return;
    }

    try {
      setSaving(true);

      // Only one pre/post per module
      if (type !== "quiz") {
        const { data: existing, error: existsErr } = await supabase
          .from("quizzes")
          .select("id")
          .eq("module_id", moduleId)
          .eq("type", type)
          .maybeSingle();
        if (existsErr) throw new Error(formatPgError(existsErr));
        if (existing) {
          throw new Error(
            type === "pre_test"
              ? "This module already has a Pre-Test."
              : "This module already has a Post-Test."
          );
        }
      }

      // Create quiz
      const quizId = crypto.randomUUID();
      const quizPayload: any = {
        id: quizId,
        module_id: moduleId,
        title: title.trim(),
        type,
        max_attempts: maxAttempts ?? 1,
        time_limit_minutes: timeLimitMinutes === "" ? null : Number(timeLimitMinutes),
        available_from: new Date().toISOString(),
        expires_at: deadline ? new Date(deadline).toISOString() : null,
        shuffle,
        // NEW: take from the selector
        is_published: isPublished,
        editable: true,
      };
      if (userId && isUuid(userId)) quizPayload.created_by = userId;

      {
        const { error: quizErr } = await supabase.from("quizzes").insert([quizPayload]);
        if (quizErr) throw new Error(formatPgError(quizErr));
      }

      // Insert questions + choices
      for (let i = 0; i < questions.length; i++) {
        const draft = questions[i];
        const questionId = crypto.randomUUID();

        // optional image upload
        let imageUrls: string[] | null = null;
        if (draft.imageFile) {
          const ext = (draft.imageFile.name.split(".").pop() || "jpg").toLowerCase();
          const path = `quiz_questions/${quizId}/${questionId}-${i + 1}.${ext}`;
          const up = await supabase.storage
            .from(QUIZ_IMAGE_BUCKET)
            .upload(path, draft.imageFile, {
              upsert: true,
              cacheControl: "31536000",
              contentType: draft.imageFile.type || "image/*",
            });
          if (up.error) throw new Error(formatPgError(up.error));
          const { data: pub } = supabase.storage.from(QUIZ_IMAGE_BUCKET).getPublicUrl(path);
          imageUrls = [pub.publicUrl];
        }

        // build question_rich for underline
        let question_rich: QuestionRich | null = null;
        const phrase = (draft.underline_text ?? "").trim();
        if (draft.underline_enabled && phrase) {
          question_rich = {
            underline: {
              text: phrase,
              caseSensitive: !!draft.underline_case_sensitive,
            },
          };
        }

        {
          const { error: qErr } = await supabase.from("quiz_questions").insert([
            {
              id: questionId,
              quiz_id: quizId,
              order_index: i + 1,
              question_text: draft.question_text.trim(),
              instruction_text: draft.instruction_text?.trim() || null,
              instruction_images: imageUrls,
              points: draft.points,
              question_rich, // JSONB
            },
          ]);
          if (qErr) throw new Error(formatPgError(qErr));
        }

        const choicesRows = draft.choices.map((c, j) => ({
          question_id: questionId,
          choice_text: c.text.trim(),
          is_correct: c.correct,
          order_index: j + 1,
        }));

        {
          const { error: cErr } = await supabase.from("quiz_choices").insert(choicesRows);
          if (cErr) throw new Error(formatPgError(cErr));
        }
      }

      // Success
      setSuccessMsg(
        type === "pre_test"
          ? "Pre-Test created successfully"
          : type === "post_test"
          ? "Post-Test created successfully"
          : "Quiz created successfully"
      );
      setTimeout(() => router.push(`/modules/${moduleId}`), 1200);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create quiz.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------ UI --------------------------------- */
  return (
    <div className="mx-auto max-w-5xl relative">
      {/* Success toast */}
      {successMsg && (
        <div
          className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-md px-4"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 shadow-lg">
            <CheckCircleIcon className="h-5 w-5 shrink-0" />
            <div className="text-sm font-medium">{successMsg}</div>
          </div>
        </div>
      )}

      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Add Quiz</h1>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          aria-label="Go back"
        >
          <ArrowUturnLeftIcon className="h-5 w-5" />
          Back
        </button>
      </header>

      {!moduleOk && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <ShieldExclamationIcon className="h-5 w-5" />
          Module ID is missing/invalid. Open Add Quiz from a module page.
        </div>
      )}
      {ownershipOK === false && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ShieldExclamationIcon className="h-5 w-5" />
          You don’t have permission to add a quiz to this module.
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <XMarkIcon className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 text-xs text-gray-500">
          Module is selected from the URL. Configure title, type, attempts, deadline, and options.
          {moduleOk && (
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-600">
              {moduleId}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder="e.g., Pre-Test: Context Clues"
              aria-label="Quiz title"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QuizType)}
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              aria-label="Quiz type"
            >
              <option value="quiz">Quiz</option>
              <option value="pre_test">Pre-Test</option>
              <option value="post_test">Post-Test</option>
            </select>
          </label>

          {/* NEW: Publish/Draft selector */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Visibility</span>
            <select
              value={isPublished ? "published" : "draft"}
              onChange={(e) => setIsPublished(e.target.value === "published")}
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              aria-label="Publish state"
            >
              <option value="draft">Draft (not published)</option>
              <option value="published">Published (visible to students)</option>
            </select>
            <span className="mt-1 text-xs text-gray-500">
              Draft keeps the quiz hidden. Published makes it visible (subject to availability dates).
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Max Attempts</span>
            <input
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value)))}
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              aria-label="Max attempts"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <ClockIcon className="h-4 w-4" /> Time Limit (minutes) <span className="text-gray-400">(optional)</span>
            </span>
            <input
              type="number"
              min={1}
              value={timeLimitMinutes}
              onChange={(e) =>
                setTimeLimitMinutes(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))
              }
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder="optional"
              aria-label="Time limit in minutes"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Deadline <span className="text-gray-400">(optional)</span>
            </span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
              aria-label="Deadline"
            />
          </label>

          <label className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900/20"
              aria-label="Shuffle"
            />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="h-4 w-4" /> Shuffle questions and choices
            </span>
          </label>
        </div>

        <div className="my-6 border-t" />

        {/* Questions */}
        <ol className="space-y-6">
          {questions.map((q, idx) => (
            <li key={idx} className="rounded-2xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Question {idx + 1}</span>
                <button
                  onClick={() => removeQuestion(idx)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  disabled={questions.length <= 1}
                  aria-label={`Remove question ${idx + 1}`}
                >
                  <MinusIcon className="h-4 w-4" />
                  Remove
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Question Text</span>
                  <textarea
                    value={q.question_text}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((qq, i) =>
                          i === idx ? { ...qq, question_text: e.target.value } : qq
                        )
                      )
                    }
                    className="min-h-[72px] rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Type the question…"
                    aria-label={`Question ${idx + 1} text`}
                  />
                </label>

                {/* Underline controls */}
                <div className="md:col-span-2 rounded-lg border p-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!q.underline_enabled}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((qq, i) =>
                            i === idx ? { ...qq, underline_enabled: e.target.checked } : qq
                          )
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900/20"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Underline a word/phrase in this question
                    </span>
                  </label>

                  {q.underline_enabled && (
                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                      <input
                        value={q.underline_text ?? ""}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((qq, i) =>
                              i === idx ? { ...qq, underline_text: e.target.value } : qq
                            )
                          )
                        }
                        className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
                        placeholder="Type the word/phrase to underline (must appear in the question)"
                        aria-label={`Question ${idx + 1} underline phrase`}
                      />
                      <label className="flex items-center gap-2 justify-self-start md:justify-self-end">
                        <input
                          type="checkbox"
                          checked={!!q.underline_case_sensitive}
                          onChange={(e) =>
                            setQuestions((qs) =>
                              qs.map((qq, i) =>
                                i === idx
                                  ? { ...qq, underline_case_sensitive: e.target.checked }
                                  : qq
                              )
                            )
                          }
                          className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900/20"
                        />
                        <span className="text-xs text-gray-700">Case sensitive</span>
                      </label>

                      {/* Live preview */}
                      <div className="md:col-span-2 text-sm text-gray-600 mt-2">
                        <div className="mb-1 font-medium">Live Preview:</div>
                        <div className="rounded-md border bg-gray-50 px-3 py-2">
                          <UnderlinePreview
                            text={q.question_text}
                            phrase={q.underline_text ?? ""}
                            caseSensitive={!!q.underline_case_sensitive}
                          />
                        </div>
                        {q.underline_text &&
                          findFirstOccurrence(
                            q.question_text,
                            q.underline_text,
                            !!q.underline_case_sensitive
                          ) < 0 && (
                            <div className="mt-2 text-xs text-red-600">
                              The phrase doesn’t appear in the question yet.
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Points</span>
                  <input
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((qq, i) =>
                          i === idx
                            ? { ...qq, points: Math.max(1, Number(e.target.value)) }
                            : qq
                        )
                      )
                    }
                    className="rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
                    aria-label={`Question ${idx + 1} points`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700">Instruction (optional)</span>
                  <textarea
                    value={q.instruction_text}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((qq, i) =>
                          i === idx ? { ...qq, instruction_text: e.target.value } : qq
                        )
                      )
                    }
                    className="min-h-[44px] rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
                    placeholder="Add directions, context, or a passage…"
                    aria-label={`Question ${idx + 1} instruction`}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <PhotoIcon className="h-4 w-4" /> Instruction Image (optional, 1)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setQuestions((qs) =>
                        qs.map((qq, i) => (i === idx ? { ...qq, imageFile: file } : qq))
                      );
                    }}
                    className="rounded-lg border px-3 py-2 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2"
                    aria-label={`Question ${idx + 1} image`}
                  />
                </label>
              </div>

              {/* Choices */}
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-700">
                  Choices (select one correct)
                </div>
                <ul className="space-y-2">
                  {q.choices.map((c, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct_${idx}`}
                        checked={c.correct}
                        onChange={() => setCorrect(idx, j)}
                        className="h-4 w-4"
                        aria-label={`Mark choice ${j + 1} as correct for question ${idx + 1}`}
                      />
                      <input
                        value={c.text}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((qq, i) =>
                              i === idx
                                ? {
                                    ...qq,
                                    choices: qq.choices.map((cc, jj) =>
                                      jj === j ? { ...cc, text: e.target.value } : cc
                                    ),
                                  }
                                : qq
                            )
                          )
                        }
                        placeholder="Choice text"
                        className="flex-1 rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-900/10"
                        aria-label={`Choice ${j + 1} text for question ${idx + 1}`}
                      />
                      <button
                        onClick={() => removeChoice(idx, j)}
                        className="rounded-lg p-1 hover:bg-gray-50"
                        aria-label={`Remove choice ${j + 1}`}
                        title="Remove"
                      >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-3">
                  <button
                    onClick={() => addChoice(idx)}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    aria-label={`Add choice to question ${idx + 1}`}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Choice
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Bottom: Add Question */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={addQuestion}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            aria-label="Add question"
          >
            <PlusIcon className="h-5 w-5" />
            Add Question
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-gray-500">
            Each question needs 2+ choices and exactly 1 marked correct.
          </div>
          <button
            disabled={!canSubmit || saving}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white hover:opacity-95 disabled:opacity-50 focus:ring-2 focus:ring-slate-900/20 whitespace-nowrap w-full sm:w-auto"
            aria-label="Save quiz"
          >
            <CheckCircleIcon className="h-5 w-5" />
            {saving ? "Saving…" : "Create Quiz"}
          </button>
        </div>
      </div>
    </div>
  );
}
