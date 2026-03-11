const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || "";

// גרסה v1 היציבה ביותר
const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

export function aiEnabled() {
  return GEMINI_KEY.length > 5;
}

export async function callAI(systemPrompt, messages, signal) {
  if (!aiEnabled()) {
    throw new Error("מפתח Gemini לא מוגדר. הוסף VITE_GEMINI_KEY לקובץ .env");
  }

  // הגדרת הזהות של יורי
  const finalPrompt =
    systemPrompt ||
    "אתה יורי, עוזר הוראה מקצועי. סייע למורים בארגון חומרים פדגוגיים ומענה על שאלות הוראה.";

  const contents = [];

  // הזרקת ההנחיות כהודעה הראשונה בשיחה (במקום system_instruction)
  contents.push({
    role: "user",
    parts: [{ text: `הנחיות מערכת (בצע אותן באדיבות): ${finalPrompt}` }],
  });
  contents.push({
    role: "model",
    parts: [
      { text: "הבנתי. אני יורי, עוזר ההוראה שלך. כיצד אוכל לסייע היום?" },
    ],
  });

  // הוספת שאר ההודעות מהשיחה
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

  const res = await fetch(GEMINI_API + "?key=" + GEMINI_KEY, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents, // שים לב: הורדנו את ה-system_instruction כדי למנוע שגיאות JSON
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "Gemini API error");
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("לא התקבלה תשובה מהשרת");

  return text;
}
