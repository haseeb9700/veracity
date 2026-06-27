"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "../lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "runs">("overview");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteMsg, setPromoteMsg] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.replace("/login"); return; }
    loadAll(user.access_token);
  }, [router]);

  async function loadAll(token: string) {
    setLoading(true);
    try {
      const [s, u, r] = await Promise.all([
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/admin/runs`,  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (s.status === 403) { router.replace("/"); return; }
      setStats(await s.json());
      setUsers(await u.json());
      setRuns(await r.json());
    } catch {}
    finally { setLoading(false); }
  }

  async function promoteUser() {
    const user = getStoredUser();
    if (!user || !promoteEmail) return;
    try {
      const res = await fetch(`${API}/admin/make-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.access_token}` },
        body: JSON.stringify({ email: promoteEmail }),
      });
      const data = await res.json();
      setPromoteMsg(data.message || data.detail || "Done");
      setPromoteEmail("");
      loadAll(user.access_token);
    } catch { setPromoteMsg("Failed"); }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", background: "#F0F4F8" }}>
      <p style={{ color: "#718096" }}>Loading admin dashboard…</p>
    </div>
  );

  const gradeColors: any = { A: "#059669", B: "#4F46E5", C: "#D97706", D: "#E53E3E", F: "#E53E3E" };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>

      {/* NAV */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#1A202C" }}>Veracity</span>
          <span style={{ background: "#FEF3C7", color: "#D97706", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Admin</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "1.5px solid #E2E8F0", borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#718096", cursor: "pointer" }}>← Back to App</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* HEADER */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A202C", letterSpacing: -0.4 }}>Platform Dashboard</h1>
          <p style={{ fontSize: 13, color: "#718096", marginTop: 4 }}>Overview of all users and activity across Veracity</p>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Users", value: stats?.total_users ?? 0, color: "#4F46E5", icon: "👥" },
            { label: "Total Analyses", value: stats?.total_runs ?? 0, color: "#059669", icon: "📊" },
            { label: "Avg Quality Score", value: `${stats?.avg_quality_score ?? 0}/100`, color: "#0284C7", icon: "✓" },
            { label: "Total Rows Analysed", value: (stats?.total_rows_analysed ?? 0).toLocaleString(), color: "#D97706", icon: "⊞" },
          ].map((k) => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1px solid #E2E8F0", borderTop: `3px solid ${k.color}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#718096", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#1A202C", letterSpacing: -0.5 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* GRADE DISTRIBUTION + RUNS CHART */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#2D3748", marginBottom: 16 }}>Grade Distribution</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(stats?.grade_distribution ?? {}).map(([grade, count]: any) => (
                <div key={grade}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4A5568", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: gradeColors[grade] || "#718096" }}>Grade {grade}</span>
                    <strong>{count} runs</strong>
                  </div>
                  <div style={{ background: "#EDF2F7", borderRadius: 6, height: 7, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: gradeColors[grade] || "#718096", borderRadius: 6, width: `${Math.min((count / (stats?.total_runs || 1)) * 100, 100)}%`, transition: "width 0.8s" }} />
                  </div>
                </div>
              ))}
              {Object.keys(stats?.grade_distribution ?? {}).length === 0 && <p style={{ fontSize: 13, color: "#A0AEC0" }}>No analyses yet</p>}
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 22px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#2D3748", marginBottom: 16 }}>Runs Last 7 Days</h2>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
              {Object.entries(stats?.runs_last_7_days ?? {}).map(([day, count]: any) => {
                const max = Math.max(...Object.values(stats?.runs_last_7_days ?? { _: 1 }) as number[], 1);
                return (
                  <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", background: "#4F46E5", borderRadius: "4px 4px 0 0", height: `${(count / max) * 70}px`, minHeight: 4, transition: "height 0.6s" }} />
                    <span style={{ fontSize: 10, color: "#A0AEC0" }}>{day.slice(5)}</span>
                  </div>
                );
              })}
              {Object.keys(stats?.runs_last_7_days ?? {}).length === 0 && <p style={{ fontSize: 13, color: "#A0AEC0" }}>No recent activity</p>}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", borderRadius: 10, padding: 4, border: "1px solid #E2E8F0", width: "fit-content" }}>
          {(["overview", "users", "runs"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: tab === t ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "none", color: tab === t ? "#fff" : "#718096", fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
              {t === "overview" ? "Promote Users" : t === "users" ? `Users (${users.length})` : `All Runs (${runs.length})`}
            </button>
          ))}
        </div>

        {/* PROMOTE USER */}
        {tab === "overview" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: "22px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#2D3748", marginBottom: 16 }}>Promote User to Admin</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="email"
                placeholder="user@email.com"
                value={promoteEmail}
                onChange={e => setPromoteEmail(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #E2E8F0", borderRadius: 9, padding: "9px 13px", fontSize: 13, outline: "none" }}
                onFocus={e => e.target.style.borderColor = "#4F46E5"}
                onBlur={e => e.target.style.borderColor = "#E2E8F0"}
              />
              <button onClick={promoteUser} style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Make Admin
              </button>
            </div>
            {promoteMsg && <p style={{ fontSize: 13, color: "#059669", marginTop: 10, background: "#ECFDF5", padding: "8px 12px", borderRadius: 7 }}>{promoteMsg}</p>}
          </div>
        )}

        {/* USERS TABLE */}
        {tab === "users" && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#F7FAFC" }}>
                <tr>
                  {["User", "Email", "Role", "Runs", "Last Active", "Joined"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #E2E8F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} style={{ borderBottom: "1px solid #F7FAFC" }} onMouseEnter={e => (e.currentTarget.style.background = "#F7FAFC")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(u.full_name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#2D3748" }}>{u.full_name || "—"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#4A5568" }}>{u.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: u.is_admin ? "#FEF3C7" : "#EEF2FF", color: u.is_admin ? "#D97706" : "#4F46E5" }}>
                        {u.is_admin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#4A5568", fontWeight: 600 }}>{u.run_count}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#A0AEC0" }}>{u.last_active ? new Date(u.last_active).toLocaleDateString() : "Never"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#A0AEC0" }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#A0AEC0", fontSize: 13 }}>No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* RUNS TABLE */}
        {tab === "runs" && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#F7FAFC" }}>
                <tr>
                  {["File", "User", "Rows", "Quality", "Grade", "Date"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #E2E8F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id} style={{ borderBottom: "1px solid #F7FAFC" }} onMouseEnter={e => (e.currentTarget.style.background = "#F7FAFC")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#2D3748", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.filename}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#4A5568" }}>{r.user_email}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#4A5568" }}>{r.rows?.toLocaleString()}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ background: "#EDF2F7", borderRadius: 6, height: 6, width: 80, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: "linear-gradient(90deg,#4F46E5,#7C3AED)", borderRadius: 6, width: `${r.quality_score}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#718096", marginTop: 2, display: "block" }}>{r.quality_score}/100</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: (gradeColors[r.grade] || "#718096") + "18", color: gradeColors[r.grade] || "#718096" }}>{r.grade}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#A0AEC0" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#A0AEC0", fontSize: 13 }}>No runs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
