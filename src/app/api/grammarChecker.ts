// utils/grammarChecker.ts

export const checkGrammar = async (text: string): Promise<string> => {
  if (!text.trim()) {
    return "Please enter text to check.";
  }

  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

    if (!apiKey) {
      return "Error: Missing API key.";
    }

    // ⬇️ Updated prompt: enforces headings and ALWAYS includes a Tips block.
    const prompt = `
Review the following sentence for all grammatical errors: "${text}"

Return your analysis using EXACTLY these sections and headings:

1. Original Sentence:
   - Echo the provided text exactly (do not correct here).

2. Errors & Explanation:
   - Bullet points. Identify each grammatical issue (e.g., pronoun use and agreement, capitalization, punctuation, verb tense, subject–verb agreement, article use).
   - For every issue: briefly explain what is wrong in simple terms AND state the correct usage/rule.
   - Keep it concise and educational.

3. Corrected Sentence:
   - Provide one polished version with correct grammar, capitalization, and punctuation.

Tips:
   - Always include at least ONE helpful writing tip relevant to the sentence (even if no errors were found). If there are no errors, give a general improvement tip (e.g., clarity, style, concision).
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed request");
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Error: No result received.";
  } catch (error) {
    return "Error: Failed to check grammar.";
  }
};
