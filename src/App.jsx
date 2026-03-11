import { useState, useEffect, useRef, useCallback, memo } from "react";

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║  יורי — עוזר הוראה AI למורים בישראל                        ║
 ║                                                              ║
 ║  SETUP:                                                      ║
 ║  1. cp .env.example .env                                     ║
 ║  2. Fill your keys in .env                                   ║
 ║  3. npm run dev                                              ║
 ╚══════════════════════════════════════════════════════════════╝
*/

// ─── CONFIGURATION ─────────────────────────────────────────
// Reads from .env file (Vite: VITE_ prefix)
// Fallback: paste keys directly below if not using .env
const _env = (k, fallback="") => {
  try { return import.meta.env?.[k] || fallback; } catch(e) { return fallback; }
};

const FIREBASE_CONFIG = {
  apiKey: _env("VITE_FIREBASE_API_KEY"),
  authDomain: _env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: _env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: _env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: _env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: _env("VITE_FIREBASE_APP_ID"),
};
const GEMINI_KEY = _env("VITE_GEMINI_KEY");
// ────────────────────────────────────────────────────────────

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const useGemini = () => GEMINI_KEY.length > 5;
const useFirebase = () => FIREBASE_CONFIG.apiKey.length > 5;

// ─── Firebase loader ───────────────────────────────────────
let fb = null;
async function loadFirebase() {
  if (fb) return fb;
  if (!useFirebase()) return null;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"),
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    const provider = new authMod.GoogleAuthProvider();
    fb = { auth, db, provider, authMod, fsMod };
    return fb;
  } catch (e) { console.error("Firebase load error:", e); return null; }
}

// ─── AI caller ─────────────────────────────────────────────
async function callAI(sys, messages, signal) {
  if (useGemini()) {
    const parts = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: typeof m.content === "string" ? [{text:m.content}] :
        Array.isArray(m.content) ? m.content.map(p => p.type === "text" ? {text:p.text} : p.source ? {inline_data:{mime_type:p.source.media_type,data:p.source.data}} : {text:JSON.stringify(p)}) : [{text:String(m.content)}]
    }));
    const res = await fetch(GEMINI_API + "?key=" + GEMINI_KEY, {method:"POST",signal,headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system_instruction:{parts:[{text:sys}]},contents:parts,generationConfig:{maxOutputTokens:8192,temperature:0.7}})});
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "לא התקבלה תשובה.";
  } else {
    const apiMsgs = messages.map(m => ({role:m.role,content:m.content}));
    const hasUrl = messages.some(m => typeof m.content === "string" && /https?:\/\/\S+/.test(m.content));
    const body = {model:"claude-sonnet-4-20250514",max_tokens:4096,system:sys,messages:apiMsgs};
    if (hasUrl) body.tools = [{type:"web_search_20250305",name:"web_search"}];
    let res = await fetch(ANTHROPIC_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal});
    let data = await res.json();
    if (data.error) throw new Error(data.error.message);
    let allText = [], turnMsgs = [...apiMsgs], turns = 5;
    while (turns-- > 0) {
      allText.push(...(data.content||[]).filter(b => b.type==="text").map(b => b.text));
      if (data.stop_reason === "end_turn" || !data.content?.some(b => b.type === "tool_use")) break;
      turnMsgs.push({role:"assistant",content:data.content});
      turnMsgs.push({role:"user",content:data.content.filter(b => b.type==="tool_use").map(b => ({type:"tool_result",tool_use_id:b.id,content:""}))});
      const b2 = {model:"claude-sonnet-4-20250514",max_tokens:4096,system:sys,messages:turnMsgs};
      if (hasUrl) b2.tools = [{type:"web_search_20250305",name:"web_search"}];
      res = await fetch(ANTHROPIC_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b2),signal});
      data = await res.json();
      if (data.error) { allText.push("⚠️ "+data.error.message); break; }
    }
    return allText.join("\n\n").trim() || "לא התקבלה תשובה.";
  }
}

// ─── Theme ─────────────────────────────────────────────────
const T = {bg:"#F4F6FB",card:"#FFF",accent:"#4F6BED",accentDk:"#3B50C9",accentLt:"#6C83F2",accentBg:"#EEF0FF",green:"#16A34A",greenBg:"#ECFDF5",orange:"#EA580C",orangeBg:"#FFF7ED",rose:"#E11D48",roseBg:"#FFF1F2",tx:"#1E293B",tx2:"#475569",tx3:"#64748B",tx4:"#94A3B8",brd:"#E2E8F0",sh:"0 1px 3px rgba(0,0,0,0.05)"};
const ACCEPT = ".pdf,.doc,.docx,.txt,.pptx,.xlsx,.jpg,.jpeg,.png,.rtf,.odt,.csv";
const TOOLS = [
  {id:"lesson",label:"בניית שיעור",color:T.accent,bg:T.accentBg,emoji:"📖",desc:"תכנון מערך שיעור מלא",sys:"אתה יורי, עוזר הוראה מומחה למורים בישראל. צור מערך שיעור מפורט: נושא ושכבת גיל, יעדי למידה, רקע, פתיחה (5-7 דק), גוף עם 2-3 פעילויות (30 דק), סיכום (8 דק), התאמות, חומרי עזר. כתוב בעברית.",ph:"לדוגמה: שיעור מתמטיקה כיתה ד׳..."},
  {id:"exam",label:"יצירת עבודה / מבחן",color:T.green,bg:T.greenBg,emoji:"📝",desc:"מבחן מותאם עם מפתח תשובות",sys:"אתה יורי, עוזר הוראה מומחה למורים בישראל. צור מבחן מקצועי: כותרת, מקצוע, שכבת גיל, שאלות מגוונות ברמות קושי, מפתח תשובות עם ניקוד. כתוב בעברית.",ph:"לדוגמה: מבחן מדעים כיתה ה׳..."},
  {id:"text2exam",label:"מטקסט למבחן",color:T.orange,bg:T.orangeBg,emoji:"🔬",desc:"העלה קובץ / טקסט / קישור → מבחן",sys:"אתה יורי, עוזר הוראה מומחה. אל תציג את עצמך. התחל ישירות במבחן. צור מבחן מבוסס אך ורק על החומר שסופק. 8-12 שאלות מגוונות, מפתח תשובות עם ניקוד. אל תוסיף שאלות על חומר שלא מופיע במקור. כתוב בעברית.",ph:"הדבק טקסט, קישור, או צרף קובץ..."},
];

// ─── Avatars ───────────────────────────────────────────────
const YuriAv = ({s=80}) => <svg width={s} height={s} viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="58" fill="#EEF0FF" stroke="#4F6BED" strokeWidth="2"/><circle cx="60" cy="52" r="28" fill="#FBBF24"/><rect x="36" y="80" width="48" height="28" rx="14" fill="#4F6BED"/><rect x="42" y="86" width="36" height="10" rx="5" fill="#6C83F2"/><circle cx="60" cy="52" r="22" fill="#FDE68A"/><circle cx="50" cy="48" r="4" fill="#1E293B"/><circle cx="70" cy="48" r="4" fill="#1E293B"/><circle cx="51" cy="47" r="1.5" fill="#FFF"/><circle cx="71" cy="47" r="1.5" fill="#FFF"/><path d="M53 58 Q60 64 67 58" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round"/><rect x="38" y="42" width="44" height="14" rx="7" fill="none" stroke="#1E293B" strokeWidth="2"/><line x1="60" y1="42" x2="60" y2="56" stroke="#1E293B" strokeWidth="1.5"/><rect x="36" y="44" width="4" height="8" rx="2" fill="#1E293B"/><rect x="80" y="44" width="4" height="8" rx="2" fill="#1E293B"/><path d="M34 30 Q44 20 56 26" stroke="#FBBF24" strokeWidth="4" fill="none" strokeLinecap="round"/><path d="M64 26 Q76 20 86 30" stroke="#FBBF24" strokeWidth="4" fill="none" strokeLinecap="round"/><rect x="44" y="22" width="32" height="6" rx="3" fill="#FBBF24"/></svg>;
const YuriSm = ({s=34}) => <svg width={s} height={s} viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="56" fill="#4F6BED"/><circle cx="60" cy="50" r="22" fill="#FDE68A"/><circle cx="50" cy="46" r="3.5" fill="#1E293B"/><circle cx="70" cy="46" r="3.5" fill="#1E293B"/><circle cx="51" cy="45" r="1.2" fill="#FFF"/><circle cx="71" cy="45" r="1.2" fill="#FFF"/><path d="M53 55 Q60 60 67 55" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round"/><rect x="38" y="40" width="44" height="13" rx="6.5" fill="none" stroke="#1E293B" strokeWidth="2"/><line x1="60" y1="40" x2="60" y2="53" stroke="#1E293B" strokeWidth="1.5"/><rect x="36" y="42" width="3.5" height="7" rx="1.75" fill="#1E293B"/><rect x="80.5" y="42" width="3.5" height="7" rx="1.75" fill="#1E293B"/><path d="M35 28 Q45 18 57 24" stroke="#FDE68A" strokeWidth="4" fill="none" strokeLinecap="round"/><path d="M63 24 Q75 18 85 28" stroke="#FDE68A" strokeWidth="4" fill="none" strokeLinecap="round"/><rect x="44" y="20" width="32" height="6" rx="3" fill="#FDE68A"/><rect x="38" y="76" width="44" height="22" rx="11" fill="#FDE68A"/></svg>;

// ─── Markdown ──────────────────────────────────────────────
function iFmt(s){return s.replace(/\*\*(.+?)\*\*/g,'<strong style="color:#1E293B;font-weight:600">$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');}
const Content = memo(function C({text}){
  if (!text) return null;
  const lines = text.split("\n"), out = [];
  let li = [], lt = null;
  const fL = () => { if (!li.length) return; const Tag = lt==="ol"?"ol":"ul"; out.push(<Tag key={"l"+out.length} style={{paddingRight:"22px",margin:"8px 0",lineHeight:1.85,color:T.tx2,listStyleType:lt==="ol"?"decimal":"disc"}}>{li.map((x,i) => <li key={i}><span dangerouslySetInnerHTML={{__html:iFmt(x)}}/></li>)}</Tag>); li=[]; lt=null; };
  lines.forEach((line,idx) => { const t = line.trim();
    if (t.startsWith("### ")) { fL(); out.push(<h4 key={idx} style={{fontSize:"15px",fontWeight:700,color:T.accent,margin:"18px 0 6px"}}><span dangerouslySetInnerHTML={{__html:iFmt(t.slice(4))}}/></h4>); }
    else if (t.startsWith("## ")) { fL(); out.push(<h3 key={idx} style={{fontSize:"17px",fontWeight:700,margin:"22px 0 8px",paddingBottom:"6px",borderBottom:"1px solid "+T.brd}}><span dangerouslySetInnerHTML={{__html:iFmt(t.slice(3))}}/></h3>); }
    else if (t.startsWith("# ")) { fL(); out.push(<h2 key={idx} style={{fontSize:"20px",fontWeight:800,margin:"24px 0 10px"}}><span dangerouslySetInnerHTML={{__html:iFmt(t.slice(2))}}/></h2>); }
    else if (/^\d+[\.\)]\s/.test(t)) { if (lt!=="ol"){fL();lt="ol";} li.push(t.replace(/^\d+[\.\)]\s/,"")); }
    else if (/^[-•*]\s/.test(t)) { if (lt!=="ul"){fL();lt="ul";} li.push(t.replace(/^[-•*]\s/,"")); }
    else if (t==="") { fL(); }
    else { fL(); out.push(<p key={idx} style={{lineHeight:1.8,color:T.tx2,margin:"6px 0",fontSize:"14.5px"}}><span dangerouslySetInnerHTML={{__html:iFmt(t)}}/></p>); }
  }); fL(); return <>{out}</>;
});

// ─── Editor ────────────────────────────────────────────────
function Editor({text, onClose}){
  const [content, setContent] = useState(text);
  const [sel, setSel] = useState(new Set());
  const secs = content.split(/\n(?=#{1,3}\s|\n)/).filter(s => s.trim());
  const toggle = i => setSel(p => { const n=new Set(p); n.has(i)?n.delete(i):n.add(i); return n; });
  const getText = () => sel.size===0 ? content : secs.filter((_,i) => sel.has(i)).join("\n\n");
  const toHtml = t => { let h=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^[-•]\s(.+)$/gm,'<li>$1</li>').replace(/\n{2,}/g,'<br/><br/>').replace(/\n/g,'<br/>'); return '<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:David,Arial,sans-serif;padding:30px 40px;color:#1e293b;line-height:1.8;font-size:14px;direction:rtl}ul{padding-right:24px}</style></head><body><div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #4F6BED;padding-bottom:14px"><b style="font-size:20px;color:#4F6BED">🎓 יורי</b></div>'+h+'</body></html>'; };
  const expWord = () => { const html='\ufeff'+toHtml(getText()); const b=new Blob([html],{type:"application/msword;charset=utf-8"}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download="yuri.doc"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); };
  const expPdf = () => { const html=toHtml(getText()); const b=new Blob([html],{type:"text/html;charset=utf-8"}); const u=URL.createObjectURL(b); const w=window.open(u,"_blank"); if(!w){const a=document.createElement("a");a.href=u;a.download="yuri.html";document.body.appendChild(a);a.click();document.body.removeChild(a);} setTimeout(()=>URL.revokeObjectURL(u),5000); };
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",backdropFilter:"blur(4px)"}}/>
      <div style={{position:"relative",width:"92vw",maxWidth:"900px",height:"85vh",background:T.card,borderRadius:"20px",boxShadow:"0 20px 60px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid "+T.brd,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <b style={{fontSize:"16px"}}>✏️ עריכה וייצוא</b>
          <div style={{display:"flex",gap:"6px"}}>
            <button onClick={() => navigator.clipboard.writeText(getText())} style={{background:T.accentBg,border:"1px solid "+T.accent+"30",borderRadius:"8px",padding:"5px 12px",color:T.accent,cursor:"pointer",fontSize:"12px",fontWeight:600}}>📋 העתק</button>
            <button onClick={expWord} style={{background:T.accentBg,border:"1px solid "+T.accent+"30",borderRadius:"8px",padding:"5px 12px",color:T.accent,cursor:"pointer",fontSize:"12px",fontWeight:600}}>📝 Word</button>
            <button onClick={expPdf} style={{background:T.roseBg,border:"1px solid "+T.rose+"30",borderRadius:"8px",padding:"5px 12px",color:T.rose,cursor:"pointer",fontSize:"12px",fontWeight:600}}>📄 PDF</button>
            <button onClick={onClose} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"8px",padding:"4px 8px",cursor:"pointer",color:T.tx3,fontSize:"16px"}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{flex:1,overflow:"auto",padding:"16px"}}><textarea value={content} onChange={e => setContent(e.target.value)} style={{width:"100%",minHeight:"100%",border:"none",outline:"none",fontFamily:"'Heebo',sans-serif",fontSize:"14px",lineHeight:1.8,color:T.tx,direction:"rtl",resize:"none",background:"transparent"}}/></div>
          <div style={{width:"200px",borderRight:"1px solid "+T.brd,overflow:"auto",padding:"10px",background:T.bg,flexShrink:0}}>
            <p style={{fontSize:"11px",fontWeight:700,color:T.tx3,marginBottom:"6px"}}>בחר קטעים:</p>
            <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}><button onClick={() => setSel(new Set(secs.map((_,i)=>i)))} style={{flex:1,background:T.accentBg,border:"none",borderRadius:"6px",padding:"3px",cursor:"pointer",fontSize:"10px",color:T.accent,fontWeight:600}}>הכל</button><button onClick={() => setSel(new Set())} style={{flex:1,background:T.card,border:"1px solid "+T.brd,borderRadius:"6px",padding:"3px",cursor:"pointer",fontSize:"10px",color:T.tx4}}>נקה</button></div>
            {secs.map((s,i) => <div key={i} onClick={() => toggle(i)} style={{background:sel.has(i)?T.accentBg:T.card,border:"1px solid "+(sel.has(i)?T.accent+"40":T.brd),borderRadius:"7px",padding:"6px 8px",marginBottom:"4px",cursor:"pointer",fontSize:"11px",color:sel.has(i)?T.accent:T.tx3}}>{sel.has(i)?"✓ ":""}{s.trim().split("\n")[0].replace(/^#+\s/,"").slice(0,30)||"קטע "+(i+1)}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Message ───────────────────────────────────────────────
const Msg = memo(function Msg({msg, onEdit}){
  const u = msg.role==="user";
  return (
    <div style={{display:"flex",justifyContent:u?"flex-end":"flex-start",gap:"10px",marginBottom:"14px"}}>
      {!u && <div style={{marginTop:"4px",flexShrink:0}}><YuriSm/></div>}
      <div style={{maxWidth:u?"70%":"80%",background:u?"linear-gradient(135deg,"+T.accent+","+T.accentDk+")":T.card,borderRadius:u?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:u?"12px 18px":"16px 20px",border:u?"none":"1px solid "+T.brd,boxShadow:u?"0 3px 12px rgba(79,107,237,0.2)":T.sh}}>
        {u ? <p style={{color:"#fff",lineHeight:1.7,fontSize:"14.5px",whiteSpace:"pre-wrap"}}>{msg.content}</p>
        : <div><Content text={msg.content}/>{msg.content.length > 120 && <div style={{display:"flex",justifyContent:"flex-end",marginTop:"10px"}}><button onClick={() => onEdit(msg.content)} style={{background:T.accentBg,border:"1px solid "+T.accent+"25",borderRadius:"8px",padding:"4px 10px",color:T.accent,cursor:"pointer",fontSize:"12px"}}>✏️ עריכה וייצוא</button></div>}</div>}
      </div>
    </div>
  );
});

function Dots(){ return <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 0"}}><div style={{flexShrink:0,animation:"pulse 1.5s ease infinite"}}><YuriSm/></div><div style={{background:T.card,borderRadius:"16px 16px 4px 16px",padding:"12px 18px",border:"1px solid "+T.brd,display:"flex",gap:"8px",alignItems:"center"}}><span style={{color:T.tx4,fontSize:"13px"}}>יורי חושב...</span></div></div>; }

function DropZone({onFile}){
  const [drag, setDrag] = useState(false); const ref = useRef(null);
  const proc = fl => Array.from(fl).forEach(f => { const rd=new FileReader(); rd.onload=ev=>onFile({name:f.name,base64:ev.target.result.split(",")[1],type:f.type||"application/octet-stream"}); rd.readAsDataURL(f); });
  return (
    <div onDrop={e => {e.preventDefault();setDrag(false);proc(e.dataTransfer.files);}} onDragOver={e => {e.preventDefault();setDrag(true);}} onDragLeave={() => setDrag(false)} onClick={() => ref.current?.click()}
      style={{border:"2px dashed "+(drag?T.orange:T.brd),borderRadius:"16px",padding:"32px 20px",textAlign:"center",cursor:"pointer",background:drag?T.orangeBg:"rgba(234,88,12,0.02)",transition:"all 0.2s",marginBottom:"16px"}}>
      <input ref={ref} type="file" accept={ACCEPT} multiple onChange={e => {proc(e.target.files);ref.current.value="";}} style={{display:"none"}}/>
      <p style={{fontSize:"32px",marginBottom:"8px"}}>{drag?"📂":"📄"}</p>
      <p style={{fontSize:"14px",fontWeight:600,color:drag?T.orange:T.tx2}}>{drag?"שחרר כאן!":"גרור קובץ או לחץ"}</p>
      <p style={{fontSize:"12px",color:T.tx4,marginTop:"4px"}}>PDF, Word, PowerPoint, תמונה</p>
    </div>
  );
}

function HistPanel({list, onLoad, onDel, onClose}){
  return (
    <div style={{position:"fixed",inset:0,zIndex:100}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.18)",backdropFilter:"blur(3px)"}}/>
      <div style={{position:"relative",width:"340px",maxWidth:"85vw",height:"100vh",background:T.card,borderLeft:"1px solid "+T.brd,overflowY:"auto"}}>
        <div style={{padding:"18px 20px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",position:"sticky",top:0,background:T.card,zIndex:2}}>
          <b style={{fontSize:"17px"}}>🕐 היסטוריה</b>
          <button onClick={onClose} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"8px",padding:"4px 8px",cursor:"pointer",color:T.tx3,fontSize:"16px"}}>✕</button>
        </div>
        <div style={{padding:"12px 14px"}}>
          {list.length===0 ? <p style={{textAlign:"center",padding:"40px 0",color:T.tx4}}>📭 אין שיחות</p>
          : list.map((h,i) => (
            <div key={i} onClick={() => {onLoad(h);onClose();}} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"12px",padding:"12px 14px",marginBottom:"10px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div style={{flex:1}}><b style={{fontSize:"13px"}}>{h.emoji} {h.toolLabel}</b><p style={{fontSize:"12px",color:T.tx3,marginTop:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.preview}</p></div>
                <button onClick={e => {e.stopPropagation();onDel(i);}} style={{background:"none",border:"none",cursor:"pointer",color:T.tx4}}>🗑</button>
              </div>
              <p style={{fontSize:"11px",color:T.tx4,marginTop:"4px"}}>{h.date}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
export default function App(){
  const [pg, setPg] = useState("home");
  const [tool, setTool] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [hist, setHist] = useState([]);
  const [showH, setShowH] = useState(false);
  const [busyLbl, setBusyLbl] = useState("");
  const [editText, setEditText] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const endRef = useRef(null);
  const inpRef = useRef(null);
  const abortRef = useRef(null);
  const R = useRef({});
  const savedRef = useRef(false);
  R.current = {input,files,msgs,busy,tool};

  // ─── Auth: listen for user ───────────────────────────────
  useEffect(() => {
    if (!useFirebase()) { setAuthLoading(false); return; }
    (async () => {
      const f = await loadFirebase();
      if (!f) { setAuthLoading(false); return; }
      f.authMod.onAuthStateChanged(f.auth, u => { setUser(u); setAuthLoading(false); });
    })();
  }, []);

  const signIn = async () => {
    const f = await loadFirebase();
    if (f) await f.authMod.signInWithPopup(f.auth, f.provider);
  };
  const signOut = async () => {
    const f = await loadFirebase();
    if (f) await f.authMod.signOut(f.auth);
    setUser(null); setHist([]);
  };

  // ─── History: load from Firestore or localStorage ────────
  useEffect(() => {
    if (authLoading) return;
    (async () => {
      if (useFirebase() && user) {
        const f = await loadFirebase();
        if (f) {
          try {
            const docRef = f.fsMod.doc(f.db, "users", user.uid);
            const snap = await f.fsMod.getDoc(docRef);
            if (snap.exists()) setHist(snap.data().history || []);
          } catch(e) { console.error(e); }
        }
      } else {
        try { const r = await window.storage.get("yuri-local-h"); if (r?.value) setHist(JSON.parse(r.value)); } catch(e){}
      }
    })();
  }, [user, authLoading]);

  const saveH = useCallback(async l => {
    if (useFirebase() && user) {
      const f = await loadFirebase();
      if (f) {
        try {
          // Save without message content to reduce Firestore size — only keep last 50 previews
          const lite = l.map(h => ({...h, messages: h.messages?.slice(-10) || []}));
          await f.fsMod.setDoc(f.fsMod.doc(f.db, "users", user.uid), {history: lite}, {merge:true});
        } catch(e) { console.error(e); }
      }
    } else {
      try { await window.storage.set("yuri-local-h", JSON.stringify(l)); } catch(e){}
    }
  }, [user]);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, busy]);
  useEffect(() => { if (msgs.length > 0) savedRef.current = false; }, [msgs]);

  const saveCon = useCallback((tl, m) => {
    if (m.length < 2 || savedRef.current) return;
    savedRef.current = true;
    const first = m.find(x => x.role==="user");
    setHist(prev => {
      const u = [{toolId:tl?.id||"lesson",toolLabel:tl?.label||"שיחה",emoji:tl?.emoji||"📖",preview:first?.content?.slice(0,100)||"",date:new Date().toLocaleDateString("he-IL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}),messages:m},...prev].slice(0,50);
      saveH(u); return u;
    });
  }, [saveH]);

  const cancelReq = useCallback(() => { if (abortRef.current){abortRef.current.abort();abortRef.current=null;} setBusy(false); setBusyLbl(""); }, []);
  const openTool = useCallback(t => { const{msgs:m,tool:ct,busy:b}=R.current; if(m.length>=2&&!b)saveCon(ct,m); setTool(t);setMsgs([]);setFiles([]);setInput("");setPg("chat");setTimeout(()=>inpRef.current?.focus(),150); }, [saveCon]);
  const openHome = useCallback(() => { const{msgs:m,tool:ct,busy:b}=R.current; if(m.length>=2&&!b)saveCon(ct,m); setPg("home"); }, [saveCon]);

  const send = useCallback(async txt => {
    const{input:inp,files:fs,msgs:prev,busy:b,tool:t}=R.current;
    const msg=txt||inp.trim(); if((!msg&&!fs.length)||b) return;
    const cf=[...fs]; setInput("");setFiles([]);
    const content=msg||(cf.length?"צור מבחן מהקובץ":"");
    setMsgs(p=>[...p,{role:"user",content,files:cf.map(f=>({name:f.name}))}]); setBusy(true);
    const at=t||TOOLS[0]; setBusyLbl(at.label);
    let sys=at.sys;
    if(cf.length)sys+="\n\nהמורה צירף קבצים. קרא אותם ובסס את התשובה על תוכנם.";
    if(/youtu\.?be/.test(content))sys+="\nחפש כתוביות/תקציר של סרטון היוטיוב.";
    else if(/https?:\/\/\S+/.test(content))sys+="\nגש לתוכן הקישור באמצעות חיפוש.";
    const apiMsgs=[...prev,{role:"user",content}].map(m2=>({role:m2.role,content:m2.content}));
    if(cf.length){const last=apiMsgs[apiMsgs.length-1];const parts=[];cf.forEach(f=>{const mt=f.type||"application/octet-stream";parts.push(mt.startsWith("image/")?{type:"image",source:{type:"base64",media_type:mt,data:f.base64}}:{type:"document",source:{type:"base64",media_type:mt,data:f.base64}});});parts.push({type:"text",text:last.content});last.content=parts;}
    const ctrl=new AbortController();abortRef.current=ctrl;const timer=setTimeout(()=>{if(abortRef.current===ctrl)ctrl.abort();},180000);
    try{const reply=await callAI(sys,apiMsgs,ctrl.signal);setMsgs(p=>[...p,{role:"assistant",content:reply}]);}
    catch(err){setMsgs(p=>[...p,{role:"assistant",content:err.name==="AbortError"?"⏹ הפעולה הופסקה.":"⚠️ "+err.message}]);}
    clearTimeout(timer);abortRef.current=null;setBusy(false);setBusyLbl("");
  }, []);

  const onKey=useCallback(e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}},[send]);
  const onInp=useCallback(e=>setInput(e.target.value),[]);
  const onRsz=useCallback(e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,110)+"px";},[]);
  const addF=useCallback(f=>setFiles(p=>[...p,f]),[]);
  const rmF=useCallback(i=>setFiles(p=>p.filter((_,x)=>x!==i)),[]);

  const css=`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;min-height:100vh}body{font-family:'Heebo',sans-serif;background:${T.bg};color:${T.tx};direction:rtl;display:flex;justify-content:center}#root{width:100%}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}textarea:focus,input:focus{outline:none}button{font-family:'Heebo',sans-serif}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}`;
  const histPanel=showH?<HistPanel list={hist} onLoad={h=>{setTool(TOOLS.find(x=>x.id===h.toolId)||TOOLS[0]);setMsgs(h.messages||[]);setPg("chat");}} onDel={i=>{setHist(p=>{const u=p.filter((_,x)=>x!==i);saveH(u);return u;});}} onClose={()=>setShowH(false)}/>:null;

  // ─── Loading / Auth screen ───────────────────────────────
  if (authLoading) return <><style>{css}</style><div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><YuriAv s={60}/></div></>;

  if (useFirebase() && !user) return <><style>{css}</style>
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",padding:"40px"}}>
        <YuriAv s={100}/>
        <h1 style={{fontSize:"36px",fontWeight:900,marginTop:"16px"}}>יורי</h1>
        <p style={{color:T.tx3,marginTop:"6px",marginBottom:"24px"}}>עוזר ההוראה החכם שלך</p>
        <button onClick={signIn} style={{background:T.card,border:"1px solid "+T.brd,borderRadius:"12px",padding:"12px 28px",fontSize:"16px",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:"10px",margin:"0 auto",boxShadow:T.sh}}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.4 16 18.8 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.2 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C37 39.1 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
          התחבר עם Google
        </button>
      </div>
    </div>
  </>;

  // ═══ HOME ═══
  if (pg==="home") return <><style>{css}</style>
    <div style={{minHeight:"100vh",width:"100%",maxWidth:"960px",margin:"0 auto",padding:"0 20px"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",background:"radial-gradient(ellipse 80% 50% at 50% -5%,rgba(79,107,237,0.07),transparent 55%)"}}/>
      <div style={{position:"relative",zIndex:1,maxWidth:"760px",margin:"0 auto",padding:"20px 0 60px"}}>
        {/* User bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
          {user ? <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            {user.photoURL && <img src={user.photoURL} style={{width:"28px",height:"28px",borderRadius:"50%"}} referrerPolicy="no-referrer"/>}
            <span style={{fontSize:"13px",color:T.tx3}}>{user.displayName}</span>
            <button onClick={signOut} style={{background:"none",border:"none",cursor:"pointer",color:T.tx4,fontSize:"12px",textDecoration:"underline"}}>התנתק</button>
          </div> : <div/>}
          <button onClick={() => setShowH(true)} style={{background:T.card,border:"1px solid "+T.brd,borderRadius:"12px",padding:"8px 16px",color:T.tx2,cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",boxShadow:T.sh}}>🕐 היסטוריה{hist.length>0&&<span style={{background:T.accent,color:"#fff",borderRadius:"10px",padding:"1px 7px",fontSize:"11px",fontWeight:600}}>{hist.length}</span>}</button>
        </div>

        <header style={{textAlign:"center",padding:"30px 0 36px"}}><div style={{margin:"0 auto 16px"}}><YuriAv s={100}/></div><h1 style={{fontSize:"clamp(36px,6vw,48px)",fontWeight:900,letterSpacing:"-1px"}}>יורי</h1><p style={{fontSize:"18px",color:T.tx3,marginTop:"6px"}}>עוזר ההוראה החכם שלך</p></header>
        {busy&&<div style={{background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",border:"1px solid #F59E0B40",borderRadius:"14px",padding:"16px 20px",marginBottom:"20px",display:"flex",alignItems:"center",gap:"14px"}}><span style={{fontSize:"22px",animation:"spin 2s linear infinite",display:"inline-block"}}>⏳</span><div style={{flex:1}}><b style={{color:"#92400E"}}>יורי עובד: {busyLbl}</b><p style={{fontSize:"12px",color:"#A16207"}}>ניתן לבצע רק משימה אחת בכל פעם</p></div><button onClick={()=>setPg("chat")} style={{background:"#FEF9C3",border:"1px solid #F59E0B40",borderRadius:"8px",padding:"6px 12px",color:"#92400E",cursor:"pointer",fontSize:"12px",fontWeight:600}}>צפה</button><button onClick={cancelReq} style={{background:"#fff",border:"1px solid "+T.rose+"40",borderRadius:"8px",padding:"6px 12px",color:T.rose,cursor:"pointer",fontSize:"12px",fontWeight:600}}>⏹ עצור</button></div>}
        <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
          {TOOLS.map(t => <button key={t.id} onClick={() => openTool(t)} style={{background:T.card,border:"1px solid "+(t.id==="text2exam"?T.orange+"30":T.brd),borderRadius:"16px",padding:"24px 28px",cursor:"pointer",textAlign:"right",transition:"all 0.25s",boxShadow:T.sh,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",gap:"18px"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";}} onMouseLeave={e=>{e.currentTarget.style.transform="";}}>
            {t.id==="text2exam"&&<div style={{position:"absolute",top:"10px",left:"10px",background:T.orange,color:"#fff",borderRadius:"6px",padding:"2px 8px",fontSize:"10px",fontWeight:700}}>חדש!</div>}
            <div style={{width:"56px",height:"56px",borderRadius:"16px",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px",flexShrink:0}}>{t.emoji}</div>
            <div><div style={{fontSize:"19px",fontWeight:700,marginBottom:"4px"}}>{t.label}</div><p style={{fontSize:"14px",color:T.tx4}}>{t.desc}</p></div>
          </button>)}
        </div>
        <div style={{textAlign:"center",marginTop:"44px",padding:"16px 0",borderTop:"1px solid "+T.brd}}>
          <p style={{fontSize:"12px",color:T.tx4}}>יורי — עוזר הוראה AI 🇮🇱</p>
          <a href="mailto:matanbz95@gmail.com" style={{fontSize:"12px",color:T.accent,textDecoration:"none",marginTop:"4px",display:"inline-block"}}>📧 יצירת קשר</a>
        </div>
      </div>
    </div>{histPanel}</>;

  // ═══ CHAT ═══
  const isT2E=tool?.id==="text2exam";
  return <><style>{css}</style>
    <div style={{display:"flex",flexDirection:"column",height:"100vh",width:"100%",maxWidth:"960px",margin:"0 auto"}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(255,255,255,0.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid "+T.brd,padding:"12px 24px",display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={openHome} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"10px",padding:"7px 9px",color:T.tx3,cursor:"pointer",fontSize:"16px"}}>🏠</button>
        {tool&&<div style={{display:"flex",alignItems:"center",gap:"9px"}}><div style={{width:"32px",height:"32px",borderRadius:"10px",background:tool.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px"}}>{tool.emoji}</div><div><b style={{fontSize:"14.5px"}}>{tool.label}</b><p style={{fontSize:"11px",color:T.tx4}}>יורי</p></div></div>}
        <div style={{marginRight:"auto",display:"flex",gap:"6px"}}><button onClick={()=>setShowH(true)} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"8px",padding:"6px 12px",color:T.tx4,fontSize:"12px",cursor:"pointer"}}>🕐</button><button onClick={()=>{const{msgs:m,tool:ct,busy:b2}=R.current;if(m.length>=2&&!b2)saveCon(ct,m);cancelReq();setMsgs([]);setFiles([]);setInput("");}} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"8px",padding:"6px 12px",color:T.tx4,fontSize:"12px",cursor:"pointer"}}>+ חדש</button></div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px",background:T.bg}}>
        <div style={{maxWidth:"840px",margin:"0 auto"}}>
          {msgs.length===0&&<div style={{padding:"40px 20px",textAlign:"center"}}>
            <div style={{width:"60px",height:"60px",borderRadius:"18px",margin:"0 auto 18px",background:tool?.bg||T.accentBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"28px"}}>{tool?.emoji}</div>
            <h3 style={{fontSize:"19px",fontWeight:700,marginBottom:"6px"}}>{tool?.label}</h3>
            <p style={{color:T.tx4,fontSize:"13.5px",maxWidth:"400px",margin:"0 auto"}}>{tool?.desc}</p>
            {isT2E&&<div style={{marginTop:"20px",textAlign:"right"}}><DropZone onFile={addF}/><div style={{background:T.card,border:"1px solid "+T.brd,borderRadius:"14px",padding:"18px 22px"}}><b style={{color:T.orange}}>🔬 איך להשתמש?</b><div style={{fontSize:"13px",color:T.tx2,lineHeight:1.9,marginTop:"8px"}}><p>📄 <b>קובץ:</b> גרור PDF / Word / תמונה לריבוע</p><p>📝 <b>טקסט:</b> הדבק בתיבת הכתיבה</p><p>🔗 <b>קישור:</b> ויקיפדיה / אתר לימודי</p><p>🎬 <b>יוטיוב:</b> יורי יחפש כתוביות</p><p style={{color:T.orange,fontWeight:600,marginTop:"8px"}}>💡 המבחן יתבסס רק על החומר שסיפקת</p></div></div></div>}
          </div>}
          {msgs.map((m,i) => <Msg key={i} msg={m} onEdit={setEditText}/>)}
          {busy&&<Dots/>}
          <div ref={endRef}/>
        </div>
      </div>
      <div style={{position:"sticky",bottom:0,zIndex:10,background:"rgba(244,246,251,0.92)",backdropFilter:"blur(12px)",borderTop:"1px solid "+T.brd,padding:"12px 24px"}}>
        <div style={{maxWidth:"840px",margin:"0 auto"}}>
          {files.length>0&&<div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>{files.map((f,i)=><div key={i} style={{background:T.bg,border:"1px solid "+T.brd,borderRadius:"8px",padding:"4px 10px",fontSize:"12px",color:T.tx3,display:"flex",alignItems:"center",gap:"6px"}}>📄 {f.name}<button onClick={()=>rmF(i)} style={{background:"none",border:"none",cursor:"pointer",color:T.tx4,fontSize:"14px"}}>×</button></div>)}</div>}
          {busy&&<div style={{display:"flex",justifyContent:"center",marginBottom:"10px"}}><button onClick={cancelReq} style={{background:T.card,border:"2px solid "+T.rose+"50",borderRadius:"12px",padding:"8px 22px",color:T.rose,cursor:"pointer",fontSize:"14px",fontWeight:600}}>⏹ עצור</button></div>}
          <div style={{display:"flex",alignItems:"flex-end",gap:"10px",background:T.card,border:"1px solid "+T.brd,borderRadius:"16px",padding:"5px 5px 5px 14px",boxShadow:T.sh}}>
            <button onClick={()=>{const r=document.createElement("input");r.type="file";r.accept=ACCEPT;r.multiple=true;r.onchange=e=>Array.from(e.target.files).forEach(f=>{const rd=new FileReader();rd.onload=ev=>addF({name:f.name,base64:ev.target.result.split(",")[1],type:f.type||"application/octet-stream"});rd.readAsDataURL(f);});r.click();}} style={{background:"none",border:"none",cursor:"pointer",color:T.tx4,fontSize:"18px",padding:"8px 4px",flexShrink:0}}>📎</button>
            <textarea ref={inpRef} value={input} onChange={onInp} onKeyDown={onKey} onInput={onRsz} placeholder={tool?.ph||"כתוב כאן..."} rows={1} style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.tx,fontSize:"14.5px",fontFamily:"'Heebo',sans-serif",resize:"none",padding:"9px 0",direction:"rtl",maxHeight:"110px",lineHeight:1.5}}/>
            <button onClick={()=>send()} disabled={(!input.trim()&&!files.length)||busy} style={{width:"42px",height:"42px",borderRadius:"12px",background:(input.trim()||files.length)&&!busy?"linear-gradient(135deg,"+T.accent+","+T.accentDk+")":T.bg,border:"none",color:(input.trim()||files.length)&&!busy?"#fff":T.tx4,cursor:(input.trim()||files.length)&&!busy?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"16px"}}>{busy?<span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⏳</span>:"🚀"}</button>
          </div>
        </div>
      </div>
    </div>
    {editText!==null&&<Editor text={editText} onClose={()=>setEditText(null)}/>}
    {histPanel}
  </>;
}
