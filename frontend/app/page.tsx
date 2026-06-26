"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser, AuthUser } from "./lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #F0F4F8;
    color: #1A202C;
    min-height: 100vh;
  }

  .app { min-height: 100vh; }

  /* ── TOP NAV ── */
  .topNav {
    background: #fff;
    border-bottom: 1px solid #E2E8F0;
    padding: 0 32px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .navBrand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 17px;
    color: #1A202C;
    letter-spacing: -0.3px;
  }
  .navLogo {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .navBadge {
    background: #EEF2FF;
    color: #4F46E5;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    letter-spacing: 0.3px;
  }
  .navRight {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .navUser {
    font-size: 13px;
    color: #4A5568;
    font-weight: 500;
  }
  .navLogout {
    background: none;
    border: 1.5px solid #E2E8F0;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    color: #718096;
    cursor: pointer;
    font-weight: 500;
    transition: border-color 0.15s, color 0.15s;
  }
  .navLogout:hover { border-color: #CBD5E0; color: #4A5568; }
  .chatToggle {
    display: flex;
    align-items: center;
    gap: 7px;
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: #fff;
    border: none;
    border-radius: 9px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .chatToggle:hover { opacity: 0.9; }

  /* ── HERO UPLOAD SECTION ── */
  .hero {
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    padding: 48px 32px;
    color: #fff;
  }
  .heroInner {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 32px;
    align-items: center;
  }
  .heroEyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.7);
    margin-bottom: 10px;
  }
  .heroTitle {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.5px;
    line-height: 1.15;
    margin-bottom: 10px;
  }
  .heroSub {
    font-size: 15px;
    color: rgba(255,255,255,0.75);
    line-height: 1.6;
    max-width: 520px;
  }

  /* ── UPLOAD PANEL ── */
  .uploadPanel {
    background: rgba(255,255,255,0.12);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 16px;
    padding: 24px;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .uploadPanelTitle {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.85);
    letter-spacing: 0.3px;
  }
  .fileBox {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255,255,255,0.1);
    border: 1.5px dashed rgba(255,255,255,0.35);
    border-radius: 10px;
    padding: 12px 14px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .fileBox:hover { background: rgba(255,255,255,0.18); }
  .fileBox input { display: none; }
  .fileBoxText {
    font-size: 13px;
    color: rgba(255,255,255,0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .uploadBtn {
    background: #fff;
    color: #4F46E5;
    border: none;
    border-radius: 10px;
    padding: 12px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
    letter-spacing: 0.2px;
  }
  .uploadBtn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
  .uploadBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  .errorMsg {
    font-size: 12px;
    color: #FCA5A5;
    background: rgba(239,68,68,0.15);
    border-radius: 6px;
    padding: 8px 10px;
  }

  /* ── MAIN BODY ── */
  .body {
    max-width: 1200px;
    margin: 0 auto;
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  /* ── EMPTY STATE ── */
  .emptyState {
    background: #fff;
    border-radius: 16px;
    border: 1.5px dashed #CBD5E0;
    padding: 64px 32px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .emptyIcon {
    width: 64px;
    height: 64px;
    background: #EEF2FF;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .emptyState h2 {
    font-size: 20px;
    font-weight: 700;
    color: #2D3748;
    letter-spacing: -0.3px;
  }
  .emptyState p {
    font-size: 14px;
    color: #718096;
    max-width: 420px;
    line-height: 1.6;
  }
  .emptySteps {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .emptyStep {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #F7FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    color: #4A5568;
    font-weight: 500;
  }
  .stepNum {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #4F46E5;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── KPI GRID ── */
  .kpiGrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .metricCard {
    background: #fff;
    border-radius: 14px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.07);
    border: 1px solid #E2E8F0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
    overflow: hidden;
  }
  .metricCard::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
  }
  .metricCard:nth-child(1)::before { background: linear-gradient(90deg, #4F46E5, #7C3AED); }
  .metricCard:nth-child(2)::before { background: linear-gradient(90deg, #059669, #10B981); }
  .metricCard:nth-child(3)::before { background: linear-gradient(90deg, #0284C7, #38BDF8); }
  .metricCard:nth-child(4)::before { background: linear-gradient(90deg, #D97706, #F59E0B); }

  .metricIcon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }
  .metricCard:nth-child(1) .metricIcon { background: #EEF2FF; }
  .metricCard:nth-child(2) .metricIcon { background: #ECFDF5; }
  .metricCard:nth-child(3) .metricIcon { background: #E0F2FE; }
  .metricCard:nth-child(4) .metricIcon { background: #FFFBEB; }

  .metricTitle {
    font-size: 12px;
    font-weight: 600;
    color: #718096;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .metricValue {
    font-size: 26px;
    font-weight: 800;
    color: #1A202C;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .metricLabel {
    font-size: 12px;
    color: #A0AEC0;
    font-weight: 500;
  }

  /* ── CARDS ── */
  .card {
    background: #fff;
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.07);
    border: 1px solid #E2E8F0;
  }
  .gridTwo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  /* ── SECTION HEADER ── */
  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .sectionHeader h2, .card > h2 {
    font-size: 16px;
    font-weight: 700;
    color: #2D3748;
    letter-spacing: -0.2px;
    margin-bottom: 0;
  }
  .card > h2 { margin-bottom: 18px; }

  .pill {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 20px;
    background: #EEF2FF;
    color: #4F46E5;
    letter-spacing: 0.3px;
  }
  .pill.success { background: #ECFDF5; color: #059669; }
  .pill.warn { background: #FFFBEB; color: #D97706; }

  /* ── AI REPORT ── */
  .aiSummary {
    font-size: 14px;
    color: #4A5568;
    line-height: 1.7;
    background: #F7FAFC;
    border-left: 3px solid #4F46E5;
    border-radius: 0 8px 8px 0;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  .card h3 {
    font-size: 13px;
    font-weight: 600;
    color: #718096;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 8px;
  }
  .muted {
    font-size: 14px;
    color: #4A5568;
    line-height: 1.6;
  }

  /* ── READINESS BAR ── */
  .readinessBar {
    background: #EDF2F7;
    border-radius: 8px;
    height: 10px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .readinessBar > div {
    height: 100%;
    background: linear-gradient(90deg, #4F46E5, #7C3AED);
    border-radius: 8px;
    transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  }
  .cleanList {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cleanList li {
    font-size: 13px;
    color: #E53E3E;
    background: #FFF5F5;
    border-radius: 7px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cleanList li::before {
    content: '!';
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #FC8181;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── BAR LIST (departments) ── */
  .barList { display: flex; flex-direction: column; gap: 14px; }
  .barRow { display: flex; flex-direction: column; gap: 6px; }
  .barLabel {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #4A5568;
    font-weight: 500;
  }
  .barLabel strong { color: #2D3748; }
  .barTrack {
    background: #EDF2F7;
    border-radius: 6px;
    height: 8px;
    overflow: hidden;
  }
  .barTrack > div {
    height: 100%;
    background: linear-gradient(90deg, #4F46E5, #7C3AED);
    border-radius: 6px;
    transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  }

  /* ── CLUSTERS ── */
  .clusterList { display: flex; flex-direction: column; gap: 10px; }
  .cluster {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #F7FAFC;
    border-radius: 10px;
    padding: 12px 14px;
    border: 1px solid #E2E8F0;
    gap: 12px;
  }
  .cluster strong { font-size: 13px; color: #2D3748; display: block; margin-bottom: 2px; }
  .cluster p { font-size: 12px; color: #A0AEC0; }
  .clusterBadge {
    background: #EEF2FF;
    color: #4F46E5;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 20px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── TABLE ── */
  .tableWrap {
    overflow-x: auto;
    border-radius: 10px;
    border: 1px solid #E2E8F0;
  }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #F7FAFC; }
  th {
    padding: 11px 14px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    color: #718096;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    border-bottom: 1px solid #E2E8F0;
  }
  td {
    padding: 11px 14px;
    font-size: 13px;
    color: #4A5568;
    border-bottom: 1px solid #F7FAFC;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover td { background: #F7FAFC; }

  /* ── ROADMAP ── */
  .roadmap {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .roadmapCard {
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #E2E8F0;
    background: #F7FAFC;
    position: relative;
    overflow: hidden;
  }
  .roadmapCard::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 4px;
    height: 100%;
  }
  .roadmapCard:nth-child(1)::before { background: #4F46E5; }
  .roadmapCard:nth-child(2)::before { background: #7C3AED; }
  .roadmapCard:nth-child(3)::before { background: #059669; }
  .roadmapCard h3 {
    font-size: 13px;
    font-weight: 700;
    color: #4F46E5;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .roadmapCard:nth-child(2) h3 { color: #7C3AED; }
  .roadmapCard:nth-child(3) h3 { color: #059669; }
  .roadmapCard p { font-size: 13px; color: #4A5568; line-height: 1.65; }

  /* ── CHAT PANEL ── */
  .chatOverlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 200;
    display: flex;
    justify-content: flex-end;
  }
  .chatPanel {
    width: 420px;
    max-width: 100vw;
    height: 100vh;
    background: #fff;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0,0,0,0.15);
    animation: slideIn 0.2s ease-out;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .chatHeader {
    padding: 20px 20px 16px;
    border-bottom: 1px solid #E2E8F0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .chatHeaderLeft { display: flex; align-items: center; gap: 10px; }
  .chatHeaderIcon {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
  }
  .chatHeaderTitle { font-size: 15px; font-weight: 700; color: #1A202C; }
  .chatHeaderSub { font-size: 12px; color: #A0AEC0; margin-top: 1px; }
  .chatClose {
    background: none; border: none; cursor: pointer;
    color: #A0AEC0; font-size: 20px; line-height: 1;
    padding: 4px; border-radius: 6px;
  }
  .chatClose:hover { background: #F7FAFC; color: #4A5568; }
  .chatMessages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .chatMsg {
    max-width: 90%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13.5px;
    line-height: 1.55;
  }
  .chatMsg.user {
    align-self: flex-end;
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .chatMsg.ai {
    align-self: flex-start;
    background: #F7FAFC;
    color: #2D3748;
    border: 1px solid #E2E8F0;
    border-bottom-left-radius: 4px;
  }
  .chatMsg.ai .sources {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #E2E8F0;
    font-size: 11px;
    color: #A0AEC0;
  }
  .chatTyping {
    align-self: flex-start;
    background: #F7FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    border-bottom-left-radius: 4px;
    padding: 12px 16px;
    color: #A0AEC0;
    font-size: 13px;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #CBD5E0;
    animation: blink 1.2s infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink {
    0%, 80%, 100% { opacity: 0.3; }
    40% { opacity: 1; }
  }
  .chatSuggestions {
    padding: 0 16px 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex-shrink: 0;
  }
  .chatSuggestion {
    background: #EEF2FF;
    color: #4F46E5;
    border: none;
    border-radius: 20px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }
  .chatSuggestion:hover { background: #E0E7FF; }
  .chatInputRow {
    padding: 12px 16px 16px;
    border-top: 1px solid #E2E8F0;
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .chatInput {
    flex: 1;
    border: 1.5px solid #E2E8F0;
    border-radius: 10px;
    padding: 10px 13px;
    font-size: 13.5px;
    color: #1A202C;
    outline: none;
    resize: none;
    font-family: inherit;
    line-height: 1.4;
    max-height: 100px;
    overflow-y: auto;
  }
  .chatInput:focus { border-color: #4F46E5; }
  .chatSend {
    background: linear-gradient(135deg, #4F46E5, #7C3AED);
    color: #fff;
    border: none;
    border-radius: 10px;
    width: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }
  .chatSend:hover:not(:disabled) { opacity: 0.9; }
  .chatSend:disabled { opacity: 0.5; cursor: not-allowed; }
  .chatWelcome {
    text-align: center;
    padding: 32px 16px;
    color: #A0AEC0;
  }
  .chatWelcome h3 { font-size: 15px; color: #4A5568; margin-bottom: 6px; font-weight: 600; }
  .chatWelcome p { font-size: 13px; line-height: 1.6; }

  @media (max-width: 900px) {
    .heroInner { grid-template-columns: 1fr; }
    .uploadPanel { width: 100%; }
    .kpiGrid { grid-template-columns: repeat(2, 1fr); }
    .gridTwo { grid-template-columns: 1fr; }
    .roadmap { grid-template-columns: 1fr; }
    .chatPanel { width: 100vw; }
  }
`;

type AnalysisResult = {
  run_id: number;
  filename: string;
  profile: any;
  quality: any;
  schema_validation: any;
  ticket_analysis: any;
  opportunities: any;
  bottlenecks: any;
  impact_analysis: any;
  ticket_clusters: any;
  ai_advisor_report: any;
};

type ChatMessage = {
  role: "user" | "ai";
  text: string;
  sources?: string[];
};

const SUGGESTIONS = [
  "What are the biggest bottlenecks?",
  "Which tickets should I automate first?",
  "What's the estimated ROI of automation?",
  "How can I improve data quality?",
  "What does the 30-day plan involve?",
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
    } else {
      setUser(stored);
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  function handleLogout() {
    clearUser();
    router.replace("/login");
  }

  async function handleUpload() {
    if (!file) { setError("Please select a CSV file first."); return; }
    setLoading(true);
    setError("");
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API}/upload`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });
      if (!response.ok) {
        if (response.status === 401) { handleLogout(); return; }
        throw new Error("Upload failed. Check backend terminal.");
      }
      const data = await response.json();
      setResult(data);
      setMessages([]);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat(text: string) {
    if (!text.trim() || chatLoading) return;
    setMessages((m) => [...m, { role: "user", text: text.trim() }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.access_token}`,
        },
        body: JSON.stringify({ query: text.trim(), run_id: result?.run_id ?? null }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.answer, sources: data.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
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
      <style>{css}</style>
      <div className="app">
        {/* NAV */}
        <nav className="topNav">
          <div className="navBrand">
            <div className="navLogo">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            Veracity
            <span className="navBadge">AI Process Intelligence</span>
          </div>
          <div className="navRight">
            <button className="chatToggle" onClick={() => setChatOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2h10a1 1 0 011 1v6a1 1 0 01-1 1H4L1 13V3a1 1 0 011-1z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Ask AI
            </button>
            <span className="navUser">{user?.full_name || user?.email}</span>
            <button className="navLogout" onClick={handleLogout}>Sign out</button>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero">
          <div className="heroInner">
            <div>
              <p className="heroEyebrow">Command Center</p>
              <h1 className="heroTitle">Operational Intelligence<br />at a Glance</h1>
              <p className="heroSub">
                Surface data quality issues, bottlenecks, and automation opportunities from any ticket export — powered by AI. Then chat with your data.
              </p>
            </div>

            <div className="uploadPanel">
              <p className="uploadPanelTitle">Upload Dataset</p>
              <label className="fileBox">
                <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}>
                  <path d="M8 1v9M5 4l3-3 3 3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="fileBoxText">{file ? file.name : "Choose CSV file"}</span>
              </label>
              <button className="uploadBtn" onClick={handleUpload} disabled={loading}>
                {loading ? "Analyzing…" : "Analyze Dataset"}
              </button>
              {error && <p className="errorMsg">{error}</p>}
            </div>
          </div>
        </section>

        <div className="body">
          {!result && (
            <div className="emptyState">
              <div className="emptyIcon">
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                  <rect x="4" y="4" width="22" height="22" rx="4" stroke="#4F46E5" strokeWidth="1.8"/>
                  <path d="M9 15h12M9 10h7M9 20h5" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="22" cy="22" r="5" fill="#4F46E5"/>
                  <path d="M20 22l1.5 1.5L24 20" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>No data loaded yet</h2>
              <p>Upload a CSV ticket export and Veracity will analyse data quality, surface bottlenecks, quantify automation savings, and generate a 90-day action plan — in seconds.</p>
              <div className="emptySteps">
                <div className="emptyStep"><span className="stepNum">1</span>Choose a .csv file above</div>
                <div className="emptyStep"><span className="stepNum">2</span>Click Analyze Dataset</div>
                <div className="emptyStep"><span className="stepNum">3</span>Chat with your data</div>
              </div>
            </div>
          )}

          {result && (
            <>
              {/* KPI GRID */}
              <div className="kpiGrid">
                <MetricCard
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#4F46E5" strokeWidth="1.8"/><path d="M6 9l2 2 4-4" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  title="Quality Score" value={`${qualityScore}`} label={`Grade ${result.quality.grade}`}
                />
                <MetricCard
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v14M5 6l4-4 4 4M5 12l4 4 4-4" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  title="Estimated Savings" value={`$${Number(savings).toLocaleString()}`} label="Potential automation value"
                />
                <MetricCard
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="12" rx="2" stroke="#0284C7" strokeWidth="1.8"/><path d="M5 7h8M5 10h5" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                  title="Rows Analyzed" value={rows.toLocaleString()} label={`${result.profile.columns} columns`}
                />
                <MetricCard
                  icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v6l3 3" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><circle cx="9" cy="9" r="7" stroke="#D97706" strokeWidth="1.8"/></svg>}
                  title="Data Issues" value={`${duplicates} dupes`} label={`${missingPercent}% missing cells`}
                />
              </div>

              {/* AI REPORT + DATA READINESS */}
              <div className="gridTwo">
                <div className="card">
                  <div className="sectionHeader">
                    <h2>AI Advisor Report</h2>
                    <span className="pill">{aiReport?.mode || "AI"}</span>
                  </div>
                  <p className="aiSummary">{aiReport?.executive_summary || "AI report was not generated yet."}</p>
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
                  <div className="readinessBar">
                    <div style={{ width: `${qualityScore}%` }} />
                  </div>
                  <ul className="cleanList">
                    {result.quality.issues?.map((issue: string, i: number) => (
                      <li key={i}>{issue}</li>
                    ))}
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
                        <div className="barLabel">
                          <span>{dept}</span>
                          <strong>{value} hrs</strong>
                        </div>
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

              {/* OPPORTUNITIES TABLE */}
              <div className="card">
                <div className="sectionHeader">
                  <h2>Automation Opportunities</h2>
                  <span className="pill">{result.opportunities.opportunities_found} found</span>
                </div>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Department</th>
                        <th>Tickets</th>
                        <th>Avg Time</th>
                        <th>Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topOpportunities.slice(0, 10).map((opp: any, i: number) => (
                        <tr key={i}>
                          <td>{opp.issue}</td>
                          <td>{opp.main_department}</td>
                          <td>{opp.ticket_count}</td>
                          <td>{opp.average_resolution_time} hrs</td>
                          <td style={{
                            color: opp.impact_level === "High" ? "#059669" : opp.impact_level === "Medium" ? "#D97706" : "#718096",
                            fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.4px",
                          }}>{opp.impact_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ROADMAP */}
              <div className="card">
                <div className="sectionHeader">
                  <h2>AI Automation Roadmap</h2>
                  <span className="pill">90-day plan</span>
                </div>
                <div className="roadmap">
                  <RoadmapCard title="30 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_30} />
                  <RoadmapCard title="60 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_60} />
                  <RoadmapCard title="90 Days" text={aiReport?.suggested_30_60_90_day_plan?.day_90} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* CHAT PANEL */}
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
                    <p>
                      {result
                        ? `I've indexed your "${result.filename}" analysis. Ask me anything about bottlenecks, automation opportunities, or data quality.`
                        : "Upload a CSV first, then ask me questions about your ticket data, automation opportunities, or ITSM best practices."}
                    </p>
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
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
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
                  className="chatInput"
                  placeholder="Ask about your data…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat(chatInput);
                    }
                  }}
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

function MetricCard({ icon, title, value, label }: { icon: React.ReactNode; title: string; value: string; label: string }) {
  return (
    <div className="metricCard">
      <div className="metricIcon">{icon}</div>
      <p className="metricTitle">{title}</p>
      <p className="metricValue">{value}</p>
      <span className="metricLabel">{label}</span>
    </div>
  );
}

function RoadmapCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="roadmapCard">
      <h3>{title}</h3>
      <p>{text || "Not available yet."}</p>
    </div>
  );
}
