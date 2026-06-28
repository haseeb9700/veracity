"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, register, storeUser, getStoredUser } from "../lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredUser()) router.replace("/");
    const err = searchParams.get("error");
    if (err) setError(`OAuth failed: ${err.replace(/_/g, " ")}. Please try again.`);
  }, [router, searchParams]);

  const passwordChecks = [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "Upper & lowercase letters", pass: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number", pass: /\d/.test(password) },
    { label: "Special character", pass: /[^a-zA-Z0-9]/.test(password) },
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
    <div style={{
      minHeight: "100vh",
      background: "#0f1117",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(79,70,229,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.1) 0%, transparent 50%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
      padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        {/* Card */}
        <div style={{
          background: "#fff",
          borderRadius: 16,
          padding: "40px 40px 36px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38,
                background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span style={{ fontWeight: 800, fontSize: 20, color: "#1A202C", letterSpacing: -0.5 }}>Veracity</span>
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A202C", textAlign: "center", marginBottom: 6, letterSpacing: -0.4 }}>
            {mode === "register" ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ fontSize: 14, color: "#718096", textAlign: "center", marginBottom: 28 }}>
            {mode === "register" ? "Sign up for a free account." : "Sign in to your Veracity workspace."}
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mode === "register" && (
              <IconInput
                icon={<UserIcon />}
                type="text"
                value={fullName}
                onChange={setFullName}
                placeholder="Full Name"
                required
              />
            )}
            <IconInput
              icon={<EmailIcon />}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder={mode === "register" ? "Company Email" : "Email"}
              required
            />
            <IconInput
              icon={<KeyIcon />}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              placeholder="Password"
              required
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#A0AEC0", padding: "0 2px", display: "flex", alignItems: "center" }}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />

            {/* Password requirements */}
            {mode === "register" && password.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "2px 0 4px" }}>
                {passwordChecks.map((c) => (
                  <span key={c.label} style={{
                    fontSize: 12,
                    color: c.pass ? "#059669" : "#A0AEC0",
                    display: "flex", alignItems: "center", gap: 4,
                    transition: "color 0.2s",
                  }}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{c.pass ? "✓" : "+"}</span>
                    {c.label}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div style={{
                background: "#FFF5F5", border: "1px solid #FC8181",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 13, color: "#E53E3E",
              }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "13px", fontSize: 15, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.75 : 1,
                marginTop: 4, letterSpacing: 0.1,
                transition: "opacity 0.15s, transform 0.1s",
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.opacity = "0.9"; }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.opacity = "1"; }}
            >
              {loading ? "Please wait…" : mode === "register" ? "Create your account" : "Sign in"}
            </button>
          </form>

          {mode === "register" && (
            <p style={{ fontSize: 11.5, color: "#A0AEC0", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
              By continuing, you agree to our{" "}
              <span style={{ color: "#4F46E5", cursor: "pointer" }}>Terms of Service</span>
              {" "}and{" "}
              <span style={{ color: "#4F46E5", cursor: "pointer" }}>Privacy Policy</span>.
            </p>
          )}

          <p style={{ marginTop: 20, fontSize: 13.5, color: "#718096", textAlign: "center" }}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setPassword(""); }}
              style={{ background: "none", border: "none", color: "#4F46E5", fontWeight: 700, cursor: "pointer", fontSize: 13.5 }}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
            <span style={{ fontSize: 12, color: "#A0AEC0", whiteSpace: "nowrap" }}>Or {mode === "register" ? "sign up" : "sign in"} with</span>
            <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
          </div>

          {/* Social buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "Google", icon: <GoogleIcon />, href: `${API}/auth/google/login` },
              { label: "GitHub", icon: <GitHubIcon />, href: `${API}/auth/github/login` },
              { label: "Office 365", icon: <MicrosoftIcon />, href: `${API}/auth/microsoft/login` },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => window.location.href = s.href}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: "#fff", border: "1.5px solid #E2E8F0",
                  borderRadius: 9, padding: "10px 6px",
                  fontSize: 12.5, color: "#4A5568", fontWeight: 500,
                  cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F7FAFC"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#CBD5E0"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0"; }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          © {new Date().getFullYear()} Veracity AI · All rights reserved
        </p>
      </div>
    </div>
  );
}

/* ── Input with left icon ─────────────────────────────────────────────── */
function IconInput({ icon, type, value, onChange, placeholder, required, rightSlot }: {
  icon: React.ReactNode; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  required?: boolean; rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      display: "flex", alignItems: "center",
      border: `1.5px solid ${focused ? "#4F46E5" : "#E2E8F0"}`,
      borderRadius: 10, overflow: "hidden",
      transition: "border-color 0.15s",
      background: "#fff",
    }}>
      <div style={{
        padding: "0 14px",
        color: focused ? "#4F46E5" : "#A0AEC0",
        display: "flex", alignItems: "center",
        transition: "color 0.15s", flexShrink: 0,
      }}>
        {icon}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: "none", outline: "none",
          padding: "12px 0", fontSize: 14, color: "#1A202C",
          background: "transparent",
        }}
      />
      {rightSlot && <div style={{ padding: "0 12px", display: "flex", alignItems: "center" }}>{rightSlot}</div>}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 8H15M13 6.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 2l12 12M6.5 6.5A2 2 0 0110 10M4.5 4.5C3 5.5 1.5 7 1 8c1 2 3.5 5 7 5 1.5 0 2.8-.5 3.9-1.2M7 3.1C7.3 3 7.7 3 8 3c3.5 0 6 3 7 5-.4.9-1 1.8-1.8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#1A202C">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}
