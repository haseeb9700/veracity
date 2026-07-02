"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, register, storeUser, getStoredUser } from "../lib/auth";
import Aurora from "../components/Aurora";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredUser()) router.replace("/");
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(`OAuth failed: ${err.replace(/_/g, " ")}. Please try again.`);
  }, [router]);

  const passwordChecks = [
    { label: "8+ chars", pass: password.length >= 8 },
    { label: "Upper & lower", pass: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number", pass: /\d/.test(password) },
    { label: "Special char", pass: /[^a-zA-Z0-9]/.test(password) },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = mode === "login"
        ? await login(email, password)
        : await register(email, password, fullName);
      storeUser(user);
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        .login-page {
          min-height: 100vh;
          display: flex;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        }

        /* ── LEFT PANEL ── */
        .login-left {
          position: relative;
          width: 46%;
          background: #080615;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px 52px;
          overflow: hidden;
        }
        @media (max-width: 768px) { .login-left { display: none; } }

        .login-left-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          flex: 1;
          justify-content: space-between;
        }
        .login-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 0;
        }
        .login-logo-icon {
          width: 34px;
          height: 34px;
          background: linear-gradient(135deg, #4F46E5, #7C3AED);
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .login-logo-name {
          font-weight: 700;
          font-size: 17px;
          color: #ffffff;
          letter-spacing: -0.3px;
        }
        .login-tagline {
          font-size: 38px;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.15;
          letter-spacing: -1.2px;
          margin: 0 0 16px;
        }
        .login-tagline-accent {
          background: linear-gradient(135deg, #818cf8, #c4b5fd);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .login-tagline-sub {
          font-size: 14.5px;
          color: rgba(255,255,255,0.45);
          line-height: 1.65;
          max-width: 320px;
          margin: 0;
        }
        .login-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 40px;
        }
        .login-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .login-stat-num {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.5px;
        }
        .login-stat-label {
          font-size: 11.5px;
          color: rgba(255,255,255,0.35);
          margin-top: 3px;
        }
        .login-testimonial {
          position: relative;
          z-index: 1;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 22px;
        }
        .login-testimonial-text {
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          font-style: italic;
          line-height: 1.65;
          margin: 0 0 12px;
        }
        .login-testimonial-author {
          font-size: 11.5px;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .login-testimonial-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4F46E5, #7C3AED);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          color: #fff;
          font-weight: 700;
          font-style: normal;
        }

        /* ── RIGHT PANEL ── */
        .login-right {
          flex: 1;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
        }
        .login-form-wrap {
          width: 100%;
          max-width: 400px;
        }
        .login-form-title {
          font-size: 27px;
          font-weight: 800;
          color: #0D0B1A;
          letter-spacing: -0.7px;
          margin: 0 0 6px;
        }
        .login-form-sub {
          font-size: 14px;
          color: #718096;
          margin: 0 0 28px;
          line-height: 1.5;
        }
        .login-input-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 6px;
        }
        .login-input-wrap {
          display: flex;
          align-items: center;
          border: 1.5px solid #E2E8F0;
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
          background: #fff;
        }
        .login-input-wrap:focus-within {
          border-color: #4F46E5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.1);
        }
        .login-input-wrap:focus-within .login-input-icon {
          color: #4F46E5;
        }
        .login-input-icon {
          padding: 0 13px;
          color: #CBD5E0;
          display: flex;
          align-items: center;
          transition: color 0.15s;
          flex-shrink: 0;
        }
        .login-input {
          flex: 1;
          border: none;
          outline: none;
          padding: 13px 0;
          font-size: 14px;
          color: #1A202C;
          background: transparent;
          font-family: var(--font-geist-sans), -apple-system, sans-serif;
        }
        .login-input::placeholder { color: #CBD5E0; }
        .login-eye-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #A0AEC0;
          padding: 0 12px;
          display: flex;
          align-items: center;
        }
        .login-pw-checks {
          display: flex;
          flex-wrap: wrap;
          gap: 5px 12px;
          padding: 6px 0 4px;
        }
        .login-pw-check {
          font-size: 11.5px;
          display: flex;
          align-items: center;
          gap: 3px;
          transition: color 0.2s;
        }
        .login-error {
          background: #FFF5F5;
          border: 1px solid #FC8181;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #E53E3E;
          margin: 8px 0;
        }
        .login-submit {
          width: 100%;
          background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 14px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 10px;
          letter-spacing: -0.1px;
          transition: opacity 0.15s, transform 0.1s;
          font-family: var(--font-geist-sans), -apple-system, sans-serif;
        }
        .login-submit:hover:not(:disabled) {
          opacity: 0.92;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(79,70,229,0.25);
        }
        .login-submit:disabled { opacity: 0.7; cursor: not-allowed; }
        .login-terms {
          font-size: 11.5px;
          color: #A0AEC0;
          text-align: center;
          margin-top: 12px;
          line-height: 1.5;
        }
        .login-terms-link { color: #4F46E5; cursor: pointer; }
        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0;
        }
        .login-divider-line { flex: 1; height: 1px; background: #EDF2F7; }
        .login-divider-text { font-size: 12px; color: #A0AEC0; white-space: nowrap; }
        .login-oauth-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
        }
        .login-oauth-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: #fff;
          border: 1.5px solid #E2E8F0;
          border-radius: 10px;
          padding: 10px 8px;
          font-size: 12.5px;
          color: #4A5568;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: var(--font-geist-sans), -apple-system, sans-serif;
        }
        .login-oauth-btn:hover {
          border-color: #C7D2FE;
          background: #F7F8FF;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79,70,229,0.08);
        }
        .login-toggle {
          margin-top: 22px;
          font-size: 13.5px;
          color: #718096;
          text-align: center;
        }
        .login-toggle-btn {
          background: none;
          border: none;
          color: #4F46E5;
          font-weight: 700;
          cursor: pointer;
          font-size: 13.5px;
          font-family: inherit;
          padding: 0;
        }
        .login-toggle-btn:hover { text-decoration: underline; }
      `}</style>

      <div className="login-page">

        {/* ── LEFT PANEL ── */}
        <div className="login-left">
          <Aurora
            colorStops={["#1e1b4b", "#4F46E5", "#6d28d9"]}
            amplitude={0.8}
            blend={0.35}
            speed={0.5}
          />

          <div className="login-left-inner">
            <div>
              {/* Logo */}
              <div className="login-logo">
                <div className="login-logo-icon">
                  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="login-logo-name">Veracity</span>
              </div>

              {/* Tagline */}
              <div style={{ marginTop: 56 }}>
                <h2 className="login-tagline">
                  From messy data<br/>to a{" "}
                  <span className="login-tagline-accent">90-day plan</span>
                  <br/>in 30 seconds.
                </h2>
                <p className="login-tagline-sub">
                  Upload your support tickets. Get quality scores, bottleneck maps, automation ROI, and a live AI advisor — instantly.
                </p>

                {/* Stats */}
                <div className="login-stats">
                  {[
                    { num: "< 30s", label: "Full analysis time" },
                    { num: "$48K+", label: "Avg. savings found" },
                    { num: "A → F", label: "Data quality grades" },
                    { num: "100%", label: "Private by default" },
                  ].map((s) => (
                    <div key={s.label} className="login-stat">
                      <div className="login-stat-num">{s.num}</div>
                      <div className="login-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Testimonial */}
            <div className="login-testimonial">
              <p className="login-testimonial-text">
                "Veracity showed us $48K in automation savings on our first upload. We had the board presentation ready the same afternoon."
              </p>
              <div className="login-testimonial-author">
                <span className="login-testimonial-avatar">M</span>
                <span>Head of Operations · SaaS company, 200 employees</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="login-right">
          <div className="login-form-wrap">
            <h1 className="login-form-title">
              {mode === "register" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="login-form-sub">
              {mode === "register"
                ? "Start free — no credit card needed."
                : "Sign in to your Veracity workspace."}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="login-input-stack">
                {mode === "register" && (
                  <div className="login-input-wrap">
                    <span className="login-input-icon"><UserIcon /></span>
                    <input className="login-input" type="text" value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Full Name" required />
                  </div>
                )}
                <div className="login-input-wrap">
                  <span className="login-input-icon"><EmailIcon /></span>
                  <input className="login-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={mode === "register" ? "Work Email" : "Email"} required />
                </div>
                <div className="login-input-wrap">
                  <span className="login-input-icon"><KeyIcon /></span>
                  <input className="login-input" type={showPassword ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password" required />
                  <button type="button" className="login-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {mode === "register" && password.length > 0 && (
                <div className="login-pw-checks">
                  {passwordChecks.map((c) => (
                    <span key={c.label} className="login-pw-check" style={{ color: c.pass ? "#059669" : "#CBD5E0" }}>
                      <span style={{ fontSize: 13 }}>{c.pass ? "✓" : "·"}</span>
                      {c.label}
                    </span>
                  ))}
                </div>
              )}

              {error && <div className="login-error">{error}</div>}

              <button type="submit" disabled={loading} className="login-submit">
                {loading ? "Please wait…" : mode === "register" ? "Create account →" : "Sign in →"}
              </button>
            </form>

            {mode === "register" && (
              <p className="login-terms">
                By continuing, you agree to our{" "}
                <span className="login-terms-link">Terms of Service</span>
                {" "}and{" "}
                <span className="login-terms-link">Privacy Policy</span>.
              </p>
            )}

            <div className="login-divider">
              <div className="login-divider-line" />
              <span className="login-divider-text">or {mode === "register" ? "sign up" : "sign in"} with</span>
              <div className="login-divider-line" />
            </div>

            <div className="login-oauth-grid">
              {[
                { label: "Google", icon: <GoogleIcon />, href: `${API}/auth/google/login` },
                { label: "GitHub", icon: <GitHubIcon />, href: `${API}/auth/github/login` },
                { label: "Office 365", icon: <MicrosoftIcon />, href: `${API}/auth/microsoft/login` },
              ].map((s) => (
                <button key={s.label} type="button" className="login-oauth-btn"
                  onClick={() => window.location.href = s.href}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>

            <p className="login-toggle">
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button className="login-toggle-btn"
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setPassword(""); }}>
                {mode === "login" ? "Sign up free" : "Log in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function UserIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function EmailIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function KeyIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M9.5 8H15M13 6.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function EyeIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function EyeOffIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.5A2 2 0 0110 10M4.5 4.5C3 5.5 1.5 7 1 8c1 2 3.5 5 7 5 1.5 0 2.8-.5 3.9-1.2M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6 3 7 5-.4.9-1 1.8-1.8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function GoogleIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}
function GitHubIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="#1A202C"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>;
}
function MicrosoftIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>;
}
