const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface AuthUser {
  user_id: number;
  email: string;
  full_name: string;
  access_token: string;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("veracity_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: AuthUser) {
  localStorage.setItem("veracity_user", JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem("veracity_user");
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  return { user_id: data.user_id, email: data.email, full_name: data.full_name, access_token: data.access_token };
}

export async function register(email: string, password: string, full_name: string): Promise<AuthUser> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registration failed");
  }
  const data = await res.json();
  return { user_id: data.user_id, email: data.email, full_name: data.full_name, access_token: data.access_token };
}
