"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeUser } from "../../lib/auth";

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const user_id = params.get("user_id");
    const email = params.get("email");
    const full_name = params.get("full_name");
    const error = params.get("error");

    if (error) {
      router.replace(`/login?error=${error}`);
      return;
    }

    if (token && user_id && email) {
      storeUser({
        access_token: token,
        user_id: parseInt(user_id),
        email,
        full_name: full_name || "",
      });
      router.replace("/");
    } else {
      router.replace("/login?error=oauth_failed");
    }
  }, [params, router]);

  return null;
}

export default function AuthCallback() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "40px 48px",
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{
          width: 48, height: 48,
          background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <svg width="24" height="24" viewBox="0 0 18 18" fill="none">
            <path d="M3 9L7.5 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 6 }}>Signing you in…</p>
        <p style={{ fontSize: 13, color: "#718096" }}>Please wait a moment</p>
        <Suspense fallback={null}>
          <CallbackHandler />
        </Suspense>
      </div>
    </div>
  );
}
