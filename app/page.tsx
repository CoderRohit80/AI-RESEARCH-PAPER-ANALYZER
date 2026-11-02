"use client";

import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileText,
  FlaskConical,
  Layers3,
  LoaderCircle,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

type TabId = "summary" | "insights" | "methodology" | "qa";
type Analysis = {
  title?: string;
  abstract_summary?: string;
  key_insights?: string[];
  methodology?: string;
  limitations?: string[];
  qa_pairs?: { question: string; answer: string }[];
  paper_text?: string;
};
type ChatMessage = { sender: "user" | "assistant"; text: string; error?: boolean };

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const tabs: { id: TabId; label: string; icon: typeof Layers3 }[] = [
  { id: "summary", label: "Executive summary", icon: Layers3 },
  { id: "insights", label: "Key insights", icon: Sparkles },
  { id: "methodology", label: "Method & limitations", icon: FlaskConical },
  { id: "qa", label: "Essential Q&A", icon: CircleHelp },
];

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAnswer(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  const detail = typeof data?.detail === "string" ? data.detail.slice(0, 320) : "";
  return new Error(detail || fallback);
}

export default function ResearchAnalyzerApp() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    setError("");
    setNotice("");
    const looksLikePdf = selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) {
      setError("That file doesn’t look like a PDF. Choose a .pdf file to continue.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError("This PDF is over the 20 MB limit. Choose a smaller file.");
      return;
    }
    setFile(selected);
    setAnalysis(null);
    setChatMessages([]);
    setActiveTab("summary");
  };

  const removeFile = () => {
    setFile(null);
    setAnalysis(null);
    setError("");
    setNotice("");
    setChatMessages([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const analyzePaper = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setNotice("");
    setAnalysis(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${apiBase}/api/analyze-pdf`, { method: "POST", body: form });
      if (!response.ok) throw await responseError(response, "We couldn’t analyze this paper.");
      const result: Analysis = await response.json();
      setAnalysis(result);
      setNotice("Analysis is ready. Explore the sections or ask this paper a question.");
      setChatMessages([{ sender: "assistant", text: "Your paper is ready. Ask a question about its methods, findings, or limitations." }]);
      setActiveTab("summary");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t reach the analysis service. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!analysis || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/download-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis),
      });
      if (!response.ok) throw await responseError(response, "The summary PDF couldn’t be generated.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      const safeTitle = (analysis.title || "Research_Paper").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "Research_Paper";
      link.download = `${safeTitle}_Analysis.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Your summary PDF has been downloaded.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The summary PDF couldn’t be generated.");
    } finally {
      setDownloading(false);
    }
  };

  const askPaper = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || !analysis?.paper_text || chatLoading) return;
    setQuestion("");
    setChatMessages((messages) => [...messages, { sender: "user", text }]);
    setChatLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, paper_text: analysis.paper_text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || "Couldn’t answer that question.");
      setChatMessages((messages) => [...messages, { sender: "assistant", text: data.answer }]);
    } catch (reason) {
      setChatMessages((messages) => [...messages, { sender: "assistant", text: reason instanceof Error ? reason.message : "Couldn’t answer that question.", error: true }]);
    } finally {
      setChatLoading(false);
      window.setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  };

  const openPicker = () => inputRef.current?.click();
  const tabNav = (mobile = false) => (
    <nav aria-label="Analysis sections" className="space-y-1">
      <p className="eyebrow px-3 pb-2 pt-5">Your analysis</p>
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id;
        return (
          <button key={id} onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }} disabled={!analysis}
            className={`side-link ${active && analysis ? "side-link-active" : ""} ${!analysis ? "side-link-disabled" : ""}`}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            {id === "insights" && analysis?.key_insights?.length ? <span className="side-count">{analysis.key_insights.length}</span> : null}
          </button>
        );
      })}
      {analysis && file && <div className="mt-5 rounded-xl border border-slate-200/80 bg-white p-3.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><FileCheck2 size={15} className="text-indigo-500" /> Current paper</div>
        <p className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-800">{analysis.title || file.name}</p>
        <p className="mt-1 text-xs text-slate-500">{formatSize(file.size)} · PDF</p>
      </div>}
      {mobile && <div className="mt-6 rounded-xl bg-indigo-50/80 p-3.5 text-xs leading-5 text-indigo-900"><ShieldCheck size={16} className="mb-1 text-indigo-600" />Your paper is processed for analysis. Ask questions grounded in its text.</div>}
    </nav>
  );

  return (
    <main className="app-shell min-h-screen text-slate-900">
      <aside className="sidebar hidden lg:flex">
        <a href="#workspace" className="brand-lockup" aria-label="AI Research Paper Analyzer home">
          <span className="brand-mark"><BookOpen size={20} strokeWidth={2.1} /></span>
          <span className="brand-name">paper<span>wise</span><small>AI RESEARCH PAPER ANALYZER</small></span>
        </a>
        <div className="sidebar-rule" />
        <p className="eyebrow px-3 pb-2">Workspace</p>
        <a href="#workspace" className="side-link side-link-active"><Layers3 size={17} strokeWidth={1.8} /><span>Paper analyzer</span></a>
        {tabNav()}
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><ShieldCheck size={16} /></span><div><strong>Private by design</strong><p>Your documents stay in this session.</p></div></div>
          <span className="sidebar-version">AI Research Paper Analyzer <span>·</span> Workspace</span>
        </div>
      </aside>

      {mobileMenuOpen && <div className="mobile-overlay lg:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`mobile-drawer lg:hidden ${mobileMenuOpen ? "mobile-drawer-open" : ""}`} aria-hidden={!mobileMenuOpen}>
        <div className="flex items-center justify-between"><div className="brand-lockup"><span className="brand-mark"><BookOpen size={20} /></span><span className="brand-name">paper<span>wise</span><small>AI RESEARCH PAPER ANALYZER</small></span></div><button className="icon-button" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button></div>
        <div className="sidebar-rule" /><a href="#workspace" className="side-link side-link-active" onClick={() => setMobileMenuOpen(false)}><Layers3 size={17} /><span>Paper analyzer</span></a>
        {tabNav(true)}
      </aside>

      <section id="workspace" className="main-column min-w-0 flex-1">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button lg:hidden" aria-label="Open navigation" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>Paper analyzer</strong></div>
          </div>
          <div className="topbar-status"><span className="status-dot" /> <span>{loading ? "Analyzing paper" : analysis ? "Analysis ready" : "Ready to analyze"}</span><span className="topbar-divider" /><span className="powered-by"><Sparkles size={14} /> AI-powered</span></div>
        </header>

        <div className="workspace-content">
          <div className="page-heading">
            <div><div className="heading-kicker"><span className="kicker-line" /> YOUR RESEARCH, CLARIFIED</div>
              <h1>Understand research.<br className="sm:hidden" /> <span>Faster.</span></h1>
              <p>Turn dense papers into clear, actionable insights.</p>
            </div>
            {analysis && <button onClick={downloadReport} disabled={downloading} className="button button-secondary heading-download"><ArrowDownToLine size={17} />{downloading ? "Preparing PDF…" : "Download summary"}</button>}
          </div>

          <section className={`upload-card ${dragging ? "upload-card-dragging" : ""}`} aria-labelledby="upload-heading"
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a research paper PDF" onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ""; }} />
            <div className="upload-card-top"><div><div className="section-overline">START WITH A PAPER</div><h2 id="upload-heading">Bring your research into focus</h2><p>Upload a paper and let AI do the heavy reading.</p></div><div className="upload-step"><span>01</span><span className="step-line" /><span className={analysis ? "step-complete" : loading ? "step-current" : ""}>{analysis ? "✓" : "02"}</span></div></div>
            <div className={`dropzone ${file ? "dropzone-selected" : ""}`}>
              <div className="dropzone-icon">{loading ? <LoaderCircle className="animate-spin" size={23} /> : file ? <FileCheck2 size={23} /> : <UploadCloud size={23} />}</div>
              <div className="dropzone-copy">
                {file ? <><strong className="break-all">{file.name}</strong><span>{formatSize(file.size)} <span className="inline-dot">·</span> PDF document {analysis ? <span className="ready-chip"><Check size={12} /> Analyzed</span> : loading ? <span className="working-chip"><LoaderCircle size={12} className="animate-spin" /> Analyzing</span> : null}</span></> : <><strong>{dragging ? "Drop your paper here" : "Drag your paper here"}</strong><span>or choose a PDF from your device</span></>}
              </div>
              <div className="dropzone-actions">
                {file && <button type="button" className="text-button text-button-muted" onClick={removeFile} disabled={loading}>Remove</button>}
                <button type="button" onClick={openPicker} disabled={loading} className="button button-outline"><FileText size={16} />{file ? "Replace PDF" : "Browse files"}</button>
              </div>
            </div>
            <div className="upload-footer"><span><CheckCircle2 size={15} /> PDF only</span><span><CheckCircle2 size={15} /> Up to 20 MB</span><span><ShieldCheck size={15} /> Secure processing</span>
              <button type="button" onClick={analyzePaper} disabled={!file || loading} className="button button-primary analyze-button">{loading ? <><LoaderCircle className="animate-spin" size={17} /> Reading your paper…</> : analysis ? <><Check size={17} /> Analysis complete</> : <>Analyze paper <ArrowUpRight size={17} /></>}</button>
            </div>
            {loading && <div className="loading-track" aria-label="Analysis in progress"><span /></div>}
            {error && <div className="feedback feedback-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
            {notice && <div className="feedback feedback-success" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></div>}
          </section>

          {loading ? <section className="results-card" aria-label="Analysis loading"><div className="skeleton-heading" /><div className="skeleton-line skeleton-wide" /><div className="skeleton-line" /><div className="skeleton-line skeleton-short" /><div className="skeleton-block" /><p className="loading-caption"><LoaderCircle className="animate-spin" size={16} />Reading the paper and preparing your analysis…</p></section> : analysis ? (
            <section className="results-card" aria-labelledby="results-title">
              <div className="results-header"><div className="min-w-0"><div className="result-label"><span className="result-spark"><Sparkles size={14} /></span> PAPER ANALYSIS <span className="result-separator">/</span> {tabs.find((tab) => tab.id === activeTab)?.label.toUpperCase()}</div><h2 id="results-title" className="break-words">{analysis.title || file?.name || "Research paper analysis"}</h2></div>
                <button onClick={downloadReport} disabled={downloading} className="button button-secondary results-download"><ArrowDownToLine size={16} />{downloading ? "Preparing…" : "Download PDF"}</button></div>
              <div className="analysis-tabs" role="tablist" aria-label="Paper analysis sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`panel-${id}`} onClick={() => setActiveTab(id)} className={`analysis-tab ${activeTab === id ? "analysis-tab-active" : ""}`}><Icon size={16} strokeWidth={1.9} /><span>{label}</span>{id === "insights" && analysis.key_insights?.length ? <span className="tab-count">{analysis.key_insights.length}</span> : null}</button>)}</div>
              <div className="analysis-content" id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`} key={activeTab}>
                {activeTab === "summary" && <div className="prose-panel"><div className="content-label"><span className="content-marker marker-indigo" />THE BIG PICTURE</div>{analysis.abstract_summary ? <p className="summary-copy">{analysis.abstract_summary}</p> : <EmptySection text="No executive summary was returned for this paper." />}</div>}
                {activeTab === "insights" && <div className="prose-panel"><div className="content-label"><span className="content-marker marker-cyan" />WHAT MATTERS</div>{analysis.key_insights?.length ? <ol className="insight-list">{analysis.key_insights.map((item, index) => <li key={`${index}-${item}`}><span className="insight-number">{String(index + 1).padStart(2, "0")}</span><span>{item}</span></li>)}</ol> : <EmptySection text="No key insights were returned for this paper." />}</div>}
                {activeTab === "methodology" && <div className="method-grid"><article className="method-block"><div className="content-label"><span className="content-marker marker-indigo" />APPROACH</div>{analysis.methodology ? <p>{analysis.methodology}</p> : <EmptySection text="No methodology details were returned." />}</article><article className="method-block limitation-block"><div className="content-label"><span className="content-marker marker-amber" />LIMITATIONS & GAPS</div>{analysis.limitations?.length ? <ul className="limitation-list">{analysis.limitations.map((item, index) => <li key={`${index}-${item}`}><AlertCircle size={16} /><span>{item}</span></li>)}</ul> : <EmptySection text="No limitations were returned for this paper." />}</article></div>}
                {activeTab === "qa" && <div className="prose-panel"><div className="content-label"><span className="content-marker marker-cyan" />QUESTIONS FROM THE PAPER</div>{analysis.qa_pairs?.length ? <div className="qa-list">{analysis.qa_pairs.map((pair, index) => <article className="qa-item" key={`${index}-${pair.question}`}><span className="qa-index">0{index + 1}</span><div><h3>{pair.question}</h3><p>{pair.answer}</p></div></article>)}</div> : <EmptySection text="No essential Q&A pairs were returned for this paper." />}</div>}
              </div>
              <div className="document-strip"><span className="document-strip-icon"><FileText size={16} /></span><div className="min-w-0"><strong className="truncate">{file?.name || analysis.title || "Research paper"}</strong><span>{file ? `${formatSize(file.size)} · PDF` : "Analysis source document"}</span></div><span className="document-strip-ready"><CheckCircle2 size={15} /> In this session</span></div>
            </section>
          ) : <section className="welcome-card"><div className="welcome-illustration"><div className="illustration-sheet"><span /><span /><span /><span /><span /></div><div className="illustration-spark"><Sparkles size={19} /></div><div className="illustration-check"><Check size={15} /></div></div><div className="welcome-copy"><div className="section-overline">A CLEARER WAY TO READ</div><h2>Your next breakthrough<br className="hidden sm:block" /> starts with understanding.</h2><p>Get to the signal in every paper. Explore a concise summary, research insights, methods, and thoughtful answers grounded in the text.</p></div><div className="welcome-features"><div><span className="feature-icon feature-violet"><Layers3 size={17} /></span><span><strong>Structured insights</strong><small>Key findings, made clear</small></span></div><div><span className="feature-icon feature-teal"><MessageCircle size={17} /></span><span><strong>Ask this paper</strong><small>Answers from your source</small></span></div><div><span className="feature-icon feature-amber"><ArrowDownToLine size={17} /></span><span><strong>Ready to share</strong><small>Download a polished report</small></span></div></div></section>}

          {analysis && <section className="ask-card" aria-labelledby="ask-title"><div className="ask-header"><div className="ask-icon"><MessageCircle size={19} /></div><div><div className="section-overline">GROUNDED IN YOUR DOCUMENT</div><h2 id="ask-title">Ask this paper</h2><p>Get a clear answer based on the research you uploaded.</p></div><span className="ask-source"><span className="status-dot" /> Paper connected</span></div>
            <div className="conversation" aria-live="polite">{chatMessages.map((message, index) => <div key={`${index}-${message.sender}`} className={`chat-row ${message.sender === "user" ? "chat-row-user" : ""}`}><span className={`chat-avatar ${message.sender === "user" ? "chat-avatar-user" : ""}`}>{message.sender === "user" ? "Y" : <Sparkles size={14} />}</span><div className={`chat-bubble ${message.sender === "user" ? "chat-bubble-user" : ""} ${message.error ? "chat-bubble-error" : ""}`}>{message.sender === "assistant" ? renderAnswer(message.text) : message.text}</div></div>)}{chatLoading && <div className="chat-row"><span className="chat-avatar"><Sparkles size={14} /></span><div className="chat-bubble chat-thinking"><LoaderCircle size={15} className="animate-spin" />Finding an answer in your paper…</div></div>}<div ref={chatEndRef} /></div>
            {!analysis.paper_text && <p className="context-warning"><AlertCircle size={15} />This analysis did not include source text, so paper questions are unavailable.</p>}
            <form className="question-form" onSubmit={askPaper}><label htmlFor="paper-question" className="sr-only">Ask a question about this paper</label><textarea id="paper-question" rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about the methods, results, or limitations…" disabled={!analysis.paper_text || chatLoading} /><button type="submit" aria-label="Send question" disabled={!question.trim() || !analysis.paper_text || chatLoading} className="send-button"><ArrowUpRight size={18} /></button></form><div className="ask-footnote"><span><ShieldCheck size={14} />Answers stay grounded in this paper</span><span>Enter to send <i>·</i> Shift + Enter for a new line</span></div>
          </section>}

          <footer className="page-footer"><span><Clock3 size={14} />Thoughtful research, without the busywork.</span><span>Built for curious minds <span className="footer-star">✳</span></span></footer>
        </div>
      </section>
    </main>
  );
}

function EmptySection({ text }: { text: string }) {
  return <div className="empty-section"><FileText size={18} /><span>{text}</span></div>;
}
