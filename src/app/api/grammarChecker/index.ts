// /src/app/api/grammarChecker/index.ts

export type Explanation = {
  issue: string;
  explanation: string;
  rule: string;
  suggestion: string;
};

export type GrammarResult = {
  original: string;
  corrected: string;
  explanations: Explanation[];
  tips: string[];
};

/**
 * Call the Grammar Checker API (App Router) from the client.
 * Returns the structured JSON used by your UI.
 */
export async function checkGrammar(text: string): Promise<GrammarResult> {
  const res = await fetch("/api/grammarChecker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    // Try to surface any server message if available
    const msg =
      (await res.json().catch(() => null))?.error ??
      `Grammar API failed with status ${res.status}`;
    throw new Error(msg);
  }

  return (await res.json()) as GrammarResult;
}
