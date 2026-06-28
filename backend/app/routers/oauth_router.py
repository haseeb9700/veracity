"""
Social OAuth login: Google, GitHub, Microsoft.

Flow:
  1. Frontend hits /auth/{provider}/login → redirects to provider
  2. Provider redirects to /auth/{provider}/callback
  3. We exchange code for user info
  4. Create or find user in DB
  5. Generate JWT and redirect to frontend with token in URL
"""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import get_db, create_access_token, hash_password
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["oauth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _get_or_create_user(db: Session, email: str, full_name: str, provider: str) -> User:
    """Find existing user or create one from OAuth profile."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Create user with a random unusable password
        import secrets
        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(secrets.token_hex(32)),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _redirect_with_token(user: User) -> RedirectResponse:
    token = create_access_token({"sub": str(user.id)})
    return RedirectResponse(
        url=f"{FRONTEND_URL}/auth/callback?token={token}&user_id={user.id}&email={user.email}&full_name={user.full_name or ''}",
        status_code=302,
    )


# ── GOOGLE ────────────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

@router.get("/google/login")
def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    from urllib.parse import urlencode
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    # Exchange code for tokens
    resp = httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    if not resp.is_success:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=google_failed")

    access_token = resp.json().get("access_token")

    # Get user info
    user_resp = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
                          headers={"Authorization": f"Bearer {access_token}"})
    if not user_resp.is_success:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=google_failed")

    data = user_resp.json()
    email = data.get("email")
    full_name = data.get("name", "")

    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=no_email")

    user = _get_or_create_user(db, email, full_name, "google")
    return _redirect_with_token(user)


# ── GITHUB ────────────────────────────────────────────────────────────────────
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")

@router.get("/github/login")
def github_login():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    from urllib.parse import urlencode
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_REDIRECT_URI,
        "scope": "user:email",
    }
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{urlencode(params)}")


@router.get("/github/callback")
def github_callback(code: str, db: Session = Depends(get_db)):
    # Exchange code for token
    resp = httpx.post("https://github.com/login/oauth/access_token",
        data={
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": GITHUB_REDIRECT_URI,
        },
        headers={"Accept": "application/json"},
    )
    if not resp.is_success:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=github_failed")

    access_token = resp.json().get("access_token")

    # Get user info
    user_resp = httpx.get("https://api.github.com/user",
                          headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"})
    data = user_resp.json()

    # GitHub may not expose email publicly — fetch separately
    email = data.get("email")
    if not email:
        emails_resp = httpx.get("https://api.github.com/user/emails",
                                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"})
        emails = emails_resp.json()
        primary = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
        email = primary

    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=no_email")

    full_name = data.get("name") or data.get("login", "")
    user = _get_or_create_user(db, email, full_name, "github")
    return _redirect_with_token(user)


# ── MICROSOFT ─────────────────────────────────────────────────────────────────
MS_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID", "")
MS_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
MS_REDIRECT_URI = os.getenv("MICROSOFT_REDIRECT_URI", "http://localhost:8000/auth/microsoft/callback")
MS_TENANT = os.getenv("MICROSOFT_TENANT", "common")

@router.get("/microsoft/login")
def microsoft_login():
    if not MS_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Microsoft OAuth not configured")
    from urllib.parse import urlencode
    params = {
        "client_id": MS_CLIENT_ID,
        "redirect_uri": MS_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile User.Read",
        "response_mode": "query",
    }
    return RedirectResponse(
        url=f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/authorize?{urlencode(params)}"
    )


@router.get("/microsoft/callback")
def microsoft_callback(code: str, db: Session = Depends(get_db)):
    resp = httpx.post(
        f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token",
        data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "code": code,
            "redirect_uri": MS_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )
    if not resp.is_success:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=microsoft_failed")

    access_token = resp.json().get("access_token")

    user_resp = httpx.get("https://graph.microsoft.com/v1.0/me",
                          headers={"Authorization": f"Bearer {access_token}"})
    if not user_resp.is_success:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=microsoft_failed")

    data = user_resp.json()
    email = data.get("mail") or data.get("userPrincipalName")
    full_name = data.get("displayName", "")

    if not email:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?error=no_email")

    user = _get_or_create_user(db, email, full_name, "microsoft")
    return _redirect_with_token(user)
