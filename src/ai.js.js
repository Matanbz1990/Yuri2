const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || "";

// אנחנו משתמשים ב-v1beta ובשם המודל המדויק
const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export function aiEnabled() {
  return GEMINI_KEY.length > 5;
}

export async function callAI(systemPrompt, messages, signal) {
  if (!aiEnabled()) {
    throw new Error("מפתח Gemini לא מוגדר.");
  }

  const finalPrompt = systemPrompt || "אתה יורי, עוזר הוראה מקצועי.";

  // המרת הודעות (שומרים על הלוגיקה של קלוד לקבצים)
  const contents = [];
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
              mime_type: p.source.media_type,
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

  // שים לב: המפתח עובר כפרמטר ב-URL
  const url = `${GEMINI_API}?key=${GEMINI_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: finalPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    }),
  });

  const data = await res.json();

  if (data.error) {
    // אבחון עצמי: אם המודל לא נמצא, נסה לזרוק שגיאה מפורטת יותר
    if (data.error.status === "NOT_FOUND") {
      throw new Error(
        `המודל לא נמצא. ייתכן והמפתח שלך לא מורשה ל-Gemini 1.5 Flash. פרטי שגיאה: ${data.error.message}`,
      );
    }
    throw new Error(data.error.message || "שגיאת API");
  }

  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    "לא התקבלה תשובה"
  );
}
