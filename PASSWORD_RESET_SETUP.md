# Password Reset & Email Verification – torcapp.com Setup

Password reset and email verification links in emails will route to the URL configured in `VITE_APP_URL`.

## 1. Set production URL

In your **production** `.env` (or build/deploy environment variables):

```
VITE_APP_URL=https://www.torcapp.com
```

For customer and provider apps, set this so reset emails link to `https://www.torcapp.com/auth/callback` (then the app redirects to `/reset-password`).

## 2. Supabase redirect URLs

In Supabase: **Authentication → URL Configuration**:

1. **Site URL**: `https://www.torcapp.com`
2. **Redirect URLs** – add:
   - `https://www.torcapp.com/auth/callback`
   - `https://www.torcapp.com/**`
   - `http://localhost:5173/auth/callback` (for local dev)
   - `http://localhost:8081/auth/callback` (provider dev)

## 3. Email verification (signup)

`signUp` passes `emailRedirectTo` using `VITE_APP_URL`, so verification emails link to `https://www.torcapp.com/auth/callback`.

## 4. Flow

1. User clicks “Forgot password” and enters email.
2. Supabase sends an email with a link to `https://www.torcapp.com/auth/callback#access_token=...&type=recovery`.
3. Your app’s `AuthCallback` handles the hash, detects `type=recovery`, and navigates to `/reset-password`.
4. User sets a new password and is redirected to login.

**Email verification:** Same flow—Supabase sends a link to `VITE_APP_URL/auth/callback`, and the app redirects to the appropriate page.

Without `VITE_APP_URL` set, the app falls back to `window.location.origin`, so behavior depends on the domain the user was on when requesting the reset or signing up.
