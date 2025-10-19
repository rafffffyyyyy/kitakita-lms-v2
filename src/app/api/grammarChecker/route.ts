// /src/app/api/grammarChecker/route.ts
import { NextResponse } from "next/server";

type Issue = {
  issue: string;            // e.g., "Pronoun agreement"
  explanation: string;      // kid-friendly “why” (short)
  rule: string;             // one-line rule
  suggestion: string;       // one-line fix
  example_before: string;   // tiny snippet
  example_after: string;    // tiny snippet
  type:
    | "pronoun"
    | "subject-verb"
    | "tense"
    | "article"
    | "preposition"
    | "punctuation"
    | "word choice"
    | "capitalization"
    | "spelling"
    | "other";
  severity: "minor" | "moderate" | "major";
};

type SpellingBlock = {
  words: string[];          // ["Rafel" -> "Rafael", "colloge" -> "college"] (model may include arrows or just wrong words)
  line: string;             // "Spelling: Rafael, college"
};

export type GrammarResult = {
  original: string;
  corrected: string;
  explanations: Issue[];          // 3–5 items, ordered by importance
  tips: string[];                 // 1–3 quick tips
  spelling?: SpellingBlock | null;// optional one-line spelling summary
  reading_level: "Grade 6-8";
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Missing text." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY; // server-only
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not set." }, { status: 500 });
    }

    // --- System: guardrails and voice ---
    const system = `
You are a friendly English coach for Grade 8 students in the Philippines.
Use only simple, common words. Avoid hard words like "stylistically", "lexicon", "subordinate", etc.
Keep sentences short. CEFR A2–B1 tone.
Return ONLY JSON in the exact schema. No extra text, no markdown.
If the student text is already correct, set "corrected" = original, "explanations" = [], and give one positive tip.
`;

    // --- User: task details + schema ---
    const user = `
STUDENT_TEXT:
"""${text}"""

TASK:
- Fix grammar, spelling, punctuation, capitalization, and basic clarity.
- Keep the same meaning. Do not change the student's idea.
- Pick the 3–5 most helpful issues max. Keep each field short (about 1–2 short sentences).
- Use very simple words in "explanation" and "rule". Do not use hard terms (e.g., do NOT use "stylistically").
- Create a one-line spelling summary if there are misspelled words.

STRICT PRONOUN RULES (always check and report as type="pronoun" if broken):
1) Subject pronouns (I, you, he, she, it, we, they) are used before the verb: "She is happy."
2) Object pronouns (me, you, him, her, it, us, them) are used after verbs or prepositions: "Teacher helped me."
3) Possessive adjectives (my, your, his, her, its, our, their) go before a noun: "her book".
4) Possessive pronouns (mine, yours, his, hers, its, ours, theirs) stand alone: "The choice is hers."
5) Reflexive pronouns (myself, yourself, himself, herself, itself, ourselves, yourselves, themselves) reflect back to the subject: "I taught myself."

SPELLING SUMMARY RULE:
- If there are any misspellings, include a top-level "spelling" object.
- "spelling.line" must be exactly one sentence that starts with "Spelling:" and then the corrected words separated by commas.
  Example: "Spelling: Rafael, college"
- "spelling.words" should list the corrected words or pairs like "Rafel -> Rafael". Keep it short.

OUTPUT SCHEMA (return valid JSON):
{
  "original": string,
  "corrected": string,
  "explanations": [
    {
      "issue": string,
      "explanation": string,
      "rule": string,
      "suggestion": string,
      "example_before": string,
      "example_after": string,
      "type": "pronoun" | "subject-verb" | "tense" | "article" | "preposition" | "punctuation" | "word choice" | "capitalization" | "spelling" | "other",
      "severity": "minor" | "moderate" | "major"
    }
  ],
  "tips": string[],
  "spelling": {
    "words": string[],
    "line": string
  } | null,
  "reading_level": "Grade 6-8"
}

EXTRA RULES:
- Keep "corrected" as one clear sentence/paragraph.
- Each explanation must be short and easy to read for Grade 8.
- Prefer concrete before/after snippets of just a few words.
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Upstream error: ${t}` }, { status: 500 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No content from model." }, { status: 500 });
    }

    // Parse & validate (light)
    let parsed: GrammarResult;
    try {
      parsed = JSON.parse(content) as GrammarResult;

      // Quick sanity checks
      if (
        !parsed.original ||
        typeof parsed.corrected !== "string" ||
        !Array.isArray(parsed.explanations) ||
        !Array.isArray(parsed.tips)
      ) {
        throw new Error("Bad JSON shape");
      }

      // Force simple safety nets
      parsed.reading_level = "Grade 6-8";
      if (parsed.spelling && typeof parsed.spelling.line !== "string") {
        parsed.spelling = null;
      }
    } catch {
      // Fallback (rare with response_format)
      parsed = {
        original: text,
        corrected: text,
        explanations: [],
        tips: ["Good effort! Read your sentence aloud to find small mistakes."],
        spelling: null,
        reading_level: "Grade 6-8",
      };
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
