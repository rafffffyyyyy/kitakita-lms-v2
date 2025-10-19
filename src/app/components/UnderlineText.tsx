// src/app/components/UnderlineText.tsx
import React from "react";

export type QuestionRich = {
  underline?: { text: string; caseSensitive?: boolean };
};

function findFirstOccurrence(
  text: string,
  phrase: string,
  caseSensitive: boolean
) {
  if (!phrase) return -1;
  return caseSensitive
    ? text.indexOf(phrase)
    : text.toLowerCase().indexOf(phrase.toLowerCase());
}

/** No hooks → safe in Server or Client components */
export function UnderlineText({
  text,
  phrase,
  caseSensitive = false,
}: {
  text: string;
  phrase?: string | null;
  caseSensitive?: boolean;
}) {
  const p = (phrase ?? "").trim();
  if (!p) return <>{text}</>;
  const idx = findFirstOccurrence(text, p, !!caseSensitive);
  if (idx < 0) return <>{text}</>;

  const before = text.slice(0, idx);
  const match = text.slice(idx + 0, idx + p.length);
  const after = text.slice(idx + p.length);

  return (
    <>
      {before}
      <span className="underline underline-offset-2 decoration-2">{match}</span>
      {after}
    </>
  );
}
