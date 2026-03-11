const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || "";

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
export function aiEnabled() {
  return GEMINI_KEY.length > 5;
}

export async function callAI(systemPrompt, messages, signal) {
  if (!aiEnabled()) {
    const finalPrompt =
      systemPrompt ||
      "אתה יורי, עוזר הוראה מקצועי. סייע למורים בארגון חומרים פדגוגיים.";
    throw new Error("מפתח Gemini לא מוגדר. הוסף VITE_GEMINI_KEY לקובץ .env");
  }

  // Convert messages to Gemini format
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
      system_instruction: { parts: [{ text: finalPrompt }] },
      contents,
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

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY || "";

// תיקון ה-URL לגרסת v1beta כדי לתמוך ב-system_instruction שמופיע למטה ב-body
const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export function aiEnabled() {
  return GEMINI_KEY.length > 5;
}

export async function callAI(systemPrompt, messages, signal) {
  if (!aiEnabled()) {
    throw new Error("מפתח Gemini לא מוגדר. הוסף VITE_GEMINI_KEY לקובץ .env");
  }

  // הגדרת ברירת מחדל ליורי למקרה שה-systemPrompt מגיע ריק
  const finalPrompt =
    systemPrompt ||
    "אתה יורי, עוזר הוראה מקצועי. סייע למורים בארגון חומרים, בניית מערכי שיעור ומענה פדגוגי.";

  // המרת ההודעות לפורמט של Gemini
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
      // שימוש ב-finalPrompt המעודכן
      system_instruction: { parts: [{ text: finalPrompt }] },
      contents,
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
