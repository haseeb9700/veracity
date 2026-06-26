"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser, AuthUser } from "./lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ── Types ─────────────────────────────────────────────────────────────────────
type AnalysisResult = {
  run_id: number; filename: string; profile: any; quality: any;
  schema_validation: any; ticket_analysis: any; opportunities: any;
  bottlenecks: any; impact_analysis: any; ticket_clusters: any; ai_advisor_report: any;
};
type RunSummary = { run_id: number; filename: string; rows: number; quality_score: number; grade: string; created_at: string; };
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Show onboarding for first-time users
    if (!localStorage.getItem("veracity_onboarded")) {
      setTimeout(() => setShowOnboarding(true), 600);
    }
  }, [router]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);

  async function fetchRuns(token: string) {
    try {
      const res = await fetch(`${API}/runs`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRuns(await res.json());
    } catch {}
  }

  async function loadRun(run_id: number) {
    try {
      const res = await fetch(`${API}/runs/${run_id}`, { headers: { Authorization: `Bearer ${user?.access_token}` } });
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
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData, headers: { Authorization: `Bearer ${user?.access_token}` } });
      if (!res.ok) { if (res.status === 401) { handleLogout(); return; } throw new Error("Upload failed."); }
      const data = await res.json();
      setResult(data);
      setMessages([]);
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
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Fetch failed"); }
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
    setMessages((m) => [...m, { role: "user", text: text.trim() }]);
    setChatInput(""); setChatLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.access_token}` },
        body: JSON.stringify({ query: text.trim(), run_id: result?.run_id ?? null }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.answer, sources: data.sources }]);
    } catch { setMessages((m) => [...m, { role: "ai", text: "Sorry, something went wrong." }]); }
    finally { setChatLoading(false); }
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

  if (!authChecked) return null;

  const qualityScore = result?.quality?.quality_score ?? 0;
  const savings = result?.impact_analysis?.total_estimated_cost_savings ?? 0;
  const rows = result?.profile?.rows ?? 0;
  const duplicates = result?.profile?.duplicate_rows ?? 0;
  const missingPercent = result?.quality?.missing_percentage ?? 0;
  const slowestDepartments = result?.bottlenecks?.bottlenecks?.slowest_departments ?? {};
  const topOpportunities = result?.opportunities?.opportunities ?? [];
  const clusters = result?.ticket_clusters?.clusters ?? [];
  const aiReport = result?.ai_advisor_report;

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
                  <button className="btn btnPrimary" onClick={() => setOnboardingStep(s => s + 1)}>
                    Next →
                  </button>
                ) : (
                  <button className="btn btnPrimary" onClick={completeOnboarding}>
                    Get Started
                  </button>
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
                  <FormField label="Jira URL" placeholder="https://yourcompany.atlassian.net" value={jiraForm.jira_url} onChange={v => setJiraForm(f => ({ ...f, jira_url: v }))} />
                  <FormField label="Email" placeholder="you@company.com" value={jiraForm.email} onChange={v => setJiraForm(f => ({ ...f, email: v }))} />
                  <FormField label="API Token" placeholder="Your Jira API token" value={jiraForm.api_token} onChange={v => setJiraForm(f => ({ ...f, api_token: v }))} type="password" />
                  <FormField label="Project Key (optional)" placeholder="e.g. IT, SUPPORT" value={jiraForm.project_key} onChange={v => setJiraForm(f => ({ ...f, project_key: v }))} />
                  <p className="modalHint">Get your API token at: <strong>id.atlassian.com → Security → API tokens</strong></p>
                </div>
              ) : (
                <div className="formGrid">
                  <FormField label="Subdomain" placeholder="yourcompany (from yourcompany.zendesk.com)" value={zendeskForm.subdomain} onChange={v => setZendeskForm(f => ({ ...f, subdomain: v }))} />
                  <FormField label="Email" placeholder="you@company.com" value={zendeskForm.email} onChange={v => setZendeskForm(f => ({ ...f, email: v }))} />
                  <FormField label="API Token" placeholder="Your Zendesk API token" value={zendeskForm.api_token} onChange={v => setZendeskForm(f => ({ ...f, api_token: v }))} type="password" />
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
              <span className="navBadge">AI Process Intelligence</span>
            </div>
          </div>
          <div className="navRight">
            <button className="chatToggle" onClick={() => setChatOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2h10a1 1 0 011 1v6a1 1 0 01-1 1H4L1 13V3a1 1 0 011-1z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Ask AI
            </button>
            {result && (
              <button className="btn btnOutline" onClick={exportPDF} style={{ fontSize: 12 }}>
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

            {/* Upload */}
            <div className="sidebarSection">
              <div className="sidebarSectionLabel">Upload CSV</div>
              <label className="sidebarFileBox">
                <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
                <span>{file ? file.name : "Choose file…"}</span>
              </label>
              <button className="sidebarUploadBtn" onClick={handleUpload} disabled={loading || !file}>
                {loading ? "Analyzing…" : "Analyze"}
              </button>
              {error && <p className="sidebarError">{error}</p>}
            </div>

            {/* Run history */}
            <div className="sidebarSection" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div className="sidebarSectionLabel">History ({runs.length})</div>
              <div className="runList">
                {runs.length === 0 && <p className="sidebarEmpty">No analyses yet</p>}
                {runs.map((r) => (
                  <button
                    key={r.run_id}
                    className={`runItem ${result?.run_id === r.run_id ? "active" : ""}`}
                    onClick={() => loadRun(r.run_id)}
                  >
                    <div className="runItemName">{r.filename}</div>
                    <div className="runItemMeta">
                      <span className={`runGrade grade${r.grade}`}>{r.grade}</span>
                      <span>{r.rows?.toLocaleString()} rows</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* ── MAIN CONTENT ── */}
          <main className="main">
            {!result && (
              <div className="emptyState">
                <div className="emptyIcon">
                  <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect x="4" y="4" width="22" height="22" rx="4" stroke="#4F46E5" strokeWidth="1.8"/>
                    <path d="M9 15h12M9 10h7M9 20h5" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2>No data loaded yet</h2>
                <p>Connect Jira or Zendesk directly, or upload a CSV export. Veracity will analyse quality, bottlenecks, automation savings, and generate a 90-day plan.</p>
                <div className="emptySteps">
                  <div className="emptyStep"><span className="stepNum">1</span>Connect a source or upload CSV</div>
                  <div className="emptyStep"><span className="stepNum">2</span>Click Analyze</div>
                  <div className="emptyStep"><span className="stepNum">3</span>Chat with your data</div>
                </div>
              </div>
            )}

            {result && (
              <>
                {/* Source banner */}
                <div className="sourceBanner">
                  <span>📊 Analysing: <strong>{result.filename}</strong></span>
                  <span className="pill">{result.profile?.rows?.toLocaleString()} rows</span>
                </div>

                {/* KPI GRID */}
                <div className="kpiGrid">
                  <MetricCard icon="✓" color="#4F46E5" title="Quality Score" value={`${qualityScore}`} label={`Grade ${result.quality?.grade}`} />
                  <MetricCard icon="$" color="#059669" title="Est. Savings" value={`$${Number(savings).toLocaleString()}`} label="Automation value" />
                  <MetricCard icon="⊞" color="#0284C7" title="Rows Analyzed" value={rows.toLocaleString()} label={`${result.profile?.columns} columns`} />
                  <MetricCard icon="!" color="#D97706" title="Data Issues" value={`${duplicates} dupes`} label={`${missingPercent}% missing`} />
                </div>

                {/* AI REPORT + READINESS */}
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
                    <div className="readinessBar"><div style={{ width: `${qualityScore}%` }} /></div>
                    <ul className="cleanList">
                      {result.quality?.issues?.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
                    </ul>
                  </div>
                </div>

                {/* DEPARTMENTS + CLUSTERS */}
                <div className="gridTwo">
                  <div className="card">
                    <h2>Slowest Departments</h2>
                    <div className="barList">
                      {Object.entries(slowestDepartments).map(([dept, value]: any) => (
                        <div className="barRow" key={dept}>
                          <div className="barLabel"><span>{dept}</span><strong>{value} hrs</strong></div>
                          <div className="barTrack"><div style={{ width: `${Math.min((Number(value) / 80) * 100, 100)}%` }} /></div>
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

                {/* OPPORTUNITIES TABLE */}
                <div className="card">
                  <div className="sectionHeader">
                    <h2>Automation Opportunities</h2>
                    <span className="pill">{result.opportunities?.opportunities_found} found</span>
                  </div>
                  <div className="tableWrap">
                    <table>
                      <thead><tr><th>Issue</th><th>Department</th><th>Tickets</th><th>Avg Time</th><th>Impact</th></tr></thead>
                      <tbody>
                        {topOpportunities.slice(0, 10).map((opp: any, i: number) => (
                          <tr key={i}>
                            <td>{opp.issue}</td><td>{opp.main_department}</td><td>{opp.ticket_count}</td>
                            <td>{opp.average_resolution_time} hrs</td>
                            <td style={{ color: opp.impact_level === "High" ? "#059669" : opp.impact_level === "Medium" ? "#D97706" : "#718096", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const }}>{opp.impact_level}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ROADMAP */}
                <div className="card">
                  <div className="sectionHeader"><h2>AI Automation Roadmap</h2><span className="pill">90-day plan</span></div>
                  <div className="roadmap">
                    <RoadmapCard title="30 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_30} color="#4F46E5" />
                    <RoadmapCard title="60 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_60} color="#7C3AED" />
                    <RoadmapCard title="90 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_90} color="#059669" />
                  </div>
                </div>
              </>
            )}
          </main>
        </div>

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
                    <p>{result ? `I've indexed "${result.filename}". Ask me anything.` : "Upload data or connect Jira/Zendesk first, then ask me questions."}</p>
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
                {chatLoading && <div className="chatTyping"><div className="dot"/><div className="dot"/><div className="dot"/></div>}
                <div ref={messagesEndRef} />
              </div>
              {messages.length === 0 && (
                <div className="chatSuggestions">
                  {SUGGESTIONS.map((s) => <button key={s} className="chatSuggestion" onClick={() => sendChat(s)}>{s}</button>)}
                </div>
              )}
              <div className="chatInputRow">
                <textarea className="chatInput" placeholder="Ask about your data…" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(chatInput); } }}
                />
                <button className="chatSend" disabled={!chatInput.trim() || chatLoading} onClick={() => sendChat(chatInput)}>
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
function MetricCard({ icon, color, title, value, label }: any) {
  return (
    <div className="metricCard" style={{ borderTop: `3px solid ${color}` }}>
      <div className="metricIcon" style={{ background: `${color}18`, color }}>{icon}</div>
      <p className="metricTitle">{title}</p>
      <p className="metricValue">{value}</p>
      <span className="metricLabel">{label}</span>
    </div>
  );
}

function RoadmapCard({ title, text, color }: any) {
  return (
    <div className="roadmapCard" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ color }}>{title}</h3>
      <p>{text || "Not available yet."}</p>
    </div>
  );
}

function FormField({ label, placeholder, value, onChange, type = "text" }: any) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; background: #F0F4F8; color: #1A202C; min-height: 100vh; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* NAV */
  .topNav { background: #fff; border-bottom: 1px solid #E2E8F0; padding: 0 20px; height: 58px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.06); flex-shrink: 0; }
  .navLeft { display: flex; align-items: center; gap: 12px; }
  .navBrand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; color: #1A202C; }
  .navLogo { width: 30px; height: 30px; background: linear-gradient(135deg, #4F46E5, #7C3AED); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .navBadge { background: #EEF2FF; color: #4F46E5; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }
  .navRight { display: flex; align-items: center; gap: 10px; }
  .navUser { font-size: 13px; color: #4A5568; font-weight: 500; }
  .navLogout { background: none; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 5px 11px; font-size: 12px; color: #718096; cursor: pointer; }
  .navLogout:hover { border-color: #CBD5E0; }
  .sidebarToggle { background: none; border: none; font-size: 18px; cursor: pointer; color: #4A5568; padding: 4px 6px; border-radius: 6px; }
  .sidebarToggle:hover { background: #F7FAFC; }
  .chatToggle { display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; border-radius: 8px; padding: 7px 13px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .chatToggle:hover { opacity: 0.9; }

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
  .sidebarFileBox { display: flex; align-items: center; background: #F7FAFC; border: 1.5px dashed #CBD5E0; border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #718096; cursor: pointer; margin-bottom: 8px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sidebarUploadBtn { width: 100%; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; border: none; border-radius: 8px; padding: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .sidebarUploadBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sidebarError { font-size: 11px; color: #E53E3E; margin-top: 6px; }
  .sidebarEmpty { font-size: 12px; color: #A0AEC0; padding: 8px 0; }
  .runList { overflow-y: auto; flex: 1; padding: 4px 0; }
  .runItem { width: 100%; background: none; border: none; text-align: left; padding: 10px 12px; cursor: pointer; border-radius: 8px; margin-bottom: 2px; transition: background 0.15s; }
  .runItem:hover { background: #F7FAFC; }
  .runItem.active { background: #EEF2FF; }
  .runItemName { font-size: 12px; font-weight: 600; color: #2D3748; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  .runItemMeta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #A0AEC0; }
  .runGrade { font-weight: 700; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
  .gradeA { background: #ECFDF5; color: #059669; }
  .gradeB { background: #EEF2FF; color: #4F46E5; }
  .gradeC { background: #FFFBEB; color: #D97706; }
  .gradeD, .gradeF { background: #FFF5F5; color: #E53E3E; }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; padding: 28px 28px; display: flex; flex-direction: column; gap: 20px; }

  /* SOURCE BANNER */
  .sourceBanner { display: flex; align-items: center; justify-content: space-between; background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: 10px 16px; font-size: 13px; color: #4A5568; }

  /* EMPTY STATE */
  .emptyState { background: #fff; border-radius: 16px; border: 1.5px dashed #CBD5E0; padding: 60px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .emptyIcon { width: 60px; height: 60px; background: #EEF2FF; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
  .emptyState h2 { font-size: 20px; font-weight: 700; color: #2D3748; }
  .emptyState p { font-size: 14px; color: #718096; max-width: 420px; line-height: 1.6; }
  .emptySteps { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .emptyStep { display: flex; align-items: center; gap: 8px; background: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 14px; font-size: 12px; color: #4A5568; font-weight: 500; }
  .stepNum { width: 20px; height: 20px; border-radius: 50%; background: #4F46E5; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

  /* KPI */
  .kpiGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .metricCard { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border: 1px solid #E2E8F0; display: flex; flex-direction: column; gap: 5px; }
  .metricIcon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .metricTitle { font-size: 11px; font-weight: 600; color: #718096; text-transform: uppercase; letter-spacing: 0.6px; }
  .metricValue { font-size: 24px; font-weight: 800; color: #1A202C; letter-spacing: -0.5px; line-height: 1; }
  .metricLabel { font-size: 11px; color: #A0AEC0; }

  /* CARDS */
  .card { background: #fff; border-radius: 14px; padding: 22px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border: 1px solid #E2E8F0; }
  .gridTwo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .sectionHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .sectionHeader h2, .card > h2 { font-size: 15px; font-weight: 700; color: #2D3748; margin-bottom: 0; }
  .card > h2 { margin-bottom: 16px; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; background: #EEF2FF; color: #4F46E5; }
  .pill.success { background: #ECFDF5; color: #059669; }
  .pill.warn { background: #FFFBEB; color: #D97706; }
  .aiSummary { font-size: 13.5px; color: #4A5568; line-height: 1.7; background: #F7FAFC; border-left: 3px solid #4F46E5; border-radius: 0 8px 8px 0; padding: 12px 14px; margin-bottom: 16px; }
  .card h3 { font-size: 12px; font-weight: 600; color: #718096; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
  .muted { font-size: 13.5px; color: #4A5568; line-height: 1.6; }
  .readinessBar { background: #EDF2F7; border-radius: 8px; height: 10px; margin-bottom: 18px; overflow: hidden; }
  .readinessBar > div { height: 100%; background: linear-gradient(90deg, #4F46E5, #7C3AED); border-radius: 8px; transition: width 0.8s; }
  .cleanList { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .cleanList li { font-size: 12.5px; color: #E53E3E; background: #FFF5F5; border-radius: 7px; padding: 7px 11px; display: flex; align-items: center; gap: 8px; }
  .cleanList li::before { content: '!'; width: 16px; height: 16px; border-radius: 50%; background: #FC8181; color: #fff; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .barList { display: flex; flex-direction: column; gap: 12px; }
  .barRow { display: flex; flex-direction: column; gap: 5px; }
  .barLabel { display: flex; justify-content: space-between; font-size: 12.5px; color: #4A5568; }
  .barLabel strong { color: #2D3748; }
  .barTrack { background: #EDF2F7; border-radius: 6px; height: 7px; overflow: hidden; }
  .barTrack > div { height: 100%; background: linear-gradient(90deg, #4F46E5, #7C3AED); border-radius: 6px; transition: width 0.8s; }
  .clusterList { display: flex; flex-direction: column; gap: 8px; }
  .cluster { display: flex; align-items: center; justify-content: space-between; background: #F7FAFC; border-radius: 9px; padding: 11px 13px; border: 1px solid #E2E8F0; gap: 10px; }
  .cluster strong { font-size: 12.5px; color: #2D3748; display: block; margin-bottom: 2px; }
  .cluster p { font-size: 11.5px; color: #A0AEC0; }
  .clusterBadge { background: #EEF2FF; color: #4F46E5; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }
  .tableWrap { overflow-x: auto; border-radius: 9px; border: 1px solid #E2E8F0; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #F7FAFC; }
  th { padding: 10px 13px; text-align: left; font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #E2E8F0; }
  td { padding: 10px 13px; font-size: 12.5px; color: #4A5568; border-bottom: 1px solid #F7FAFC; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: #F7FAFC; }
  .roadmap { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .roadmapCard { border-radius: 11px; padding: 18px; border: 1px solid #E2E8F0; background: #F7FAFC; }
  .roadmapCard h3 { font-size: 12px; font-weight: 700; margin-bottom: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
  .roadmapCard p { font-size: 12.5px; color: #4A5568; line-height: 1.6; }

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
  .modalTitle { font-size: 17px; font-weight: 700; color: #1A202C; }
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

  /* CHAT */
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
  .chatMsg.ai { align-self: flex-start; background: #F7FAFC; color: #2D3748; border: 1px solid #E2E8F0; border-bottom-left-radius: 4px; }
  .chatMsg.ai .sources { margin-top: 7px; padding-top: 7px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #A0AEC0; }
  .chatTyping { align-self: flex-start; background: #F7FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 14px; display: flex; gap: 4px; align-items: center; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #CBD5E0; animation: blink 1.2s infinite; }
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
    .roadmap { grid-template-columns: 1fr; }
    .sidebar { position: absolute; z-index: 50; height: calc(100vh - 58px); }
    .chatPanel { width: 100vw; }
  }
`;
