const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || "";

// עדכון לפי הרשימה המורשית שלך: שימוש בגרסה 2.5 פלאש
const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export function aiEnabled() {
  return GEMINI_KEY.length > 5;
}

export async function callAI(systemPrompt, messages, signal) {
  if (!aiEnabled()) {
    throw new Error("מפתח Gemini לא מוגדר.");
  }

  // הגדרת יורי כעוזר הוראה
  const finalPrompt =
    systemPrompt ||
    "אתה יורי, עוזר הוראה מקצועי. סייע למורים בארגון חומרים פדגוגיים ומענה על שאלות הוראה.";

  const contents = [];

  // הזרקת ההנחיות לתוך ה-contents (השיטה הכי יציבה ב-2026)
  contents.push({
    role: "user",
    parts: [{ text: `System Instructions: ${finalPrompt}` }],
  });
  contents.push({
    role: "model",
    parts: [
      { text: "הבנתי. אני יורי, עוזר ההוראה שלך. כיצד אוכל לסייע היום?" },
    ],
  });

  // הוספת היסטוריית ההודעות
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    let parts;

    if (typeof m.content === "string") {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map((p) => {
        if (p.type === "text") return { text: p.text };
        if (p.source?.data) {
          return {
            inline_data: {
              mime_type: p.source.media_type || "application/octet-stream",
              data: p.source.data,
            },
          };
        }
        return { text: JSON.stringify(p) };
      });
    } else {
      parts = [{ text: String(m.content) }];
    }
    contents.push({ role, parts });
  }

  const url = `${GEMINI_API}?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "שגיאת API");
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("לא התקבלה תשובה מהשרת");

  return text;
}
