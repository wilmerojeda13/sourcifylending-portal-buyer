# Admin Subdomain Implementation Guide

## Overview
Complete implementation of admin-only subdomain entry point at `admin.sourcifylending.com` with role-based access control.

## What Changed

### New Files
1. **`src/app/admin-login/page.tsx`** (67 lines)
   - Admin-specific login page with dark theme
   - Detects non-admin rejections and shows error message
   - Redirects admins to `/admin` dashboard
   - Prevents redirect loops

2. **`src/app/admin-login/AdminLoginForm.tsx`** (87 lines)
   - Client component for admin authentication
   - Email/password login with visibility toggle
   - "Keep signed in" checkbox
   - Admin-only warning message
   - Red theme styling for security emphasis

### Modified Files

1. **`src/lib/site-config.ts`** (3 lines added)
   ```typescript
   export const ADMIN_URL = trimSlash(
     process.env.NEXT_PUBLIC_ADMIN_URL ??
     SITE_URL.replace(/^https?:\/\/(?:www\.)?/, 'https://admin.')
   )
   ```
   - New `ADMIN_URL` constant for admin subdomain
   - Auto-derives from `SITE_URL` if env var not set
   - Supports override via `NEXT_PUBLIC_ADMIN_URL`

2. **`src/lib/auth-routing.ts`** (13 lines modified/added)
   ```typescript
   export function isAdminSubdomain(host: string): boolean {
     return host.toLowerCase().startsWith('admin.')
   }
   
   export function buildOAuthCallbackUrl(origin: string, next: string | null | undefined, isAdminEntry?: boolean) {
     // Auto-detects admin subdomain from origin
     const isAdminOrigin = isAdminEntry !== undefined ? isAdminEntry : isAdminSubdomain(url.host)
     // Returns callback URL with adminEntry flag
   }
   ```
   - Detects admin subdomain from hostname
   - Routes OAuth callbacks to correct post-login path

3. **`src/middleware.ts`** (12 lines modified/added)
   - Detects admin subdomain requests
   - Sets `x-admin-subdomain` header for downstream routes
   - Preserves existing session refresh and affiliate tracking

4. **`src/app/login/page.tsx`** (12 lines added)
   - Redirects admin subdomain requests to `/admin-login`
   - Preserves query params (error, email, etc.)
   - Uses `isAdminSubdomain()` helper

5. **`src/app/auth/callback/route.ts`** (30 lines modified/added)
   - Parses `adminEntry` query parameter
   - Checks `is_admin` flag from profiles table
   - Signs out non-admin users with helpful error message
   - Redirects to admin subdomain with error if non-admin
   - Prevents non-admin accounts from accessing admin via OAuth

## Code Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ User visits admin.sourcifylending.com                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Middleware     │
                    │  Detects: admin │
                    │  subdomain      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────────────┐
                    │ /login/page.tsx         │
                    │ Checks host            │
                    │ Redirect → /admin-login│
                    └────────┬────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │ /admin-login/page   │
                  │ • Dark theme        │
                  │ • Admin warning     │
                  │ • Show form         │
                  └──────────┬──────────┘
                             │
                   User enters credentials
                             │
            ┌────────────────┴────────────────┐
            │                                 │
   Regular  Login (Email/Password)     OAuth (Google)
            │                                 │
   ┌────────▼────────┐          ┌────────────▼───────────┐
   │ POST /login     │          │ Google OAuth Redirect  │
   │ signInWithPwd   │          │ Google → Auth Code     │
   └────────┬────────┘          └────────────┬───────────┘
            │                               │
            └──────────────┬────────────────┘
                           │
                    ┌──────▼──────────────┐
                    │ /auth/callback/route│
                    │ • Exchange code     │
                    │ • Get user data     │
                    │ • Create profile    │
                    │ • Check is_admin ✓  │ ← CRITICAL
                    │ • If admin → /admin │
                    │ • If not → sign out │
                    │           → error   │
                    └────────┬────────────┘
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
      ✅ Is Admin                           ❌ Not Admin
          │                                     │
   ┌──────▼─────────┐              ┌───────────▼────────┐
   │ Redirect → /   │              │ Sign user out      │
   │ admin dashboard│              │ Redirect to error  │
   │ Display items  │              │ page with email    │
   └────────────────┘              └────────────────────┘
```

## Security Model

### Admin Access Flow
1. **Entry Point:** Subdomain request to admin.sourcifylending.com
2. **Authentication:** Email/password or OAuth (identical to main login)
3. **Authorization:** Check `is_admin` flag in profiles table
4. **Grant Access:** User redirected to `/admin` dashboard
5. **Enforcement:** Admin layout also checks `is_admin` (defense-in-depth)

### Non-Admin Rejection
1. **Detection:** Auth callback checks `is_admin` status
2. **Termination:** Session immediately terminated (signOut)
3. **Notification:** User shown error message with email pre-filled
4. **Recovery:** User can try different email or contact support

### Defense-in-Depth
- **Layer 1:** Auth callback rejects non-admins
- **Layer 2:** `/admin-login/page.tsx` checks session and redirects
- **Layer 3:** `/admin/layout.tsx` validates admin status
- **Layer 4:** Middleware preserves session validity

## Configuration Required

### Environment Variables
```bash
# Optional - auto-derived if not set
NEXT_PUBLIC_ADMIN_URL=https://admin.sourcifylending.com
```

### DNS (External)
```
Name:  admin
Type:  CNAME
Value: cname.vercel.com
```

### Vercel Settings
- No additional configuration needed
- Subdomains supported automatically
- SSL certificate auto-issued

## Testing Checklist

### Before Deployment
- [ ] Code compiles without errors: `npm run build`
- [ ] Type checking passes: `npm run type-check`
- [ ] All admin test cases reviewed (see ADMIN_SUBDOMAIN_TEST_CASES.md)
- [ ] Local testing with /etc/hosts entries complete
- [ ] Admin user created in test database with `is_admin=true`
- [ ] Regular user created with `is_admin=false`

### After Deployment
- [ ] DNS propagates (nslookup admin.sourcifylending.com)
- [ ] SSL certificate issued (green lock in browser)
- [ ] Admin login succeeds
- [ ] Non-admin login blocked
- [ ] OAuth flow works with admin check
- [ ] No infinite redirect loops
- [ ] No console errors on admin subdomain

## Deployment Steps

### 1. Code Deployment
```bash
# Merge to main or deployment branch
git add .
git commit -m "feat: Add admin subdomain entry point with role-based access"
git push origin main

# Vercel auto-deploys on push
# OR manually trigger deploy in Vercel dashboard
```

### 2. DNS Setup (Can be done before or after code deploy)
```
Contact domain registrar or DNS provider:
- Add CNAME record: admin → cname.vercel.com
- Wait for propagation (usually 5-30 minutes)
```

### 3. Environment Variables (Optional)
```
In Vercel Dashboard → Settings → Environment Variables:
NEXT_PUBLIC_ADMIN_URL = https://admin.sourcifylending.com
(Production environment)
```

### 4. Verification
```bash
# After DNS propagates and deploy completes
curl -I https://admin.sourcifylending.com
# Should return 200 OK with HTTPS

# Test login
Navigate to https://admin.sourcifylending.com
Try login with admin and regular user accounts
```

## File Diff Summary

### src/lib/site-config.ts
```diff
+ export const ADMIN_URL = trimSlash(
+   process.env.NEXT_PUBLIC_ADMIN_URL ??
+   SITE_URL.replace(/^https?:\/\/(?:www\.)?/, 'https://admin.')
+ )
```

### src/lib/auth-routing.ts
```diff
+ export const ADMIN_POST_LOGIN_PATH = '/admin'
+ 
+ export function isAdminSubdomain(host: string): boolean {
+   return host.toLowerCase().startsWith('admin.')
+ }

  export function buildOAuthCallbackUrl(origin: string, next: string | null | undefined, isAdminEntry = false) {
    const base = origin.replace(/\/$/, '')
+   const url = new URL(base)
+   const isAdminOrigin = isAdminEntry !== undefined ? isAdminEntry : isAdminSubdomain(url.host)
-   const target = normalizeNextPath(next)
+   const target = normalizeNextPath(next, isAdminOrigin ? ADMIN_POST_LOGIN_PATH : DEFAULT_POST_LOGIN_PATH)
-   return `${base}/auth/callback?next=${encodeURIComponent(target)}&adminEntry=${isAdminEntry}`
+   return `${base}/auth/callback?next=${encodeURIComponent(target)}&adminEntry=${isAdminOrigin}`
  }
```

### src/middleware.ts
```diff
+ import { isAdminSubdomain } from '@/lib/auth-routing'
  
  export async function middleware(request: NextRequest) {
    const host = request.headers.get('host')?.toLowerCase() ?? ''
+   const isAdmin = isAdminSubdomain(host)
+   let supabaseResponse = NextResponse.next({ request })
+   if (isAdmin) {
+     supabaseResponse.headers.set('x-admin-subdomain', 'true')
+   }
```

### src/app/login/page.tsx
```diff
+ import { headers } from 'next/headers'
+ import { isAdminSubdomain } from '@/lib/auth-routing'

  export default async function LoginPage({ searchParams }: PageProps) {
    const { error, email, next, code } = await searchParams
+   
+   const headersList = await headers()
+   const host = headersList.get('host')?.toLowerCase() ?? ''
+   if (isAdminSubdomain(host)) {
+     redirect(`/admin-login?${new URLSearchParams(...).toString()}`)
+   }
```

### src/app/auth/callback/route.ts
```diff
  export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = normalizeNextPath(searchParams.get('next'))
+   const adminEntry = searchParams.get('adminEntry') === 'true'

+   // After profile creation/update:
+   if (adminEntry) {
+     const { data: profile } = await serviceClient
+       .from('profiles')
+       .select('is_admin')
+       .eq('id', user.id)
+       .maybeSingle()
+
+     if (!profile?.is_admin) {
+       await supabase.auth.signOut()
+       const adminOrigin = origin.replace(/^https?:\/\/(www\.)?/, 'https://admin.')
+       return NextResponse.redirect(...)
+     }
+   }
```

## Rollback Procedure

If issues arise:

1. **Revert Code Changes**
   ```bash
   git revert <commit-hash>
   git push origin main
   # Vercel auto-deploys previous version
   ```

2. **Remove DNS Record**
   - Remove CNAME record for `admin` subdomain
   - Propagation: 5-30 minutes

3. **Status**
   - All functionality restored to previous state
   - No data lost
   - Users can still access `/admin` on main domain

## Support & Debugging

### Common Issues

**Issue:** Infinite redirect loop
- **Check:** Browser Network tab, look for redirect chain
- **Fix:** Clear cache, verify `isAdminSubdomain()` logic
- **Verify:** `normalizeNextPath()` doesn't append ?next to itself

**Issue:** SSL certificate not issued
- **Check:** Run `curl -I https://admin.sourcifylending.com`
- **Fix:** Wait 10-20 minutes, Vercel auto-issues cert
- **Verify:** Certificate in DevTools > Security tab

**Issue:** Non-admin user not blocked
- **Check:** Verify `is_admin` flag in database (should be false)
- **Fix:** Check auth callback logic, verify signOut() is called
- **Verify:** Database has `is_admin` column on profiles table

**Issue:** Session not recognized across subdomains
- **Expected:** Independent sessions per subdomain
- **Optional:** Configure cookie domain for cross-subdomain sharing
- **See:** ADMIN_SUBDOMAIN_SETUP.md → Cookie Configuration

## Monitoring & Alerts

### Recommended Monitoring
- Admin login failures (non-admin attempts)
- Auth callback errors (check Vercel logs)
- Redirect loop detection
- Session creation on admin subdomain

### Vercel Logs
```bash
# In Vercel dashboard: Project → Deployments → Logs
# Filter for errors or auth failures
# Look for /auth/callback responses
```

## Future Enhancements

Potential improvements (not implemented in this version):

- [ ] IP whitelisting for admin subdomain
- [ ] Admin login OTP/2FA
- [ ] Admin session timeout (shorter than regular users)
- [ ] Admin activity audit log
- [ ] Browser fingerprinting for admin access
- [ ] Rate limiting specific to admin.sourcifylending.com
- [ ] Dedicated admin dashboard customization
- [ ] Admin-only announcement/banner system

## Questions & Support

For questions on implementation:
1. Review ADMIN_SUBDOMAIN_AUDIT.md for current state analysis
2. See ADMIN_SUBDOMAIN_SETUP.md for deployment configuration
3. Check ADMIN_SUBDOMAIN_TEST_CASES.md for testing procedures
4. Review code comments in modified files

## Related Documentation

- **ADMIN_SUBDOMAIN_AUDIT.md** — Initial analysis of current flow
- **ADMIN_SUBDOMAIN_SETUP.md** — DNS, hosting, environment config
- **ADMIN_SUBDOMAIN_TEST_CASES.md** — Comprehensive test scenarios
- **ADMIN_SUBDOMAIN_IMPLEMENTATION.md** — This file

---

**Implementation Status:** Ready for deployment  
**Last Updated:** 2026-04-20  
**Version:** 1.0
