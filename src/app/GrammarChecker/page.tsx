"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkGrammar } from "../api/grammarChecker";
import {
  ArrowLeftIcon,
  MicrophoneIcon,
  StopCircleIcon,
  SpeakerWaveIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  TrashIcon,
  SparklesIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

/* --------------------------- PARSER HELPERS --------------------------- */
function extractBetween(
  src: string,
  start: RegExp,
  end?: RegExp
): string | null {
  const s = src.search(start);
  if (s === -1) return null;
  const from = s + (src.slice(s).match(start)?.[0].length ?? 0);
  const rest = src.slice(from);
  if (!end) return rest.trim();
  const e = rest.search(end);
  return (e === -1 ? rest : rest.slice(0, e)).trim();
}

function stripLabel(s: string, re: RegExp) {
  return s.replace(re, "").trim();
}

// Keep only the corrected sentence; prefer quoted content, fallback first line.
function normalizeCorrected(s: string) {
  const quoted = s.match(/"([^"]+)"/);
  if (quoted) return quoted[1].trim();
  const firstLine = s.split(/\n/)[0];
  return firstLine.replace(/^[\-\u2022]\s*/, "").trim();
}

/** Convert any mixed "issues" block into a single-level bullet list. */
function toFlatBullets(block: string): string[] {
  if (!block) return [];
  const lines = block
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "));

  const bullets: string[] = [];
  const bulletRe =
    /^\s*(?:[-*•\u2022\u2013\u2014]|(?:\d+[\.\)]))\s+(.*\S)\s*$/;
  const joinableRe = /^\s{2,}(.*\S)\s*$/;

  let carry = "";

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const m = line.match(bulletRe);
    if (m) {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      carry = m[1].trim();
      continue;
    }

    const dashIdx = line.search(/[–—]\s+/);
    if (dashIdx === 0) {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      carry = line.replace(/[–—]\s+/, "").trim();
      continue;
    }

    if (carry && joinableRe.test(raw)) {
      carry += " " + raw.trim();
    } else {
      if (carry) {
        bullets.push(carry.trim());
        carry = "";
      }
      bullets.push(line.trim());
    }
  }

  if (carry) bullets.push(carry.trim());

  return bullets
    .map((s) => s.replace(/^\s*(?:[-*•\u2022\u2013\u2014])\s+/, "").trim())
    .filter(Boolean);
}

function parseGrammarResponse(raw: string) {
  const text = raw.replace(/\r/g, "").trim();

  // Handle potential code fences
  const unwrapped = text.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "").trim();

  // Headings (flexible)
  const RE_ORIG = /^\s*1\.\s*Original\s*Sentence\s*[:\-]/im;
  const RE_ERRS = /^\s*2\.\s*Errors?\s*&?\s*Explanation[s]?\s*[:\-]?/im;
  const RE_CORR = /^\s*3\.\s*Corrected\s*Sentence\s*[:\-]?/im;

  // Any kind of tips label, anywhere
  const RE_TIP_LABEL = /^(?:Writing\s+)?Tips?\s*:/im;

  // Primary sections
  let original = extractBetween(unwrapped, RE_ORIG, RE_ERRS) ?? "";
  let issues =
    extractBetween(unwrapped, RE_ERRS, RE_CORR) ??
    extractBetween(unwrapped, RE_ERRS, RE_TIP_LABEL) ??
    extractBetween(unwrapped, RE_ERRS) ??
    "";
  let corrected =
    extractBetween(unwrapped, RE_CORR, RE_TIP_LABEL) ??
    extractBetween(unwrapped, RE_CORR) ??
    "";

  // Tips anywhere in the doc (not only after section 3)
  let tips = extractBetween(unwrapped, RE_TIP_LABEL) ?? "";

  // Clean labels inside each piece
  original = stripLabel(original, /^Original\s*Sentence\s*[:\-]\s*/i);
  issues = stripLabel(issues, /^Errors?\s*&?\s*Explanation[s]?\s*[:\-]?\s*/i);
  corrected = stripLabel(corrected, /^Corrected\s*Sentence\s*[:\-]?\s*/i);
  tips = stripLabel(tips, /^(?:Writing\s+)?Tips?\s*[:\-]?\s*/i);

  // If the model put "Writing Tip:" inside "corrected", split it out
  if (RE_TIP_LABEL.test(corrected)) {
    const beforeTip = corrected.split(RE_TIP_LABEL)[0];
    const afterTip = corrected.split(RE_TIP_LABEL)[1] ?? "";
    corrected = beforeTip.trim();
    if (!tips.trim()) tips = afterTip.trim();
  }

  // Normalize corrected to one clean sentence
  corrected = normalizeCorrected(corrected);

  return {
    original,
    issuesBlock: issues.trim(),
    corrected: corrected.trim(),
    tips: tips.trim(),
  };
}

/* -------------------- SAFETY WRAPPER AROUND API -------------------- */
/**
 * Some builds of your app return a string, others return an object.
 * This wrapper ALWAYS returns a string for the parser.
 */
async function getGrammarText(input: string): Promise<string> {
  const res = (await (checkGrammar as unknown as (t: string) => Promise<any>)(input)) as any;
  if (typeof res === "string") return res ?? "";

  const direct =
    res?.content ??
    res?.response ??
    res?.text ??
    "";
  if (direct) return String(direct);

  const parts: string[] = [];
  if (res?.original) parts.push(`1. Original Sentence:\n- ${res.original}`);
  const errors =
    Array.isArray(res?.errors) ? res.errors.join("\n- ") : (res?.errors ? String(res.errors) : "");
  if (errors) parts.push(`2. Errors & Explanation:\n- ${errors}`);
  if (res?.corrected) parts.push(`3. Corrected Sentence:\n- ${res.corrected}`);
  if (res?.tips) parts.push(`Tips:\n- ${res.tips}`);

  return parts.join("\n\n");
}

/* ------------------------------ COMPONENT ----------------------------- */
export default function GrammarChecker() {
  const [text, setText] = useState("");
  const [issuesBullets, setIssuesBullets] = useState<string[]>([]);
  const [tips, setTips] = useState("");
  const [corrected, setCorrected] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // robust mic refs
  const manualStopRef = useRef(false);
  const baseTextRef = useRef<string>("");        // snapshot of text when mic starts
  const watchdogRef = useRef<number | null>(null);
  const router = useRouter();

  // Auto-resize textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [text]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
        recognitionRef.current?.abort?.();
      } catch {}
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      window.speechSynthesis?.cancel?.();
    };
  }, []);

  // Grammar API
  const handleCheckGrammar = async () => {
    if (!text.trim()) return;
    setIsChecking(true);
    setIssuesBullets([]);
    setCorrected("");
    setTips("");
    try {
      const rawText = await getGrammarText(text); // <-- ALWAYS a string
      const parsed = parseGrammarResponse(String(rawText ?? ""));
      setCorrected(parsed.corrected || "—");
      setIssuesBullets(toFlatBullets(parsed.issuesBlock || ""));
      setTips(parsed.tips || "—");
    } finally {
      setIsChecking(false);
    }
  };

  /* ------------------------- SPEECH RECOGNITION ------------------------- */
  const clearWatchdog = () => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const armWatchdog = () => {
    clearWatchdog();
    // If we get no results for 15s, restart recognition (Chrome can drop quietly)
    watchdogRef.current = window.setTimeout(() => {
      if (!manualStopRef.current && isListening) {
        try {
          recognitionRef.current?.stop?.();
        } catch {}
      }
    }, 15000);
  };

  const startRecognition = () => {
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    // kill any previous instance
    try {
      recognitionRef.current?.stop?.();
      recognitionRef.current?.abort?.();
    } catch {}

    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    // Keep a rolling "final" + live "interim"
    let finalSoFar = baseTextRef.current;

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalSoFar = (finalSoFar + " " + transcript).trim();
        } else {
          interim += transcript;
        }
      }
      // Combine final + interim to show live text without duplication
      const combined = (finalSoFar + (interim ? " " + interim : "")).trim();
      setText(combined);
      armWatchdog();
    };

    rec.onerror = (e: any) => {
      // common recoverable errors: no-speech, network, aborted (we restart)
      if (!manualStopRef.current && isListening) {
        // Short delay to avoid rapid restart loops
        setTimeout(() => {
          try {
            rec.stop();
          } catch {}
        }, 200);
      } else {
        setIsListening(false);
      }
    };

    rec.onend = () => {
      clearWatchdog();
      // Auto-restart if user didn't press Stop and we're still "listening"
      if (!manualStopRef.current && isListening) {
        // Create a brand-new instance (more reliable than restart on same object)
        setTimeout(() => startRecognition(), 250);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = rec;
    armWatchdog();
    try {
      rec.start();
    } catch {
      // if start throws due to race, try once more
      setTimeout(() => {
        try {
          rec.start();
        } catch {}
      }, 200);
    }
  };

  const handleMicInput = async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }

    // Toggle
    if (isListening) {
      manualStopRef.current = true;
      setIsListening(false);
      clearWatchdog();
      try {
        recognitionRef.current?.stop?.();
        recognitionRef.current?.abort?.();
      } catch {}
      return;
    }

    // Starting fresh
    manualStopRef.current = false;
    // Snapshot any existing text so we append instead of duplicating
    baseTextRef.current = text.trim();
    if (baseTextRef.current.length > 0) baseTextRef.current += " ";

    // (Optional) ask for mic stream early to surface permission prompt
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {
      // ignore; recognition will still try
    }

    setIsListening(true);
    startRecognition();
  };

  /* ------------------------- SPEECH SYNTHESIS ------------------------- */
  const speak = (content: string) => {
    if (!content.trim()) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(content);
    speech.lang = "en-US";
    window.speechSynthesis.speak(speech);
  };
  const pause = () => window.speechSynthesis.pause();
  const resume = () => window.speechSynthesis.resume();
  const stop = () => window.speechSynthesis.cancel();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Grammar Checker</h1>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* Left: Input */}
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="font-medium">Your Text</h2>
            {isListening && (
              <span className="text-sm text-red-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                Listening...
              </span>
            )}
          </div>
          <div className="p-4 space-y-4">
            <textarea
              ref={textAreaRef}
              className="w-full min-h-[180px] border rounded-xl p-3 resize-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type or dictate here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={handleMicInput}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg border ${
                  isListening
                    ? "border-red-300 text-red-600 bg-red-50"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {isListening ? (
                  <>
                    <StopCircleIcon className="w-5 h-5" /> Stop
                  </>
                ) : (
                  <>
                    <MicrophoneIcon className="w-5 h-5" /> Dictate
                  </>
                )}
              </button>
              <button
                onClick={() => speak(text)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
              >
                <SpeakerWaveIcon className="w-5 h-5" /> Read
              </button>
              <button
                onClick={pause}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
              >
                <PauseCircleIcon className="w-5 h-5" />
              </button>
              <button
                onClick={resume}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
              >
                <PlayCircleIcon className="w-5 h-5" />
              </button>
              <button
                onClick={stop}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
              >
                <StopCircleIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setText("")}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
              >
                <TrashIcon className="w-5 h-5" /> Clear
              </button>
              <button
                onClick={handleCheckGrammar}
                disabled={isChecking || !text.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
              >
                {isChecking ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" /> Checking
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5" /> Check Grammar
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Right: Output */}
        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-6">
          <div>
            <h2 className="font-medium border-b border-gray-200 pb-2 mb-2">
              Corrected Version
            </h2>
            <p className="whitespace-pre-wrap min-h-[80px]">
              {corrected || "No corrected text yet."}
            </p>
          </div>

          <div>
            <h2 className="font-medium border-b border-gray-200 pb-2 mb-2">
              Grammar Issues &amp; Explanations
            </h2>

            {isChecking ? (
              <p className="text-gray-500">Checking grammar...</p>
            ) : issuesBullets.length ? (
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {issuesBullets.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 min-h-[80px]">No issues found.</p>
            )}
          </div>

          <div>
            <h2 className="font-medium border-b border-gray-200 pb-2 mb-2">
              Tips
            </h2>
            <p className="whitespace-pre-wrap text-gray-700 min-h-[60px]">
              {tips || "No tips provided."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => speak(corrected)}
              disabled={!corrected}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              <SpeakerWaveIcon className="w-5 h-5" /> Read Corrected
            </button>
            <button
              onClick={() => speak(issuesBullets.join(". "))}
              disabled={!issuesBullets.length}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              <SpeakerWaveIcon className="w-5 h-5" /> Read Issues
            </button>
            <button
              onClick={() => speak(tips)}
              disabled={!tips}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              <SpeakerWaveIcon className="w-5 h-5" /> Read Tips
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
