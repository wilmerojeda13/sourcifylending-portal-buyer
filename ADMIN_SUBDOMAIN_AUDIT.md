# Admin Subdomain Implementation Audit

## Current State Analysis

### Authentication Flow
1. **Main Login** (`/login`)
   - Accepts `email` and `password` via `LoginForm.tsx`
   - Uses Supabase auth with `signInWithPassword()`
   - Redirects to `/portal` on success (line 19 in `login/actions.ts`)
   - All users see the same login page

2. **OAuth Callback** (`/auth/callback`)
   - Exchanges auth code for session
   - Creates new profiles with default `feature_tier: 'free'`
   - Handles affiliate tracking and CRM lead creation
   - Uses `normalizeNextPath()` to support `?next=` redirects

3. **Admin Protection** (`/admin/layout.tsx`)
   - Checks `is_admin` flag from profiles table
   - Redirects non-admins to `/dashboard`
   - Requires existing session (redirects to `/login` if no user)

4. **Session Management** (`middleware.ts`)
   - Refreshes Supabase session on every request
   - Manages cookies with Supabase SSR
   - Handles affiliate referral tracking

### Issues with Current Design
- ❌ Non-admins can only enter the admin portal AFTER first logging into the main site
- ❌ No way to access `/admin` directly without main site flow
- ❌ Login form doesn't distinguish between admin and regular users
- ❌ No subdomain awareness in routes

### Cookie/Session Details
- **Auth Provider:** Supabase SSR with cookie-based sessions
- **Cookie Domain:** Not explicitly set — inherits from request domain
- **Cookie Scope:** Currently works across same domain (www.sourcifylending.com)
- **Cross-Subdomain:** Will NOT work by default (browser security)

## Proposed Solution

### Architecture Overview
```
admin.sourcifylending.com/
├── Login page (admin-only entry point)
├── Role check after login
├── Redirect to /admin if admin
└── Block/signout if not admin

www.sourcifylending.com/
├── Login page (normal user entry)
├── Redirects to /portal after login
└── /admin is protected by is_admin check
```

### Key Changes Required

1. **Subdomain Detection (Middleware)**
   - Extract host from request
   - Identify if request is for `admin.sourcifylending.com`
   - Set header or context for downstream routes

2. **Admin Login Page**
   - New route: `/admin-login` or route group `(admin)`
   - Shows admin-focused login interface
   - Passes `isAdminEntry=true` through auth flow

3. **Auth Callback Enhancement**
   - Detect if coming from admin subdomain
   - After OAuth, check `is_admin` status
   - Redirect to `/admin` if admin, block if not

4. **Cookie Domain Configuration**
   - Set Supabase cookie domain to `.sourcifylending.com`
   - Allows session to work across subdomains

5. **Middleware Routing**
   - Route `admin.*` subdomain requests to admin login
   - Preserve other middleware (session, affiliate tracking)

## Required Changes Summary

| Component | Change | Complexity |
|-----------|--------|------------|
| `middleware.ts` | Add subdomain detection | Low |
| `src/app/admin-login/` | New route group | Low |
| `src/app/auth/callback` | Add admin subdomain logic | Medium |
| `src/lib/site-config.ts` | Add admin domain config | Low |
| `src/lib/auth-routing.ts` | Add admin-aware redirects | Low |
| Supabase config | Set cookie domain | Low |
| DNS | Add admin.sourcifylending.com | External |
| Vercel | No changes (supports all subdomains) | None |

## Security Considerations
✅ Admin-only access enforced via `is_admin` check
✅ Non-admin users blocked at auth callback
✅ Session cookies work only for authenticated users
✅ Middleware validates on every request
✅ All redirects sanitized via `normalizeNextPath()`
⚠️ Ensure Supabase cookie domain doesn't leak to untrusted subdomains

## Testing Plan
1. Admin user: admin.sourcifylending.com → login → /admin ✓
2. Regular user: admin.sourcifylending.com → login → blocked/signed out ✓
3. Normal flow: www.sourcifylending.com → login → /portal ✓
4. Cross-subdomain session: Start on www, visit admin ✓
5. Redirect loops: No infinite loops ✓
6. Auth callback: Code exchange works on both subdomains ✓
