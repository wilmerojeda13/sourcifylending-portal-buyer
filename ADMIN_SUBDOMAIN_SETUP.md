# Admin Subdomain Setup Guide

## Overview
This document covers the DNS, hosting, environment, and cookie configuration needed to support the admin subdomain entry point.

## DNS Configuration

### Required DNS Records
Add the following DNS record to your domain registrar:

```
Type:    CNAME
Name:    admin
Value:   cname.vercel.com (or your Vercel deployment domain)
```

**OR** if using A records:
```
Type:    A
Name:    admin
Value:   76.76.19.21 (Vercel's IP)
```

**Verification:**
```bash
# Should resolve to Vercel
nslookup admin.sourcifylending.com
```

## Vercel Hosting Configuration

### Automatic Subdomain Support
Vercel automatically supports all subdomains without additional configuration. Once the DNS record is added:

1. **Wait for DNS propagation** (can take up to 24 hours, usually minutes)
2. **SSL certificate** will be auto-issued by Vercel
3. **Wildcard domains** are supported, but explicit CNAME is recommended

### Vercel Project Settings (if needed)
In Vercel dashboard → Project Settings → Domains:
- Domain: `admin.sourcifylending.com`
- Status: Should show as verified once DNS is set

## Cookie & Session Configuration

### Supabase Cookie Domain
For cross-subdomain session sharing, configure the Supabase cookie domain:

**Current behavior:** Cookies are scoped to the exact domain (e.g., only www.sourcifylending.com)

**Required change:** Update cookie domain to `.sourcifylending.com` (note the leading dot)

#### Implementation in Code
The Supabase SSR client automatically sets cookies based on request domain. To enable cross-subdomain:

```typescript
// In createServerClient calls:
{
  cookies: {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        // Force cookie domain to allow subdomains
        const updatedOptions = {
          ...options,
          domain: '.sourcifylending.com', // Add this
          sameSite: 'lax',
          secure: true,
        }
        cookieStore.set(name, value, updatedOptions)
      })
    },
  },
}
```

**However:** The current implementation relies on Supabase's cookie handling. To enable cross-subdomain:

1. Set environment variable: `NEXT_PUBLIC_SUPABASE_COOKIE_DOMAIN=.sourcifylending.com`
2. OR configure in Supabase project settings → Authentication → Cookie settings

### Alternative: Session-Only on Admin Subdomain
If cross-subdomain cookies are problematic:
- Keep separate auth sessions per subdomain
- Users must log in once per subdomain
- Admin login is independent from main site

This is **simpler and more secure** for sensitive admin access.

## Environment Variables

### Required Environment Variables
```bash
# Admin domain configuration
NEXT_PUBLIC_ADMIN_URL=https://admin.sourcifylending.com

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional: Force cookie domain for cross-subdomain auth
NEXT_PUBLIC_SUPABASE_COOKIE_DOMAIN=.sourcifylending.com
```

### Vercel Environment Variables
In Vercel dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_ADMIN_URL=https://admin.sourcifylending.com
# (Add in Production environment)
```

## Deployment Checklist

- [ ] Add DNS CNAME record for `admin.sourcifylending.com`
- [ ] Wait for DNS propagation (verify with nslookup)
- [ ] Verify SSL certificate is issued (green lock in browser)
- [ ] Add `NEXT_PUBLIC_ADMIN_URL` environment variable in Vercel
- [ ] Deploy the updated code to production
- [ ] Test admin login flow
- [ ] Test non-admin rejection flow
- [ ] Verify redirect loops don't occur
- [ ] Test session persistence (optional, depends on cookie config)

## Testing URLs

### Admin Entry Point
```
https://admin.sourcifylending.com/
https://admin.sourcifylending.com/admin-login
```

### Admin with OAuth
```
https://admin.sourcifylending.com/auth/callback?code=...&adminEntry=true
```

### Main Site
```
https://www.sourcifylending.com/login
https://www.sourcifylending.com/portal
```

## Troubleshooting

### SSL Certificate Not Issued
- **Issue:** Browser shows "NET::ERR_CERT_AUTHORITY_INVALID"
- **Fix:** Wait 10-20 minutes for Vercel to issue certificate, clear browser cache

### DNS Not Resolving
```bash
# Check DNS propagation
nslookup admin.sourcifylending.com

# Check CNAME target
nslookup cname.vercel.com

# Or use online tool: whatsmydns.net
```

### Session Not Persisting Across Subdomains
- **Issue:** User logs in on admin.sourcifylending.com, but visits www and must log in again
- **Reason:** Browser security prevents cross-domain cookie access
- **Solution:** See "Cookie Domain Configuration" section above
- **Alternative:** Accept this behavior for enhanced security

### Infinite Redirect Loops
- **Issue:** Visiting admin.sourcifylending.com redirects infinitely
- **Fix:** Verify `isAdminSubdomain()` logic in middleware, clear browser cache

### Admin Check Not Working
- **Issue:** Non-admin user can access /admin
- **Reason:** `is_admin` flag may be null/false
- **Fix:** Verify profile exists in database, check admin layout logic

## Security Considerations

✅ **What's Secure:**
- Admin subdomain enforces `is_admin` check in auth callback
- Non-admin users are signed out and blocked
- HTTPS/SSL required (enforced by Vercel)
- Cookies use `secure` and `sameSite=lax` flags
- Session tokens validated on every request

⚠️ **What to Monitor:**
- Do not allow wildcard subdomains (e.g., *.sourcifylending.com) to share cookies
- Ensure `.sourcifylending.com` cookie domain doesn't leak to untrusted subdomains
- Regularly audit admin access logs
- Consider IP whitelisting for admin.sourcifylending.com if additional security needed

## Production Deployment

### Pre-deployment Verification
```bash
# 1. Test locally (requires local DNS or /etc/hosts entry)
# 2. Run full test suite
npm run test

# 3. Build production
npm run build

# 4. Check for build errors
```

### Post-deployment Verification
1. DNS propagation: `nslookup admin.sourcifylending.com`
2. HTTPS/SSL: Visit https://admin.sourcifylending.com (should show green lock)
3. Admin login: Use test admin account
4. Non-admin rejection: Use regular user account
5. Redirect behavior: Verify /login redirects to /admin-login on admin subdomain
6. No infinite loops: Verify auth flow completes without redirects cycling

## Rollback Plan

If issues arise:
1. Remove admin.sourcifylending.com DNS record
2. Admin users can still access /admin route on main domain
3. Previous behavior restored
4. No data loss, fully reversible

## Related Files

- `src/middleware.ts` — Subdomain detection and routing
- `src/app/admin-login/page.tsx` — Admin login page
- `src/app/admin-login/AdminLoginForm.tsx` — Admin login form
- `src/app/auth/callback/route.ts` — OAuth callback with admin check
- `src/lib/auth-routing.ts` — Auth routing utilities
- `src/lib/site-config.ts` — Site URL configuration
