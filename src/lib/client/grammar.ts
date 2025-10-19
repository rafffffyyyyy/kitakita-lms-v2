export async function checkGrammars(text: string) {
  const res = await fetch("/api/grammarChecker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Grammar check failed");
  return res.json(); // adjust if your API returns a different shape
}