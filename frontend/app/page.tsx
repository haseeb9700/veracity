"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser, AuthUser } from "./lib/auth";
import Aurora from "./components/Aurora";
import BorderGlow from "./components/BorderGlow";
import ScrollReveal from "./components/ScrollReveal";
import CountUp from "./components/CountUp";
import TextLoop from "./components/TextLoop";
import TextScramble from "./components/TextScramble";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
type AnalysisResult = {
  run_id: number; filename: string; profile: any; quality: any;
  schema_validation: any; ticket_analysis: any; opportunities: any;
  bottlenecks: any; impact_analysis: any; ticket_clusters: any; ai_advisor_report: any;
};
type RunSummary = {
  run_id: number; filename: string; rows: number;
  quality_score: number; grade: string; created_at: string;
};
type ChatMessage = { role: "user" | "ai"; text: string; sources?: string[]; };

const SUGGESTIONS = [
  "What are the biggest bottlenecks?",
  "Which tickets should I automate first?",
  "What's the estimated ROI?",
  "How can I improve data quality?",
  "What does the 30-day plan involve?",
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Data state
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sidebar
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChatBubble, setShowChatBubble] = useState(false);
  const [qualityAlert, setQualityAlert] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RunSummary | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);

  // Modals
  const [showConnector, setShowConnector] = useState<"jira" | "zendesk" | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // Connector form state
  const [jiraForm, setJiraForm] = useState({ jira_url: "", email: "", api_token: "", project_key: "" });
  const [zendeskForm, setZendeskForm] = useState({ subdomain: "", email: "", api_token: "" });
  const [connectorLoading, setConnectorLoading] = useState(false);
  const [connectorError, setConnectorError] = useState("");
  const [connectorTested, setConnectorTested] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) { router.replace("/login"); return; }
    setUser(stored);
    setAuthChecked(true);
    fetchRuns(stored.access_token);
    if (!localStorage.getItem("veracity_onboarded")) {
      setTimeout(() => setShowOnboarding(true), 600);
    }
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  useEffect(() => {
    // Show greeting bubble 1.5s after load, hide after 5s
    const show = setTimeout(() => setShowChatBubble(true), 1500);
    const hide = setTimeout(() => setShowChatBubble(false), 6500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  // Auto-dismiss quality alert after 10s
  useEffect(() => {
    if (!qualityAlert) return;
    const t = setTimeout(() => setQualityAlert(null), 10000);
    return () => clearTimeout(t);
  }, [qualityAlert]);

  // Scroll-reveal via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); observer.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });

  async function fetchRuns(token: string) {
    try {
      const res = await fetch(`${API}/runs`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRuns(await res.json());
    } catch {}
  }

  async function deleteRun(run_id: number) {
    if (!user) return;
    try {
      const res = await fetch(`${API}/runs/${run_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.access_token}` },
      });
      if (!res.ok) {
        // Server rejected the delete — don't touch UI, let user try again
        setDeleteTarget(null);
        setError(`Delete failed (${res.status}). Please try again.`);
        return;
      }
      // Only update UI once server confirms deletion
      setRuns(prev => prev.filter(r => r.run_id !== run_id));
      if (result?.run_id === run_id) setResult(null);
    } catch (e) {
      setDeleteTarget(null);
      setError("Delete failed — check your connection.");
      return;
    }
    setDeleteTarget(null);
  }

  async function loadRun(run_id: number) {
    try {
      const res = await fetch(`${API}/runs/${run_id}`, {
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });
      if (res.ok) { setResult(await res.json()); setMessages([]); }
    } catch {}
  }

  function handleLogout() { clearUser(); router.replace("/login"); }

  async function handleUpload() {
    if (!file) { setError("Please select a CSV file first."); return; }
    setLoading(true); setError(""); setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/upload`, {
        method: "POST", body: formData,
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });
      if (!res.ok) {
        if (res.status === 401) { handleLogout(); return; }
        throw new Error("Upload failed.");
      }
      const data = await res.json();
      setResult(data); setMessages([]);
      if (data.quality_alert) setQualityAlert(data.quality_alert);
      fetchRuns(user!.access_token);
    } catch (err: any) { setError(err.message || "Something went wrong."); }
    finally { setLoading(false); }
  }

  async function handleConnectorFetch(type: "jira" | "zendesk") {
    setConnectorLoading(true); setConnectorError("");
    try {
      const body = type === "jira" ? jiraForm : zendeskForm;
      const res = await fetch(`${API}/connectors/${type}/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.access_token}` },
        body: JSON.stringify({ ...body, max_issues: 500, max_tickets: 500 }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Fetch failed");
      }
      const data = await res.json();
      setResult(data); setMessages([]);
      setShowConnector(null); setConnectorTested(false);
      fetchRuns(user!.access_token);
    } catch (err: any) { setConnectorError(err.message); }
    finally { setConnectorLoading(false); }
  }

  async function testConnector(type: "jira" | "zendesk") {
    setConnectorLoading(true); setConnectorError("");
    try {
      const body = type === "jira" ? jiraForm : zendeskForm;
      const res = await fetch(`${API}/connectors/${type}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { setConnectorTested(true); setConnectorError(`✓ Connected as ${data.user}`); }
      else { setConnectorError(data.error || "Connection failed"); }
    } catch (err: any) { setConnectorError(err.message); }
    finally { setConnectorLoading(false); }
  }

  async function sendChat(text: string) {
    if (!text.trim() || chatLoading) return;
    const trimmed = text.trim();
    setChatOpen(true);
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setChatInput(""); setChatLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.access_token}` },
        body: JSON.stringify({ query: trimmed, run_id: result?.run_id ?? null }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.answer, sources: data.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "Sorry, something went wrong." }]);
    } finally { setChatLoading(false); }
  }

  function exportPDF() {
    if (!result) return;
    const content = `
VERACITY ANALYSIS REPORT
========================
File: ${result.filename}
Generated: ${new Date().toLocaleDateString()}

DATA QUALITY
------------
Score: ${result.quality?.quality_score}/100  Grade: ${result.quality?.grade}
Rows Analyzed: ${result.profile?.rows}
Columns: ${result.profile?.columns}
Missing Data: ${result.quality?.missing_percentage}%
Duplicate Rows: ${result.profile?.duplicate_rows}

Issues:
${(result.quality?.issues || []).map((i: string) => `• ${i}`).join("\n")}

AI EXECUTIVE SUMMARY
--------------------
${result.ai_advisor_report?.executive_summary || "N/A"}

LEADERSHIP MESSAGE
------------------
${result.ai_advisor_report?.leadership_message || "N/A"}

TOP AUTOMATION OPPORTUNITIES
-----------------------------
${(result.opportunities?.opportunities || []).slice(0, 10).map((o: any, i: number) =>
  `${i + 1}. ${o.issue} — ${o.main_department} — ${o.ticket_count} tickets — ${o.impact_level} impact`
).join("\n")}

ESTIMATED SAVINGS
-----------------
$${Number(result.impact_analysis?.total_estimated_cost_savings || 0).toLocaleString()}

90-DAY ROADMAP
--------------
30 Days: ${result.ai_advisor_report?.suggested_30_60_90_day_plan?.day_30 || "N/A"}
60 Days: ${result.ai_advisor_report?.suggested_30_60_90_day_plan?.day_60 || "N/A"}
90 Days: ${result.ai_advisor_report?.suggested_30_60_90_day_plan?.day_90 || "N/A"}

SLOWEST DEPARTMENTS
-------------------
${Object.entries(result.bottlenecks?.bottlenecks?.slowest_departments || {}).map(([k, v]) => `• ${k}: ${v} hrs avg`).join("\n")}
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `veracity-report-${result.run_id}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  function completeOnboarding() {
    localStorage.setItem("veracity_onboarded", "1");
    setShowOnboarding(false);
  }

  // ── Drag-and-drop handlers ──────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped); setError("");
    } else {
      setError("Only CSV files are supported.");
    }
  }

  if (!authChecked) return null;

  const qualityScore   = result?.quality?.quality_score ?? 0;
  const savings        = result?.impact_analysis?.total_estimated_cost_savings ?? 0;
  const rows           = result?.profile?.rows ?? 0;
  const duplicates     = result?.profile?.duplicate_rows ?? 0;
  const missingPercent = result?.quality?.missing_percentage ?? 0;
  const slowestDepts   = result?.bottlenecks?.bottlenecks?.slowest_departments ?? {};
  const topOpps        = result?.opportunities?.opportunities ?? [];
  const clusters       = result?.ticket_clusters?.clusters ?? [];
  const aiReport       = result?.ai_advisor_report;

  // Score trend vs previous run
  const prevRun = runs.length > 1 ? runs.find(r => r.run_id !== result?.run_id) : null;
  const scoreDelta = prevRun && result ? qualityScore - prevRun.quality_score : null;

  return (
    <>
      <style>{styles}</style>
      <div className="app">

        {/* ── ONBOARDING MODAL ── */}
        {showOnboarding && (
          <div className="overlay" onClick={completeOnboarding}>
            <div className="modal onboardingModal" onClick={e => e.stopPropagation()}>
              <div className="onboardingSteps">
                {ONBOARDING_STEPS.map((s, i) => (
                  <div key={i} className={`onboardingStep ${onboardingStep === i ? "active" : ""} ${onboardingStep > i ? "done" : ""}`}>
                    <div className="onboardingIcon">{s.icon}</div>
                    <div>
                      <div className="onboardingTitle">{s.title}</div>
                      <div className="onboardingDesc">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="onboardingNav">
                {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
                  <button className="btn btnPrimary" onClick={() => setOnboardingStep(s => s + 1)}>Next →</button>
                ) : (
                  <button className="btn btnPrimary" onClick={completeOnboarding}>Get Started</button>
                )}
                <button className="btn btnGhost" onClick={completeOnboarding}>Skip</button>
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECTOR MODAL ── */}
        {showConnector && (
          <div className="overlay" onClick={() => { setShowConnector(null); setConnectorError(""); setConnectorTested(false); }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modalHeader">
                <div className="modalTitle">
                  {showConnector === "jira" ? "🔗 Connect Jira" : "🎫 Connect Zendesk"}
                </div>
                <button className="chatClose" onClick={() => { setShowConnector(null); setConnectorError(""); setConnectorTested(false); }}>✕</button>
              </div>
              {showConnector === "jira" ? (
                <div className="formGrid">
                  <FormField label="Jira URL" placeholder="https://yourcompany.atlassian.net" value={jiraForm.jira_url} onChange={(v: string) => setJiraForm(f => ({ ...f, jira_url: v }))} />
                  <FormField label="Email" placeholder="you@company.com" value={jiraForm.email} onChange={(v: string) => setJiraForm(f => ({ ...f, email: v }))} />
                  <FormField label="API Token" placeholder="Your Jira API token" value={jiraForm.api_token} onChange={(v: string) => setJiraForm(f => ({ ...f, api_token: v }))} type="password" />
                  <FormField label="Project Key (optional)" placeholder="e.g. IT, SUPPORT" value={jiraForm.project_key} onChange={(v: string) => setJiraForm(f => ({ ...f, project_key: v }))} />
                  <p className="modalHint">Get your API token at: <strong>id.atlassian.com → Security → API tokens</strong></p>
                </div>
              ) : (
                <div className="formGrid">
                  <FormField label="Subdomain" placeholder="yourcompany (from yourcompany.zendesk.com)" value={zendeskForm.subdomain} onChange={(v: string) => setZendeskForm(f => ({ ...f, subdomain: v }))} />
                  <FormField label="Email" placeholder="you@company.com" value={zendeskForm.email} onChange={(v: string) => setZendeskForm(f => ({ ...f, email: v }))} />
                  <FormField label="API Token" placeholder="Your Zendesk API token" value={zendeskForm.api_token} onChange={(v: string) => setZendeskForm(f => ({ ...f, api_token: v }))} type="password" />
                  <p className="modalHint">Get your API token at: <strong>Zendesk Admin → Apps → Zendesk API</strong></p>
                </div>
              )}
              {connectorError && (
                <div className={`connectorMsg ${connectorTested ? "success" : "error"}`}>{connectorError}</div>
              )}
              <div className="modalFooter">
                <button className="btn btnOutline" disabled={connectorLoading} onClick={() => testConnector(showConnector)}>
                  {connectorLoading ? "Testing…" : "Test Connection"}
                </button>
                <button className="btn btnPrimary" disabled={connectorLoading || !connectorTested} onClick={() => handleConnectorFetch(showConnector)}>
                  {connectorLoading ? "Fetching…" : "Fetch & Analyse"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── NAV ── */}
        <nav className="topNav">
          <div className="navLeft">
            <button className="sidebarToggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>
            <div className="navBrand">
              <div className="navLogo">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              Veracity
            </div>
          </div>
          <div className="navRight">
            {result && (
              <button className="btn btnOutline" onClick={() => setShowDownloadConfirm(true)} style={{ fontSize: 12 }}>
                ↓ Export Report
              </button>
            )}
            <span className="navUser">{user?.full_name || user?.email}</span>
            <button className="navLogout" onClick={handleLogout}>Sign out</button>
          </div>
        </nav>

        <div className="layout">
          {/* ── SIDEBAR ── */}
          <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
            <div className="sidebarHeader">
              <span className="sidebarTitle">Data Sources</span>
            </div>

            {/* Connectors */}
            <div className="sidebarSection">
              <div className="sidebarSectionLabel">Connect</div>
              <button className="connectorBtn" onClick={() => { setShowConnector("jira"); setConnectorError(""); setConnectorTested(false); }}>
                <span className="connectorIcon">🔗</span> Jira
              </button>
              <button className="connectorBtn" onClick={() => { setShowConnector("zendesk"); setConnectorError(""); setConnectorTested(false); }}>
                <span className="connectorIcon">🎫</span> Zendesk
              </button>
            </div>

            {/* Upload — drag-and-drop zone */}
            <div className="sidebarSection">
              <div className="sidebarSectionLabel">Upload CSV</div>
              <label
                className={`dropZone ${dragging ? "dragOver" : ""} ${file ? "hasFile" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file" accept=".csv"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }}
                  style={{ display: "none" }}
                />
                <div className="dropZoneIcon">{file ? "📄" : "⬆"}</div>
                <span className="dropZoneText">{file ? file.name : "Drop CSV or click to browse"}</span>
                {!file && <span className="dropZoneSub">Supports .csv up to 50 MB</span>}
              </label>
              <button className="sidebarUploadBtn" onClick={handleUpload} disabled={loading || !file}>
                {loading
                  ? <span className="uploadingRow"><span className="spinnerDots"><span/><span/><span/></span>Analysing…</span>
                  : "Analyse"
                }
              </button>
              {error && <p className="sidebarError">{error}</p>}
            </div>

            {/* Run history with score bars */}
            <div className="sidebarSection" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div className="sidebarSectionLabel">History ({runs.length})</div>
              <div className="runList">
                {runs.length === 0 && <p className="sidebarEmpty">No analyses yet</p>}
                {runs.map((r) => (
                  <div
                    key={r.run_id}
                    className={`runItem ${result?.run_id === r.run_id ? "active" : ""}`}
                  >
                    <div className="runItemClickable" onClick={() => loadRun(r.run_id)}>
                      <div className="runItemTop">
                        <div className="runItemName">{r.filename}</div>
                        <span className={`runGrade grade${r.grade}`}>{r.grade}</span>
                      </div>
                      <div className="runScoreBarTrack">
                        <div
                          className="runScoreBarFill"
                          style={{
                            width: `${r.quality_score}%`,
                            background: r.quality_score >= 80 ? "#059669" : r.quality_score >= 60 ? "#4F46E5" : "#D97706",
                          }}
                        />
                      </div>
                      <div className="runItemMeta">
                        <span>{r.quality_score}/100</span>
                        <span>{r.rows?.toLocaleString()} rows</span>
                        <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      className="runDeleteBtn"
                      title="Delete this run"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ── MAIN CONTENT ── */}
          <main className="main">
            {!result && (
              <>
              <div
                className={`emptyState ${dragging ? "emptyDragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Aurora animated background */}
                <Aurora
                  colorStops={["#4F46E5", "#7C3AED", "#C4B5FD"]}
                  amplitude={1.2}
                  blend={0.6}
                  speed={0.8}
                />

                <div className="emptyContent">
                  {/* Hero heading */}
                  <div className="emptyHero">
                    <h2 className="emptyHeading">
                      <TextScramble text="Your support data has a" speed={18} delay={200} />
                      <br/><span className="emptyHeadingAccent">90-day action plan</span> inside it.
                    </h2>
                    <p className="emptySubheading">
                      Drop your{" "}
                      <TextLoop
                        items={["Zendesk CSV", "Freshdesk export", "Jira tickets", "helpdesk data", "support CSV"]}
                        interval={2200}
                        className="emptyLoopWord"
                      />{" "}
                      and get quality scores, bottleneck maps, automation ROI, and a live AI advisor — in under 30 seconds.
                    </p>
                  </div>

                  {/* Drop zone with Border Glow */}
                  <BorderGlow
                    backgroundColor="#ffffff"
                    colors={["#818cf8", "#a78bfa", "#c4b5fd"]}
                    glowColor="245 60 75"
                    borderRadius={16}
                    glowRadius={36}
                    glowIntensity={1.2}
                    edgeSensitivity={20}
                    animated
                    style={{ width: "100%", maxWidth: 460 }}
                  >
                    <label className={`emptyDropZone ${dragging ? "emptyDropActive" : ""} ${file ? "emptyDropHasFile" : ""}`}>
                      <input
                        type="file" accept=".csv" style={{ display: "none" }}
                        onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }}
                      />
                      <div className="emptyDropIconWrap">
                        {file ? (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : dragging ? (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L12 16M12 2L8 6M12 2L16 6"/>
                            <rect x="3" y="18" width="18" height="4" rx="2"/>
                          </svg>
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                        )}
                      </div>
                      <div className="emptyDropTitle">
                        {file ? file.name : dragging ? "Drop it!" : "Drag & drop your CSV"}
                      </div>
                      <div className="emptyDropSub">
                        {file ? `${(file.size / 1024).toFixed(1)} KB — ready to analyse` : "or click to browse files"}
                      </div>
                      {file && (
                        <button
                          className="emptyAnalyseBtn"
                          onClick={(e) => { e.preventDefault(); handleUpload(); }}
                          disabled={loading}
                        >
                          {loading
                            ? <><span className="emptyBtnSpinner" />Analysing…</>
                            : "Analyse now →"
                          }
                        </button>
                      )}
                    </label>
                  </BorderGlow>

                  {/* Connector row */}
                  <div className="emptyConnRow">
                    <span className="emptyConnLabel">or connect directly</span>
                    <button className="emptyConnCard" onClick={() => { setShowConnector("jira"); setConnectorError(""); setConnectorTested(false); }}>
                      <span className="emptyConnCardIcon">🔗</span>
                      <span className="emptyConnCardName">Jira</span>
                    </button>
                    <button className="emptyConnCard" onClick={() => { setShowConnector("zendesk"); setConnectorError(""); setConnectorTested(false); }}>
                      <span className="emptyConnCardIcon">🎫</span>
                      <span className="emptyConnCardName">Zendesk</span>
                    </button>
                  </div>

                  {/* Feature preview strip */}
                  <div className="emptyFeatures">
                    {[
                      { title: "Quality Score", desc: "A/B/C grade + detailed breakdown", id: "feat-quality" },
                      { title: "Bottleneck Detection", desc: "Slowest teams & ticket types", id: "feat-bottleneck" },
                      { title: "Automation ROI", desc: "Cost savings estimate in $", id: "feat-roi" },
                      { title: "AI Chat", desc: "Ask anything about your data", id: "feat-chat" },
                    ].map((f) => (
                      <div
                        key={f.title}
                        className="emptyFeatureCard"
                        onClick={() => document.getElementById(f.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      >
                        <div className="emptyFeatureCardTitle">{f.title}</div>
                        <div className="emptyFeatureCardDesc">{f.desc}</div>
                        <div className="emptyFeatureCardArrow">↓ Learn more</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── FEATURE DETAIL SECTIONS ── */}

              {/* Quality Score */}
              <div id="feat-quality" className="featSection reveal">
                <div className="featSectionInner">
                  <div className="featSectionContent">
                    <div className="featBadge" style={{ background: "#EEF2FF", color: "#4F46E5" }}>Quality Score</div>
                    <h3 className="featTitle">Know exactly how clean your data is</h3>
                    <ScrollReveal className="featDesc">Every upload is instantly graded A through F. Veracity checks for missing values, duplicate rows, schema mismatches, and inconsistent formats — so you always know what you're working with before it causes problems downstream.</ScrollReveal>
                    <ul className="featBenefits">
                      <li><span className="featCheck">✓</span> Detects missing fields and empty columns</li>
                      <li><span className="featCheck">✓</span> Flags duplicate rows and fuzzy matches</li>
                      <li><span className="featCheck">✓</span> Validates schema against expected ticket structure</li>
                      <li><span className="featCheck">✓</span> Alerts you if quality drops vs your last upload</li>
                    </ul>
                  </div>
                  <div className="featSectionVisual">
                    <svg width="220" height="220" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="110" cy="110" r="90" fill="#EEF2FF" />
                      <circle cx="110" cy="110" r="72" fill="none" stroke="#E0E7FF" strokeWidth="18"/>
                      <circle cx="110" cy="110" r="72" fill="none" stroke="#4F46E5" strokeWidth="18" strokeDasharray="360" strokeDashoffset="65" strokeLinecap="round" transform="rotate(-90 110 110)"/>
                      <text x="110" y="100" textAnchor="middle" fontSize="38" fontWeight="800" fill="#4F46E5">A</text>
                      <text x="110" y="126" textAnchor="middle" fontSize="13" fill="#718096">Quality Grade</text>
                      <circle cx="38" cy="60" r="22" fill="#DCFCE7"/>
                      <text x="38" y="66" textAnchor="middle" fontSize="11" fontWeight="700" fill="#059669">98%</text>
                      <text x="38" y="98" textAnchor="middle" fontSize="9" fill="#718096">Complete</text>
                      <circle cx="182" cy="60" r="22" fill="#FEF3C7"/>
                      <text x="182" y="66" textAnchor="middle" fontSize="11" fontWeight="700" fill="#D97706">2</text>
                      <text x="182" y="98" textAnchor="middle" fontSize="9" fill="#718096">Dupes</text>
                      <circle cx="38" cy="166" r="22" fill="#E0E7FF"/>
                      <text x="38" y="172" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4F46E5">✓</text>
                      <text x="38" y="202" textAnchor="middle" fontSize="9" fill="#718096">Schema OK</text>
                      <circle cx="182" cy="166" r="22" fill="#DCFCE7"/>
                      <text x="182" y="172" textAnchor="middle" fontSize="11" fontWeight="700" fill="#059669">85</text>
                      <text x="182" y="202" textAnchor="middle" fontSize="9" fill="#718096">Score</text>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Bottleneck Detection */}
              <div id="feat-bottleneck" className="featSection reveal reveal-delay-1">
                <div className="featSectionInner featSectionReverse">
                  <div className="featSectionContent">
                    <div className="featBadge" style={{ background: "#FFFBEB", color: "#D97706" }}>Bottleneck Detection</div>
                    <h3 className="featTitle">Find exactly where your process breaks down</h3>
                    <ScrollReveal className="featDesc">Veracity analyses resolution times, escalation patterns, and ticket volumes by team and category. Instead of guessing where your support process slows down, you get a ranked list of the exact bottlenecks costing you time and money.</ScrollReveal>
                    <ul className="featBenefits">
                      <li><span className="featCheck" style={{ color: "#D97706" }}>✓</span> Ranks slowest departments and ticket types</li>
                      <li><span className="featCheck" style={{ color: "#D97706" }}>✓</span> Identifies escalation and handoff delays</li>
                      <li><span className="featCheck" style={{ color: "#D97706" }}>✓</span> Surfaces high-volume, low-complexity tickets</li>
                      <li><span className="featCheck" style={{ color: "#D97706" }}>✓</span> Highlights SLA breaches and repeat contacts</li>
                    </ul>
                  </div>
                  <div className="featSectionVisual">
                    <div className="featBarChart">
                      {[
                        { label: "Billing", pct: 85, color: "#EF4444" },
                        { label: "Returns", pct: 70, color: "#F59E0B" },
                        { label: "Technical", pct: 55, color: "#F59E0B" },
                        { label: "Shipping", pct: 38, color: "#10B981" },
                        { label: "General", pct: 22, color: "#10B981" },
                      ].map((b) => (
                        <div key={b.label} className="featBar">
                          <span className="featBarLabel">{b.label}</span>
                          <div className="featBarTrack">
                            <div className="featBarFill" style={{ width: `${b.pct}%`, background: b.color }} />
                          </div>
                          <span className="featBarVal">{b.pct}h</span>
                        </div>
                      ))}
                      <div className="featBarSubtitle">Avg. resolution time by department</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Automation ROI */}
              <div id="feat-roi" className="featSection reveal reveal-delay-2">
                <div className="featSectionInner">
                  <div className="featSectionContent">
                    <div className="featBadge" style={{ background: "#F0FDF4", color: "#059669" }}>Automation ROI</div>
                    <h3 className="featTitle">Make the business case in seconds</h3>
                    <ScrollReveal className="featDesc">Veracity identifies your most repetitive ticket types and estimates exactly how much you'd save by automating them — in dollars, per year. Stop arguing about ROI and start with a number backed by your own data.</ScrollReveal>
                    <ul className="featBenefits">
                      <li><span className="featCheck" style={{ color: "#059669" }}>✓</span> Finds top automation candidates by volume</li>
                      <li><span className="featCheck" style={{ color: "#059669" }}>✓</span> Estimates annual cost savings in dollars</li>
                      <li><span className="featCheck" style={{ color: "#059669" }}>✓</span> Ranks opportunities by effort vs impact</li>
                      <li><span className="featCheck" style={{ color: "#059669" }}>✓</span> Generates a prioritised action list</li>
                    </ul>
                  </div>
                  <div className="featSectionVisual">
                    <div className="featRoiCard">
                      <div className="featRoiLabel">Estimated Annual Savings</div>
                      <div className="featRoiAmount">$48,200</div>
                      <div className="featRoiItems">
                        {[
                          { name: "Password resets", saving: "$12,400" },
                          { name: "Order status", saving: "$9,800" },
                          { name: "Refund requests", saving: "$8,600" },
                        ].map((r) => (
                          <div key={r.name} className="featRoiItem">
                            <span>{r.name}</span>
                            <span className="featRoiItemVal">{r.saving}</span>
                          </div>
                        ))}
                      </div>
                      <div className="featRoiFooter">Based on your ticket data</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Chat */}
              <div id="feat-chat" className="featSection reveal reveal-delay-3">
                <div className="featSectionInner featSectionReverse">
                  <div className="featSectionContent">
                    <div className="featBadge" style={{ background: "#EFF6FF", color: "#3B82F6" }}>AI Chat</div>
                    <h3 className="featTitle">Ask anything. Get answers instantly.</h3>
                    <ScrollReveal className="featDesc">A GPT-powered assistant that knows your data inside and out. Ask in plain English — it answers from your actual uploaded tickets. No SQL, no dashboards, no waiting for a data analyst.</ScrollReveal>
                    <ul className="featBenefits">
                      <li><span className="featCheck" style={{ color: "#3B82F6" }}>✓</span> Natural language questions, specific answers</li>
                      <li><span className="featCheck" style={{ color: "#3B82F6" }}>✓</span> Cites which run and file each answer came from</li>
                      <li><span className="featCheck" style={{ color: "#3B82F6" }}>✓</span> Can compute live stats directly from your CSV</li>
                      <li><span className="featCheck" style={{ color: "#3B82F6" }}>✓</span> Asks follow-up questions to refine results</li>
                    </ul>
                  </div>
                  <div className="featSectionVisual">
                    <div className="featChatMock">
                      <div className="featChatMsg featChatUser">What's our average ticket resolution time?</div>
                      <div className="featChatMsg featChatAi">Based on your last upload, the average resolution time is <strong>18.4 hours</strong>. The Billing team is the slowest at 42h, while Shipping resolves in under 6h.</div>
                      <div className="featChatMsg featChatUser">Which ticket type should we automate first?</div>
                      <div className="featChatMsg featChatAi">Password resets — 847 tickets last month, 95% resolved with the same 3-step response. Automating this alone saves ~<strong>$12,400/year</strong>.</div>
                      <div className="featChatTyping"><span/><span/><span/></div>
                    </div>
                  </div>
                </div>
              </div>

              </>
            )}

            {result && (
              <>
                {/* Source banner */}
                <div className="sourceBanner">
                  <span>📊 Analysing: <strong>{result.filename}</strong></span>
                  <span className="pill">{result.profile?.rows?.toLocaleString()} rows</span>
                </div>

                {/* ── QUALITY ALERT BANNER ── */}
                {qualityAlert && (
                  <div className="qualityAlertBanner">
                    <div className="alertIconWrap">⚠</div>
                    <div className="alertBody">
                      <div className="alertTitle">
                        Quality dropped {Math.abs(qualityAlert.delta)} pts vs <em>{qualityAlert.prev_filename}</em>
                        <span className="alertScores">{qualityAlert.prev_score} → {qualityAlert.new_score}</span>
                      </div>
                      <div className="alertReason">{qualityAlert.reason}</div>
                      <button className="alertAskBtn" onClick={() => sendChat(`Why did my data quality drop from ${qualityAlert.prev_score} to ${qualityAlert.new_score}? What should I fix?`)}>
                        Ask AI to explain ↗
                      </button>
                    </div>
                    <button className="alertClose" onClick={() => setQualityAlert(null)}>✕</button>
                  </div>
                )}

                {/* ── KPI GRID — improvement 1: trend badges + ring watermark ── */}
                <div className="kpiGrid">
                  <MetricCard
                    icon="✓" color="#4F46E5"
                    title="Quality Score"
                    countUp={{ to: qualityScore }}
                    value={`${qualityScore}`}
                    label={`Grade ${result.quality?.grade}`}
                    trend={scoreDelta !== null
                      ? { label: scoreDelta >= 0 ? `+${scoreDelta} pts` : `${scoreDelta} pts`, positive: scoreDelta >= 0 }
                      : null}
                  />
                  <MetricCard
                    icon="$" color="#059669"
                    title="Est. Savings"
                    countUp={{ to: Number(savings), prefix: "$", separator: true }}
                    value={`$${Number(savings).toLocaleString()}`}
                    label="Automation value"
                    trend={{ label: "annualised", positive: true }}
                  />
                  <MetricCard
                    icon="⊞" color="#0284C7"
                    title="Rows Analyzed"
                    countUp={{ to: rows, separator: true }}
                    value={rows.toLocaleString()}
                    label={`${result.profile?.columns} columns`}
                    trend={null}
                  />
                  <MetricCard
                    icon="!" color="#D97706"
                    title="Data Issues"
                    countUp={{ to: duplicates, suffix: " dupes" }}
                    value={`${duplicates} dupes`}
                    label={`${missingPercent}% missing`}
                    trend={duplicates > 0
                      ? { label: "needs fix", positive: false }
                      : { label: "clean", positive: true }}
                  />
                </div>

                {/* ── AI REPORT + QUALITY RING — improvement 2 ── */}
                <div className="gridTwo">
                  <div className="card">
                    <div className="sectionHeader">
                      <h2>AI Advisor Report</h2>
                      <span className="pill">{aiReport?.mode || "AI"}</span>
                    </div>
                    <p className="aiSummary">{aiReport?.executive_summary || "AI report not generated yet."}</p>
                    <h3>Leadership Message</h3>
                    <p className="muted">{aiReport?.leadership_message}</p>
                  </div>
                  <div className="card">
                    <div className="sectionHeader">
                      <h2>Data Readiness</h2>
                      <span className={`pill ${result.schema_validation?.is_valid_ticket_schema ? "success" : "warn"}`}>
                        {result.schema_validation?.is_valid_ticket_schema ? "Valid Schema" : "Needs Review"}
                      </span>
                    </div>
                    {/* improvement 2: donut ring replaces plain progress bar */}
                    <QualityScoreRing
                      score={qualityScore}
                      quality={result.quality}
                      profile={result.profile}
                    />
                  </div>
                </div>

                {/* DEPARTMENTS + CLUSTERS */}
                <div className="gridTwo">
                  <div className="card">
                    <h2>Slowest Departments</h2>
                    <div className="barList">
                      {Object.entries(slowestDepts).map(([dept, value]: any) => (
                        <div className="barRow" key={dept}>
                          <div className="barLabel"><span>{dept}</span><strong>{value} hrs</strong></div>
                          <div className="barTrack">
                            <div style={{ width: `${Math.min((Number(value) / 80) * 100, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    <h2>Top Ticket Clusters</h2>
                    <div className="clusterList">
                      {clusters.slice(0, 5).map((cluster: any) => (
                        <div className="cluster" key={cluster.cluster_id}>
                          <div>
                            <strong>Cluster {cluster.cluster_id}</strong>
                            <p>{cluster.top_terms?.slice(0, 4).join(", ")}</p>
                          </div>
                          <span className="clusterBadge">{cluster.ticket_count} tickets</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── OPPORTUNITIES TABLE — improvement 3: impact badges + Ask AI row action ── */}
                <div className="card">
                  <div className="sectionHeader">
                    <h2>Automation Opportunities</h2>
                    <span className="pill">{result.opportunities?.opportunities_found} found</span>
                  </div>
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr><th>Issue</th><th>Department</th><th>Tickets</th><th>Avg Time</th><th>Impact</th><th></th></tr>
                      </thead>
                      <tbody>
                        {topOpps.slice(0, 10).map((opp: any, i: number) => (
                          <tr key={i} className="oppRow">
                            <td style={{ fontWeight: 600, color: "#1A202C" }}>{opp.issue}</td>
                            <td>{opp.main_department}</td>
                            <td>{opp.ticket_count}</td>
                            <td>{opp.average_resolution_time} hrs</td>
                            <td><ImpactBadge level={opp.impact_level} /></td>
                            <td>
                              <button
                                className="askAiBtn"
                                onClick={() => sendChat(`Tell me more about this opportunity: ${opp.issue} in ${opp.main_department} (${opp.ticket_count} tickets, ${opp.impact_level} impact)`)}
                              >
                                Ask AI ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── ROADMAP — improvement 6: timeline style ── */}
                <div className="card">
                  <div className="sectionHeader">
                    <h2>AI Automation Roadmap</h2>
                    <span className="pill">90-day plan</span>
                  </div>
                  <div className="timeline">
                    <div className="timelineTrack" />
                    <TimelineCard
                      phase="30 Days" color="#4F46E5" borderColor="#C7D2FE"
                      text={aiReport?.suggested_30_60_90_day_plan?.day_30}
                    />
                    <TimelineCard
                      phase="60 Days" color="#4F46E5" borderColor="#DDD6FE"
                      text={aiReport?.suggested_30_60_90_day_plan?.day_60}
                    />
                    <TimelineCard
                      phase="90 Days" color="#059669" borderColor="#A7F3D0"
                      text={aiReport?.suggested_30_60_90_day_plan?.day_90}
                    />
                  </div>
                </div>
              </>
            )}
          </main>
        </div>

        {/* ── DELETE CONFIRMATION MODAL ── */}
        {deleteTarget && (
          <div className="deleteOverlay" onClick={() => setDeleteTarget(null)}>
            <div className="deleteModal" onClick={e => e.stopPropagation()}>
              <div className="deleteModalIcon">🗑️</div>
              <h3 className="deleteModalTitle">Delete this file?</h3>
              <p className="deleteModalFile">"{deleteTarget.filename}"</p>
              <p className="deleteModalSub">This will permanently remove the analysis and all its data.</p>
              <div className="deleteModalActions">
                <button className="deleteBtnNo" onClick={() => setDeleteTarget(null)}>No, keep it</button>
                <button className="deleteBtnYes" onClick={() => deleteRun(deleteTarget.run_id)}>Yes, delete</button>
              </div>
            </div>
          </div>
        )}

        {/* ── DOWNLOAD CONFIRMATION MODAL ── */}
        {showDownloadConfirm && (
          <div className="deleteOverlay" onClick={() => setShowDownloadConfirm(false)}>
            <div className="deleteModal" onClick={e => e.stopPropagation()}>
              <div className="deleteModalIcon">📄</div>
              <h3 className="deleteModalTitle">Download report?</h3>
              <p className="deleteModalFile">"{result?.filename}"</p>
              <p className="deleteModalSub">This will save a full analysis report to your device, including quality scores, bottlenecks, automation opportunities, and your 90-day roadmap.</p>
              <div className="deleteModalActions">
                <button className="deleteBtnNo" onClick={() => setShowDownloadConfirm(false)}>Cancel</button>
                <button className="deleteBtnYes" style={{ background: "#4F46E5" }} onClick={() => { setShowDownloadConfirm(false); exportPDF(); }}>
                  ↓ Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FLOATING CHAT BUTTON + GREETING BUBBLE ── */}
        {!chatOpen && (
          <div className="chatFabWrap">
            {showChatBubble && (
              <div className="chatGreetBubble" onClick={() => { setShowChatBubble(false); setChatOpen(true); }}>
                <span>👋 Hey! Got questions about your data?</span>
                <div className="chatGreetTail" />
              </div>
            )}
            <button className="chatFab" onClick={() => { setShowChatBubble(false); setChatOpen(true); }} aria-label="Open AI chat">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2C5.58 2 2 5.13 2 9c0 2.07 1 3.93 2.6 5.23L3.5 17l3.4-1.36C7.84 15.87 8.9 16 10 16c4.42 0 8-3.13 8-7s-3.58-7-8-7z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              {messages.length > 0 && (
                <span className="chatFabBadge">{messages.filter(m => m.role === "ai").length}</span>
              )}
            </button>
          </div>
        )}

        {/* ── CHAT PANEL ── */}
        {chatOpen && (
          <div className="chatOverlay" onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}>
            <div className="chatPanel">
              <div className="chatHeader">
                <div className="chatHeaderLeft">
                  <div className="chatHeaderIcon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1C4.13 1 1 3.69 1 7c0 1.77.85 3.36 2.22 4.47L2.5 14l2.9-1.16C6.2 13.27 7.08 13.4 8 13.4c3.87 0 7-2.69 7-6s-3.13-6-7-6z" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <div className="chatHeaderTitle">Veracity AI</div>
                    <div className="chatHeaderSub">Ask anything about your data</div>
                  </div>
                </div>
                <button className="chatClose" onClick={() => setChatOpen(false)}>✕</button>
              </div>
              <div className="chatMessages">
                {messages.length === 0 && (
                  <div className="chatWelcome">
                    <h3>Hello{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!</h3>
                    <p>{result
                      ? `I've indexed "${result.filename}". Ask me anything.`
                      : "Upload data or connect Jira/Zendesk first, then ask me questions."
                    }</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`chatMsg ${msg.role}`}>
                    {msg.text}
                    {msg.role === "ai" && msg.sources && msg.sources.length > 0 && (
                      <div className="sources">Sources: {msg.sources.join(" · ")}</div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="chatTyping">
                    <div className="dot"/><div className="dot"/><div className="dot"/>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {messages.length === 0 && (
                <div className="chatSuggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chatSuggestion" onClick={() => sendChat(s)}>{s}</button>
                  ))}
                </div>
              )}
              <div className="chatInputRow">
                <textarea
                  className="chatInput" placeholder="Ask about your data…"
                  value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(chatInput); } }}
                />
                <button
                  className="chatSend"
                  disabled={!chatInput.trim() || chatLoading}
                  onClick={() => sendChat(chatInput)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M14 8L2 14l2.5-6L2 2l12 6z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Improvement 1: KPI card with trend badge + ring watermark
function MetricCard({ icon, color, title, value, label, trend, countUp }: any) {
  return (
    <div className="metricCard" style={{ borderTop: `3px solid ${color}` }}>
      <div className="metricCardTop">
        <div className="metricIcon" style={{ background: `${color}18`, color }}>{icon}</div>
        {trend && (
          <span className="metricTrend" style={{
            background: trend.positive ? "#ECFDF5" : "#FFF5F5",
            color: trend.positive ? "#059669" : "#E53E3E",
          }}>
            {trend.label}
          </span>
        )}
      </div>
      <p className="metricTitle">{title}</p>
      <p className="metricValue">
        {countUp ? (
          <>
            {countUp.prefix || ""}
            <CountUp
              to={countUp.to}
              duration={1400}
              decimals={countUp.decimals || 0}
              onViewport={true}
            />
            {countUp.suffix || ""}
          </>
        ) : value}
      </p>
      <span className="metricLabel">{label}</span>
      {/* Subtle ring watermark in bottom-right */}
      <svg className="metricRing" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="24" fill="none" stroke={color} strokeWidth="8"/>
      </svg>
    </div>
  );
}

// Improvement 2: Donut ring with breakdown sub-metrics
function QualityScoreRing({ score, quality, profile }: any) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(score, 100) / 100) * circ;
  const ringColor = score >= 80 ? "#059669" : score >= 60 ? "#4F46E5" : "#D97706";

  const missingPct = quality?.missing_percentage ?? 0;
  const dupePct = profile?.rows ? ((profile.duplicate_rows ?? 0) / profile.rows) * 100 : 0;
  const issueCount = quality?.issues?.length ?? 0;

  const breakdown = [
    { label: "Completeness", color: "#4F46E5", pct: Math.max(0, 100 - missingPct) },
    { label: "No duplicates", color: "#059669", pct: Math.max(0, 100 - dupePct) },
    { label: "Schema health", color: issueCount === 0 ? "#059669" : "#D97706", pct: issueCount === 0 ? 100 : Math.max(20, 100 - issueCount * 15) },
  ];

  return (
    <div className="qualityRingWrap">
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="#EDF2F7" strokeWidth="10"/>
        <circle
          cx="55" cy="55" r={r} fill="none" stroke={ringColor} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="55" y="51" textAnchor="middle" fontSize="24" fontWeight="800" fill="#1A202C">{score}</text>
        <text x="55" y="66" textAnchor="middle" fontSize="11" fill="#A0AEC0">Grade {quality?.grade}</text>
      </svg>
      <div className="ringBreakdown">
        {breakdown.map((b) => (
          <div key={b.label} className="ringBreakdownRow">
            <div className="ringBreakdownLabel">
              <span className="ringBreakdownDot" style={{ background: b.color }} />
              <span>{b.label}</span>
            </div>
            <div className="ringBreakdownBar">
              <div style={{ width: `${Math.round(b.pct)}%`, background: b.color }} />
            </div>
            <span className="ringBreakdownPct">{Math.round(b.pct)}%</span>
          </div>
        ))}
        {(quality?.issues || []).slice(0, 2).map((issue: string, i: number) => (
          <div key={i} className="ringIssue">! {issue}</div>
        ))}
      </div>
    </div>
  );
}

// Improvement 3: Colour-coded impact badge
function ImpactBadge({ level }: { level: string }) {
  const styles: Record<string, { bg: string; color: string; icon: string }> = {
    High:   { bg: "#ECFDF5", color: "#059669", icon: "↑" },
    Medium: { bg: "#FFFBEB", color: "#B45309", icon: "→" },
    Low:    { bg: "#F1F5F9", color: "#64748B", icon: "↓" },
  };
  const s = styles[level] || styles.Low;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 20,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {s.icon} {level}
    </span>
  );
}

// Improvement 6: Timeline card for roadmap
function TimelineCard({ phase, color, borderColor, text }: any) {
  return (
    <div className="timelineItem">
      <div className="timelineDot" style={{ color, borderColor }}>
        <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{phase.split(" ")[0]}</span>
      </div>
      <div className="timelineBody">
        <div className="timelinePhase" style={{ color }}>{phase}</div>
        <p className="timelineText">{text || "Plan not available yet."}</p>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 5 }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const }}
        onFocus={e => e.target.style.borderColor = "#4F46E5"}
        onBlur={e => e.target.style.borderColor = "#E2E8F0"}
      />
    </div>
  );
}

// ── Onboarding steps ──────────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  { icon: "🔗", title: "Connect your tools", desc: "Pull tickets directly from Jira or Zendesk — no CSV export needed. Or upload any CSV file." },
  { icon: "🤖", title: "AI analyses your data", desc: "Veracity scores data quality, finds bottlenecks, quantifies automation savings, and builds a 90-day roadmap." },
  { icon: "💬", title: "Chat with your data", desc: "Ask questions like 'Which tickets should I automate first?' and get grounded answers from your actual data." },
  { icon: "📊", title: "Export & share", desc: "Download your analysis report and share insights with your team or leadership." },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: #F7FAFC; color: #1A202C; min-height: 100vh; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* NAV */
  .topNav { background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid #E2E8F0; padding: 0 20px; height: 58px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 0 #E2E8F0; flex-shrink: 0; }
  .navLeft { display: flex; align-items: center; gap: 12px; }
  .navBrand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15.5px; color: #0D0B1A; letter-spacing: -0.3px; }
  .navLogo { width: 28px; height: 28px; background: linear-gradient(135deg, #4F46E5, #7C3AED); border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .navBadge { background: #EEF2FF; color: #4F46E5; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }

  /* Scroll-reveal */
  .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1); }
  .reveal.visible { opacity: 1; transform: none; }
  .reveal-delay-1 { transition-delay: 0.1s; }
  .reveal-delay-2 { transition-delay: 0.2s; }
  .reveal-delay-3 { transition-delay: 0.3s; }
  .navRight { display: flex; align-items: center; gap: 10px; }
  .navUser { font-size: 13px; color: #4A5568; font-weight: 500; }
  .navLogout { background: none; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 5px 11px; font-size: 12px; color: #718096; cursor: pointer; }
  .navLogout:hover { border-color: #CBD5E0; }
  .sidebarToggle { background: none; border: none; font-size: 18px; cursor: pointer; color: #4A5568; padding: 4px 6px; border-radius: 6px; }
  .sidebarToggle:hover { background: #F7FAFC; }

  /* LAYOUT */
  .layout { display: flex; flex: 1; overflow: hidden; }

  /* SIDEBAR */
  .sidebar { width: 240px; background: #fff; border-right: 1px solid #E2E8F0; display: flex; flex-direction: column; overflow: hidden; transition: width 0.2s; flex-shrink: 0; }
  .sidebar.closed { width: 0; }
  .sidebarHeader { padding: 16px 16px 10px; border-bottom: 1px solid #E2E8F0; flex-shrink: 0; }
  .sidebarTitle { font-size: 12px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.6px; }
  .sidebarSection { padding: 12px 12px 8px; border-bottom: 1px solid #F7FAFC; flex-shrink: 0; }
  .sidebarSectionLabel { font-size: 11px; font-weight: 600; color: #A0AEC0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .connectorBtn { width: 100%; display: flex; align-items: center; gap: 8px; background: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #4A5568; cursor: pointer; margin-bottom: 6px; text-align: left; font-weight: 500; transition: background 0.15s; }
  .connectorBtn:hover { background: #EEF2FF; border-color: #C7D2FE; color: #4F46E5; }
  .connectorIcon { font-size: 14px; }

  /* DRAG-AND-DROP ZONE (improvement 4) */
  .dropZone { display: flex; flex-direction: column; align-items: center; gap: 5px; background: #F7FAFC; border: 1.5px dashed #C7D2FE; border-radius: 10px; padding: 14px 10px; font-size: 12px; color: #718096; cursor: pointer; margin-bottom: 8px; text-align: center; transition: background 0.15s, border-color 0.15s; }
  .dropZone:hover { background: #EEF2FF; border-color: #A5B4FC; }
  .dropZone.dragOver { background: #EEF2FF; border-color: #4F46E5; border-style: solid; }
  .dropZone.hasFile { border-color: #059669; border-style: solid; background: #F0FDF4; }
  .dropZoneIcon { font-size: 20px; line-height: 1; }
  .dropZoneText { font-size: 12px; font-weight: 500; color: #4A5568; word-break: break-all; }
  .dropZoneSub { font-size: 10.5px; color: #A0AEC0; }

  .sidebarUploadBtn { width: 100%; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; border-radius: 8px; padding: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .sidebarUploadBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  .uploadingRow { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spinnerDots { display: flex; gap: 3px; align-items: center; }
  .spinnerDots span { width: 5px; height: 5px; border-radius: 50%; background: #fff; animation: blink 1.2s infinite; }
  .spinnerDots span:nth-child(2) { animation-delay: 0.2s; }
  .spinnerDots span:nth-child(3) { animation-delay: 0.4s; }

  .sidebarError { font-size: 11px; color: #E53E3E; margin-top: 6px; }
  .sidebarEmpty { font-size: 12px; color: #A0AEC0; padding: 8px 0; }
  .runList { overflow-y: auto; flex: 1; padding: 4px 0; }

  /* RUN HISTORY with score bars (improvement 5) */
  .runItem { width: 100%; background: none; border: none; text-align: left; border-radius: 8px; margin-bottom: 2px; transition: background 0.15s; display: flex; align-items: stretch; position: relative; }
  .runItem:hover { background: #F7FAFC; }
  .runItem.active { background: #EEF2FF; }
  .runItemClickable { flex: 1; padding: 10px 12px; cursor: pointer; min-width: 0; }
  .runItemTop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; gap: 6px; }
  .runItemName { font-size: 12px; font-weight: 600; color: #1A202C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .runDeleteBtn { flex-shrink: 0; background: none; border: none; cursor: pointer; color: #C7D2FE; padding: 0 10px; border-radius: 0 8px 8px 0; transition: color 0.15s, background 0.15s; display: flex; align-items: center; opacity: 0; }
  .runItem:hover .runDeleteBtn { opacity: 1; }
  .runDeleteBtn:hover { color: #E53E3E; background: #FFF5F5; }
  .runScoreBarTrack { height: 4px; background: #EDF2F7; border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
  .runScoreBarFill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
  .runItemMeta { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #A0AEC0; }
  .runGrade { font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
  .gradeA { background: #ECFDF5; color: #059669; }
  .gradeB { background: #EEF2FF; color: #4F46E5; }
  .gradeC { background: #FFFBEB; color: #D97706; }
  .gradeD, .gradeF { background: #FFF5F5; color: #E53E3E; }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; padding: 28px; display: flex; flex-direction: column; gap: 20px; }

  /* SOURCE BANNER */
  .sourceBanner { display: flex; align-items: center; justify-content: space-between; background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: 10px 16px; font-size: 13px; color: #4A5568; }

  /* QUALITY ALERT BANNER */
  .qualityAlertBanner { display: flex; align-items: flex-start; gap: 14px; background: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 12px; padding: 14px 16px; animation: alertSlide 0.35s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes alertSlide { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .alertIconWrap { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
  .alertBody { flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .alertTitle { font-size: 13.5px; font-weight: 700; color: #92400E; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .alertTitle em { font-style: normal; font-weight: 600; }
  .alertScores { font-size: 12px; font-weight: 600; background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 20px; }
  .alertReason { font-size: 12.5px; color: #78350F; line-height: 1.5; }
  .alertAskBtn { align-self: flex-start; margin-top: 4px; background: #F59E0B; color: #fff; border: none; border-radius: 7px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .alertAskBtn:hover { opacity: 0.88; }
  .alertClose { background: none; border: none; cursor: pointer; color: #B45309; font-size: 16px; padding: 2px; flex-shrink: 0; border-radius: 5px; }
  .alertClose:hover { background: #FEF3C7; }

  /* DELETE CONFIRMATION MODAL */
  .deleteOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.15s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .deleteModal { background: #fff; border-radius: 16px; padding: 32px 28px 24px; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.18); animation: modalPop 0.2s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes modalPop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
  .deleteModalIcon { font-size: 36px; margin-bottom: 12px; }
  .deleteModalTitle { font-size: 18px; font-weight: 700; color: #1A202C; margin: 0 0 10px; }
  .deleteModalFile { font-size: 13px; font-weight: 600; color: #4F46E5; background: #EEF2FF; border-radius: 8px; padding: 7px 14px; margin: 0 0 10px; word-break: break-all; }
  .deleteModalSub { font-size: 13px; color: #718096; margin: 0 0 24px; }
  .deleteModalActions { display: flex; gap: 10px; }
  .deleteBtnNo { flex: 1; background: #fff; border: 1.5px solid #C7D2FE; color: #4A5568; font-size: 14px; font-weight: 600; padding: 11px; border-radius: 10px; cursor: pointer; transition: background 0.15s; }
  .deleteBtnNo:hover { background: #F7FAFC; }
  .deleteBtnYes { flex: 1; background: #E53E3E; border: none; color: #fff; font-size: 14px; font-weight: 600; padding: 11px; border-radius: 10px; cursor: pointer; transition: background 0.15s; }
  .deleteBtnYes:hover { background: #C53030; }

  /* EMPTY STATE */
  /* ── EMPTY STATE — rich redesign ── */
  .emptyState { position: relative; overflow: hidden; flex: 1; border-radius: 20px; background: #F7FAFC; border: 1.5px solid #EEF2FF; display: flex; align-items: center; justify-content: center; min-height: 500px; }
  .emptyState.emptyDragging { border-color: #4F46E5; border-style: dashed; background: linear-gradient(145deg, #EEF2FF, #F5F3FF); }

  /* Aurora canvas fills emptyState absolutely - no orbs needed */

  /* Content wrapper */
  .emptyContent { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 48px 32px; width: 100%; max-width: 680px; animation: emptyFadeUp 0.5s ease both; }
  @keyframes emptyFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

  /* Hero text */
  .emptyHero { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .emptyBadge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #EEF2FF, #F5F3FF); border: 1px solid #C7D2FE; color: #4F46E5; font-size: 11.5px; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.3px; }
  .emptyHeading { font-size: 28px; font-weight: 800; color: #0D0B1A; line-height: 1.22; margin: 0; letter-spacing: -0.6px; }
  .emptyHeadingAccent { background: linear-gradient(135deg, #4F46E5, #7C3AED); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .emptyLoopWord { color: #1a1560; font-weight: 700; font-style: italic; border-bottom: 2px solid #4F46E5; padding-bottom: 1px; }
  .emptySubheading { font-size: 14px; color: #3d3d5c; line-height: 1.65; margin: 0; max-width: 420px; }

  /* Drop zone */
  .emptyDropZone { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; background: #fff; border: 1.5px dashed #C7D2FE; border-radius: 16px; padding: 36px 28px; cursor: pointer; transition: all 0.2s ease; text-align: center; }
  .emptyDropZone:hover { border-color: #818cf8; background: #FAFBFF; }
  .emptyDropZone.emptyDropActive { border-color: #4F46E5; border-style: solid; background: #EEF2FF; transform: scale(1.01); }
  .emptyDropZone.emptyDropHasFile { border-color: #059669; border-style: solid; background: #F0FDF4; }
  .emptyDropIconWrap { width: 56px; height: 56px; border-radius: 14px; background: #EEF2FF; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
  .emptyDropZone.emptyDropHasFile .emptyDropIconWrap { background: #DCFCE7; }
  .emptyDropZone.emptyDropActive .emptyDropIconWrap { background: #E0E7FF; }
  .emptyDropTitle { font-size: 15px; font-weight: 700; color: #1A202C; }
  .emptyDropSub { font-size: 12.5px; color: #A0AEC0; }
  .emptyAnalyseBtn { margin-top: 6px; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; border-radius: 10px; padding: 11px 28px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.15s, transform 0.15s; display: flex; align-items: center; gap: 8px; }
  .emptyAnalyseBtn:hover { opacity: 0.9; transform: scale(1.02); }
  .emptyAnalyseBtn:disabled { opacity: 0.65; }
  .emptyBtnSpinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }

  /* Connector row */
  .emptyConnRow { display: flex; align-items: center; gap: 12px; }
  .emptyConnLabel { font-size: 12px; color: #A0AEC0; white-space: nowrap; }
  .emptyConnCard { display: flex; align-items: center; gap: 8px; background: #fff; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 10px 18px; cursor: pointer; font-size: 13px; font-weight: 600; color: #4A5568; transition: all 0.18s; }
  .emptyConnCard:hover { border-color: #4F46E5; color: #4F46E5; background: #F7F8FF; transform: translateY(-2px); box-shadow: 0 4px 14px rgba(75,63,158,0.1); }
  .emptyConnCardIcon { font-size: 16px; }
  .emptyConnCardName { font-size: 13px; }

  /* Feature preview */
  .emptyFeatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; width: 100%; }
  .emptyFeatureCard { background: #fff; border: 1.5px solid #EDF2F7; border-radius: 12px; padding: 16px 14px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.18s; cursor: pointer; }
  .emptyFeatureCard:hover { border-color: #C7D2FE; transform: translateY(-4px); box-shadow: 0 8px 24px rgba(75,63,158,0.1); }
  
  .emptyFeatureCardTitle { font-size: 13px; font-weight: 700; color: #1A202C; }
  .emptyFeatureCardDesc { font-size: 11px; color: #A0AEC0; line-height: 1.4; }
  .emptyFeatureCardArrow { font-size: 10.5px; color: #4F46E5; font-weight: 600; margin-top: 2px; opacity: 0; transition: opacity 0.15s; }
  .emptyFeatureCard:hover .emptyFeatureCardArrow { opacity: 1; }

  /* ── FEATURE DETAIL SECTIONS ── */
  .featSection { background: #fff; border-radius: 20px; border: 1px solid #EDF2F7; padding: 52px 56px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .featSectionInner { display: flex; align-items: center; gap: 60px; }
  .featSectionReverse { flex-direction: row-reverse; }
  .featSectionContent { flex: 1; min-width: 0; }
  .featSectionVisual { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .featBadge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; letter-spacing: 0.2px; }
  .featTitle { font-size: 24px; font-weight: 800; color: #0D0B1A; margin: 0 0 14px; line-height: 1.25; letter-spacing: -0.5px; }
  .featDesc { font-size: 14.5px; color: #64748b; line-height: 1.75; margin: 0 0 22px; display: block; }
  .featBenefits { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .featBenefits li { font-size: 13.5px; color: #4A5568; font-weight: 500; display: flex; align-items: flex-start; gap: 10px; line-height: 1.5; }
  .featCheck { color: #4F46E5; font-weight: 700; flex-shrink: 0; margin-top: 1px; }

  /* Bar chart visual */
  .featBarChart { display: flex; flex-direction: column; gap: 10px; width: 260px; background: #F7FAFC; border-radius: 14px; padding: 20px; }
  .featBar { display: flex; align-items: center; gap: 8px; }
  .featBarLabel { font-size: 11.5px; color: #4A5568; font-weight: 600; width: 60px; flex-shrink: 0; text-align: right; }
  .featBarTrack { flex: 1; height: 8px; background: #E2E8F0; border-radius: 4px; overflow: hidden; }
  .featBarFill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
  .featBarVal { font-size: 11px; color: #A0AEC0; width: 28px; }
  .featBarSubtitle { font-size: 10.5px; color: #A0AEC0; text-align: center; margin-top: 4px; }

  /* ROI card visual */
  .featRoiCard { background: #F0FDF4; border: 1.5px solid #BBF7D0; border-radius: 16px; padding: 24px; width: 260px; }
  .featRoiLabel { font-size: 11px; color: #059669; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .featRoiAmount { font-size: 38px; font-weight: 900; color: #065F46; margin-bottom: 18px; }
  .featRoiItems { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .featRoiItem { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #374151; background: #fff; border-radius: 8px; padding: 8px 10px; }
  .featRoiItemVal { font-weight: 700; color: #059669; }
  .featRoiFooter { font-size: 10.5px; color: #6EE7B7; text-align: center; }

  /* Chat mock visual */
  .featChatMock { display: flex; flex-direction: column; gap: 10px; width: 280px; background: #F7FAFC; border-radius: 14px; padding: 16px; }
  .featChatMsg { font-size: 12.5px; line-height: 1.5; padding: 10px 13px; border-radius: 12px; max-width: 90%; }
  .featChatUser { background: #4F46E5; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .featChatAi { background: #fff; color: #374151; border: 1px solid #E2E8F0; align-self: flex-start; border-bottom-left-radius: 4px; }
  .featChatTyping { display: flex; gap: 4px; padding: 8px 12px; background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; border-bottom-left-radius: 4px; align-self: flex-start; width: fit-content; }
  .featChatTyping span { width: 6px; height: 6px; background: #A0AEC0; border-radius: 50%; animation: typingDot 1.2s infinite; }
  .featChatTyping span:nth-child(2) { animation-delay: 0.2s; }
  .featChatTyping span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typingDot { 0%,80%,100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
  .stepNum { width: 20px; height: 20px; border-radius: 50%; background: #4F46E5; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

  /* KPI — improvement 1 */
  .kpiGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .metricCard { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04); border: none; display: flex; flex-direction: column; gap: 5px; position: relative; overflow: hidden; transition: box-shadow 0.2s, transform 0.2s; }
  .metricCard:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04); transform: translateY(-1px); }
  .metricCardTop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .metricIcon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
  .metricTrend { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 20px; }
  .metricTitle { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.7px; }
  .metricValue { font-size: 26px; font-weight: 800; color: #0D0B1A; letter-spacing: -0.8px; line-height: 1; }
  .metricLabel { font-size: 11px; color: #A0AEC0; }
  .metricRing { position: absolute; right: -10px; bottom: -10px; width: 60px; height: 60px; opacity: 0.07; }

  /* CARDS */
  .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.04); border: none; transition: box-shadow 0.2s; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04); }
  .gridTwo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .sectionHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .sectionHeader h2, .card > h2 { font-size: 14px; font-weight: 700; color: #0D0B1A; margin-bottom: 0; letter-spacing: -0.2px; }
  .card > h2 { margin-bottom: 16px; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; background: #EEF2FF; color: #4F46E5; }
  .pill.success { background: #ECFDF5; color: #059669; }
  .pill.warn { background: #FFFBEB; color: #D97706; }
  .aiSummary { font-size: 13.5px; color: #4A5568; line-height: 1.7; background: #F7FAFC; border-left: 3px solid #4F46E5; border-radius: 0 8px 8px 0; padding: 12px 14px; margin-bottom: 16px; }
  .card h3 { font-size: 12px; font-weight: 600; color: #718096; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
  .muted { font-size: 13.5px; color: #4A5568; line-height: 1.6; }

  /* QUALITY RING — improvement 2 */
  .qualityRingWrap { display: flex; align-items: flex-start; gap: 18px; }
  .ringBreakdown { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
  .ringBreakdownRow { display: flex; align-items: center; gap: 8px; }
  .ringBreakdownLabel { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #4A5568; min-width: 110px; }
  .ringBreakdownDot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ringBreakdownBar { flex: 1; height: 5px; background: #EDF2F7; border-radius: 3px; overflow: hidden; }
  .ringBreakdownBar > div { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
  .ringBreakdownPct { font-size: 11px; font-weight: 600; color: #4A5568; min-width: 32px; text-align: right; }
  .ringIssue { font-size: 11.5px; color: #E53E3E; background: #FFF5F5; border-radius: 6px; padding: 5px 9px; }

  .barList { display: flex; flex-direction: column; gap: 12px; }
  .barRow { display: flex; flex-direction: column; gap: 5px; }
  .barLabel { display: flex; justify-content: space-between; font-size: 12.5px; color: #4A5568; }
  .barLabel strong { color: #F7FAFC; }
  .barTrack { background: #EDF2F7; border-radius: 6px; height: 7px; overflow: hidden; }
  .barTrack > div { height: 100%; background: linear-gradient(90deg, #4F46E5, #7C3AED); border-radius: 6px; transition: width 0.8s; }
  .clusterList { display: flex; flex-direction: column; gap: 8px; }
  .cluster { display: flex; align-items: center; justify-content: space-between; background: #F7FAFC; border-radius: 9px; padding: 11px 13px; border: 1px solid #E2E8F0; gap: 10px; }
  .cluster strong { font-size: 12.5px; color: #1A202C; display: block; margin-bottom: 2px; }
  .cluster p { font-size: 11.5px; color: #A0AEC0; }
  .clusterBadge { background: #EEF2FF; color: #4F46E5; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }

  /* TABLE — improvement 3 */
  .tableWrap { overflow-x: auto; border-radius: 9px; border: 1px solid #E2E8F0; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #F7FAFC; }
  th { padding: 10px 13px; text-align: left; font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #E2E8F0; }
  td { padding: 10px 13px; font-size: 12.5px; color: #4A5568; border-bottom: 1px solid #F7FAFC; }
  tbody tr:last-child td { border-bottom: none; }
  .oppRow:hover td { background: #F7FAFC; }
  .oppRow .askAiBtn { opacity: 0; }
  .oppRow:hover .askAiBtn { opacity: 1; }
  .askAiBtn { background: #EEF2FF; color: #4F46E5; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity 0.15s, background 0.15s; }
  .askAiBtn:hover { background: #E0E7FF; }

  /* TIMELINE ROADMAP — improvement 6 */
  .timeline { display: flex; gap: 0; position: relative; padding-top: 0; }
  .timelineTrack { position: absolute; top: 20px; left: 22px; right: 22px; height: 2px; background: #E2E8F0; z-index: 0; }
  .timelineItem { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .timelineDot { width: 42px; height: 42px; border-radius: 50%; border: 2px solid; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
  .timelineBody { background: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; text-align: center; width: calc(100% - 16px); }
  .timelinePhase { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 7px; }
  .timelineText { font-size: 12.5px; color: #4A5568; line-height: 1.6; }

  /* BUTTONS */
  .btn { border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .btnPrimary { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; }
  .btnPrimary:hover:not(:disabled) { opacity: 0.9; }
  .btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btnOutline { background: #fff; color: #4F46E5; border: 1.5px solid #4F46E5; }
  .btnOutline:hover:not(:disabled) { background: #EEF2FF; }
  .btnOutline:disabled { opacity: 0.5; cursor: not-allowed; }
  .btnGhost { background: none; color: #718096; border: none; }
  .btnGhost:hover { color: #4A5568; }

  /* MODALS */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: #fff; border-radius: 16px; padding: 28px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
  .modalHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .modalTitle { font-size: 17px; font-weight: 700; color: #F7FAFC; }
  .formGrid { display: flex; flex-direction: column; gap: 13px; margin-bottom: 16px; }
  .modalHint { font-size: 12px; color: #718096; background: #F7FAFC; border-radius: 7px; padding: 9px 12px; }
  .modalFooter { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
  .connectorMsg { font-size: 13px; padding: 10px 13px; border-radius: 8px; margin-top: 4px; }
  .connectorMsg.success { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
  .connectorMsg.error { background: #FFF5F5; color: #E53E3E; border: 1px solid #FCA5A5; }

  /* ONBOARDING */
  .onboardingModal { max-width: 440px; }
  .onboardingSteps { display: flex; flex-direction: column; gap: 18px; margin-bottom: 28px; }
  .onboardingStep { display: flex; align-items: flex-start; gap: 14px; padding: 14px; border-radius: 10px; border: 1.5px solid #E2E8F0; transition: all 0.2s; }
  .onboardingStep.active { border-color: #4F46E5; background: #EEF2FF; }
  .onboardingStep.done { opacity: 0.5; }
  .onboardingIcon { font-size: 24px; flex-shrink: 0; }
  .onboardingTitle { font-size: 14px; font-weight: 700; color: #1A202C; margin-bottom: 3px; }
  .onboardingDesc { font-size: 13px; color: #718096; line-height: 1.5; }
  .onboardingNav { display: flex; gap: 10px; justify-content: flex-end; }

  /* FLOATING CHAT BUTTON + GREETING BUBBLE */
  .chatFabWrap { position: fixed; bottom: 28px; right: 28px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; z-index: 150; }
  .chatFab { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #4F46E5, #7C3AED); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 18px rgba(75,63,158,0.4); transition: transform 0.15s, box-shadow 0.15s; position: relative; }
  .chatFab:hover { transform: scale(1.06); box-shadow: 0 6px 22px rgba(75,63,158,0.5); }
  .chatFabBadge { position: absolute; top: -3px; right: -3px; width: 18px; height: 18px; background: #EF4444; border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 700; }
  .chatGreetBubble { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; border-bottom-right-radius: 4px; padding: 10px 14px; font-size: 13px; font-weight: 500; color: #1A202C; box-shadow: 0 4px 16px rgba(0,0,0,0.12); cursor: pointer; white-space: nowrap; position: relative; animation: bubblePop 0.3s cubic-bezier(0.34,1.56,0.64,1); }
  .chatGreetBubble:hover { background: #F7FAFC; }
  @keyframes bubblePop { from { opacity: 0; transform: scale(0.7) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

  /* CHAT PANEL */
  .chatOverlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200; display: flex; justify-content: flex-end; }
  .chatPanel { width: 400px; max-width: 100vw; height: 100vh; background: #fff; display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15); animation: slideIn 0.2s ease-out; }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .chatHeader { padding: 18px 18px 14px; border-bottom: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .chatHeaderLeft { display: flex; align-items: center; gap: 10px; }
  .chatHeaderIcon { width: 32px; height: 32px; background: linear-gradient(135deg, #4F46E5, #7C3AED); border-radius: 9px; display: flex; align-items: center; justify-content: center; }
  .chatHeaderTitle { font-size: 14px; font-weight: 700; color: #1A202C; }
  .chatHeaderSub { font-size: 11px; color: #A0AEC0; }
  .chatClose { background: none; border: none; cursor: pointer; color: #A0AEC0; font-size: 18px; padding: 4px; border-radius: 6px; }
  .chatClose:hover { background: #F7FAFC; color: #4A5568; }
  .chatMessages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .chatMsg { max-width: 90%; padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.55; }
  .chatMsg.user { align-self: flex-end; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border-bottom-right-radius: 4px; }
  .chatMsg.ai { align-self: flex-start; background: #F7FAFC; color: #1A202C; border: 1px solid #E2E8F0; border-bottom-left-radius: 4px; }
  .chatMsg.ai .sources { margin-top: 7px; padding-top: 7px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #A0AEC0; }
  .chatTyping { align-self: flex-start; background: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 14px; display: flex; gap: 4px; align-items: center; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #C7D2FE; animation: blink 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
  .chatSuggestions { padding: 0 14px 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chatSuggestion { background: #EEF2FF; color: #4F46E5; border: none; border-radius: 20px; padding: 5px 11px; font-size: 12px; font-weight: 500; cursor: pointer; }
  .chatSuggestion:hover { background: #E0E7FF; }
  .chatInputRow { padding: 10px 14px 14px; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; }
  .chatInput { flex: 1; border: 1.5px solid #E2E8F0; border-radius: 9px; padding: 9px 12px; font-size: 13px; color: #1A202C; outline: none; resize: none; font-family: inherit; line-height: 1.4; max-height: 100px; }
  .chatInput:focus { border-color: #4F46E5; }
  .chatSend { background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; border-radius: 9px; width: 38px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .chatSend:disabled { opacity: 0.5; cursor: not-allowed; }
  .chatWelcome { text-align: center; padding: 28px 14px; color: #A0AEC0; }
  .chatWelcome h3 { font-size: 14px; color: #4A5568; margin-bottom: 6px; font-weight: 600; }
  .chatWelcome p { font-size: 12.5px; line-height: 1.6; }

  @media (max-width: 900px) {
    .kpiGrid { grid-template-columns: repeat(2, 1fr); }
    .gridTwo { grid-template-columns: 1fr; }
    .timeline { flex-direction: column; }
    .timelineTrack { top: 22px; left: 20px; right: auto; width: 2px; height: calc(100% - 44px); }
    .sidebar { position: absolute; z-index: 50; height: calc(100vh - 58px); }
    .chatPanel { width: 100vw; }
    .chatFab { bottom: 20px; right: 20px; }
    .qualityRingWrap { flex-direction: column; align-items: center; }
  }
`;
