# Admin Subdomain Test Cases

## Test Environment Setup

### Local Testing with /etc/hosts
To test subdomains locally, add to `/etc/hosts`:

```
# Mac/Linux: sudo nano /etc/hosts
# Windows: notepad C:\Windows\System32\drivers\etc\hosts

127.0.0.1 localhost
127.0.0.1 www.sourcifylending.local
127.0.0.1 admin.sourcifylending.local
```

Then test with `http://admin.sourcifylending.local:3000`

### Production Testing
Test with actual subdomains:
- Admin: `https://admin.sourcifylending.com`
- Main: `https://www.sourcifylending.com`

---

## Test Case 1: Admin User Login Flow

### TC1.1 Admin Login via Email/Password
**Precondition:** Test admin account exists with `is_admin=true`

**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Verify page shows admin-specific login (dark theme, shield icon, "Admin Portal" heading)
3. Enter admin email and password
4. Click "Sign In to Admin Portal"
5. System exchanges auth code
6. Auth callback checks `is_admin` flag
7. Redirects to `/admin` dashboard

**Expected Result:**
- ✅ Login succeeds
- ✅ Redirected to `/admin`
- ✅ Admin dashboard loads with full access
- ✅ Navigation menu shows all admin sections

**Actual Result:** _______________

---

## Test Case 2: Non-Admin User Blocked

### TC2.1 Regular User Cannot Access Admin Subdomain
**Precondition:** Regular user account exists with `is_admin=false`

**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Enter regular user email and password
3. Click "Sign In to Admin Portal"
4. System exchanges auth code
5. Auth callback detects `is_admin=false`
6. User is automatically signed out

**Expected Result:**
- ✅ Login appears to succeed briefly
- ✅ Callback checks admin status
- ✅ Session is terminated
- ✅ Redirected to `/admin-login?error=not_admin&email=user@example.com`
- ✅ Error message shown: "Your account does not have admin privileges"
- ✅ Email field pre-populated with rejected account

**Actual Result:** _______________

---

## Test Case 3: Existing Session Handling

### TC3.1 Already Logged In Admin Visits Admin Subdomain
**Precondition:** Admin user already logged in on main site

**Steps:**
1. Admin logs in on `https://www.sourcifylending.com/login`
2. Redirected to `/portal`
3. Admin navigates to `https://admin.sourcifylending.com`
4. System recognizes existing session
5. Checks `is_admin` status
6. Redirects to `/admin`

**Expected Result:**
- ✅ Session is recognized
- ✅ Admin check passes
- ✅ Directed to `/admin` without requiring re-login
- ✅ Session cookies work across subdomains (if configured)

**Actual Result:** _______________

### TC3.2 Already Logged In Regular User Visits Admin Subdomain
**Precondition:** Regular user already logged in on main site

**Steps:**
1. Regular user logs in on `https://www.sourcifylending.com/login`
2. Redirected to `/portal`
3. Regular user manually navigates to `https://admin.sourcifylending.com`
4. System recognizes existing session
5. Checks `is_admin` status
6. Rejects access (protected by `/admin` layout)

**Expected Result:**
- ✅ Session is recognized
- ✅ Admin check fails
- ✅ Redirected to `/dashboard` (regular dashboard)
- ✅ User remains logged in on main site
- ✅ Can still access `/portal`

**Actual Result:** _______________

---

## Test Case 4: OAuth/Google Sign-In Flow

### TC4.1 Admin OAuth Login on Admin Subdomain
**Precondition:** Test admin account linked to Google account

**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Click "Continue with Google" (if available)
3. Sign in with Google account
4. Google redirects to `/auth/callback?code=...&adminEntry=true`
5. Code is exchanged for session
6. Admin check passes
7. Redirected to `/admin`

**Expected Result:**
- ✅ OAuth flow completes
- ✅ `adminEntry=true` param preserved in callback
- ✅ Admin status verified
- ✅ Session created
- ✅ Redirected to `/admin`

**Actual Result:** _______________

### TC4.2 Non-Admin OAuth Login on Admin Subdomain
**Precondition:** Regular Google account linked to non-admin user

**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Click "Continue with Google"
3. Sign in with Google account
4. Google redirects to `/auth/callback?code=...&adminEntry=true`
5. Code is exchanged for session
6. Admin check fails
7. User is signed out
8. Redirected to `/admin-login?error=not_admin`

**Expected Result:**
- ✅ OAuth callback detects non-admin
- ✅ Session is terminated
- ✅ Error message displayed
- ✅ User can attempt another login with different account

**Actual Result:** _______________

---

## Test Case 5: Redirect Loop Prevention

### TC5.1 No Infinite Redirect on Admin Subdomain
**Precondition:** Clean browser cache

**Steps:**
1. Navigate to `https://admin.sourcifylending.com/admin-login`
2. Check browser console for redirect chain
3. Verify page loads without infinite redirects
4. Check Network tab for request sequence

**Expected Result:**
- ✅ Page loads directly
- ✅ No redirect loops detected
- ✅ Single request to `/admin-login`
- ✅ Network waterfall shows: GET /admin-login (200) → Form loads

**Actual Result:** _______________

### TC5.2 No Redirect Loop on Regular Login from Admin
**Precondition:** Clean browser

**Steps:**
1. Navigate to `https://admin.sourcifylending.com/login`
2. System detects admin subdomain + /login path
3. Redirects to `/admin-login`
4. Verify no loop back to `/login`

**Expected Result:**
- ✅ Request to `/login` redirects to `/admin-login`
- ✅ One redirect only
- ✅ Final page is `/admin-login`

**Actual Result:** _______________

---

## Test Case 6: Subdomain Detection

### TC6.1 Admin Subdomain Routing
**Precondition:** None

**Steps:**
1. Navigate to `https://admin.sourcifylending.com/login`
2. Check page rendered

**Expected Result:**
- ✅ Redirects to `/admin-login`
- ✅ Admin-themed page displayed
- ✅ Different styling/messaging than regular login

**Actual Result:** _______________

### TC6.2 Regular Subdomain Routing
**Precondition:** None

**Steps:**
1. Navigate to `https://www.sourcifylending.com/login`
2. Check page rendered

**Expected Result:**
- ✅ Regular login page displayed
- ✅ Green theme (not dark/red admin theme)
- ✅ Portal signup links visible

**Actual Result:** _______________

---

## Test Case 7: Session Cookie Configuration

### TC7.1 Cross-Subdomain Session Persistence
**Precondition:** Cookies configured with `.sourcifylending.com` domain

**Steps:**
1. Admin logs in at `https://admin.sourcifylending.com`
2. Inspect cookies in DevTools (Application → Cookies)
3. Verify cookie domain is `.sourcifylending.com`
4. Navigate to `https://www.sourcifylending.com`
5. Verify session is still active (no re-login required)

**Expected Result:**
- ✅ Cookie domain shows `.sourcifylending.com`
- ✅ Session valid across both subdomains
- ✅ User remains authenticated on main site

**Actual Result:** _______________

### TC7.2 Session Isolation (if not configured)
**Precondition:** Cookies scoped to specific subdomain

**Steps:**
1. Admin logs in at `https://admin.sourcifylending.com`
2. Navigate to `https://www.sourcifylending.com`
3. Check if re-login is required

**Expected Result:**
- ✅ New login required on different subdomain
- ✅ Each subdomain has independent session
- ✅ No cross-subdomain session leakage (more secure)

**Actual Result:** _______________

---

## Test Case 8: Error Handling

### TC8.1 Invalid Credentials
**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Enter wrong email/password
3. Click submit

**Expected Result:**
- ✅ Error toast shown: "Invalid email or password."
- ✅ User remains on login page
- ✅ Form not submitted

**Actual Result:** _______________

### TC8.2 Account Not Confirmed
**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Enter email that hasn't confirmed email
3. Click submit

**Expected Result:**
- ✅ Error toast shown: "Please confirm your email before signing in."

**Actual Result:** _______________

### TC8.3 Rate Limiting
**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Attempt login 5+ times with wrong password
3. Submit again

**Expected Result:**
- ✅ Error toast shown: "Too many attempts. Please wait a moment and try again."

**Actual Result:** _______________

---

## Test Case 9: Admin-Specific Features

### TC9.1 Admin Page Access
**Precondition:** Admin user logged in on admin subdomain

**Steps:**
1. Navigate to `https://admin.sourcifylending.com/admin` (or after login)
2. Verify admin dashboard loads
3. Check all admin menu items are accessible

**Expected Result:**
- ✅ Admin dashboard displays
- ✅ All admin sections accessible (Members, CRM, Dialer, etc.)
- ✅ Non-admin features not visible

**Actual Result:** _______________

### TC9.2 Admin Layout Protection
**Precondition:** Non-admin user somehow has session

**Steps:**
1. Manually navigate to `https://www.sourcifylending.com/admin` with non-admin session
2. System checks `is_admin` flag in layout

**Expected Result:**
- ✅ Redirected to `/dashboard`
- ✅ Access denied message shown (if any)

**Actual Result:** _______________

---

## Test Case 10: Messaging & UX

### TC10.1 Admin Login Page Messaging
**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Check page headings and descriptions

**Expected Result:**
- ✅ Heading: "Admin Portal"
- ✅ Subtitle: "Restricted access for admins only"
- ✅ Shield icon displayed
- ✅ Dark theme (professional/secure appearance)
- ✅ Warning: "Admin access only. Non-admin accounts will be rejected."
- ✅ No signup link (admins should be created by system)

**Actual Result:** _______________

### TC10.2 Non-Admin Error Message
**Steps:**
1. Attempt login as non-admin on admin subdomain
2. Wait for error redirect

**Expected Result:**
- ✅ Error message: "Your account does not have admin privileges"
- ✅ Email field pre-populated with rejected email
- ✅ Link to main site provided

**Actual Result:** _______________

---

## Test Case 11: Navigation Between Sites

### TC11.1 Link from Admin to Main Site
**Steps:**
1. On `https://admin.sourcifylending.com`
2. Click "Back to main site" link
3. Should navigate to `https://www.sourcifylending.com`

**Expected Result:**
- ✅ Navigation works
- ✅ Absolute URL used (not relative)
- ✅ Main site loads correctly

**Actual Result:** _______________

### TC11.2 Admin Link from Main Site
**Steps:**
1. On `https://www.sourcifylending.com/admin`
2. Verify no direct "Switch to admin subdomain" link (intentional)
3. Admin users access /admin via current site

**Expected Result:**
- ✅ No links to admin.sourcifylending.com from main site
- ✅ Admin users can still access /admin on current site
- ✅ Subdomain is entry point for new admin logins, not for switching

**Actual Result:** _______________

---

## Test Case 12: Security Audits

### TC12.1 Session Token Validation
**Steps:**
1. Login as admin on admin subdomain
2. Open DevTools → Network
3. Check Authorization header on API requests
4. Verify token is valid Supabase JWT

**Expected Result:**
- ✅ Authorization header present
- ✅ Bearer token format correct
- ✅ Token contains user ID and admin claim (if applicable)

**Actual Result:** _______________

### TC12.2 HTTPS Enforcement
**Steps:**
1. Attempt to visit `http://admin.sourcifylending.com` (without https)
2. Should redirect to HTTPS

**Expected Result:**
- ✅ Automatic redirect to HTTPS
- ✅ Green lock icon in address bar
- ✅ No mixed content warnings

**Actual Result:** _______________

---

## Regression Testing

### RT1: Main Site Login Still Works
**Steps:**
1. Navigate to `https://www.sourcifylending.com/login`
2. Login as regular user
3. Verify redirect to `/portal`

**Expected Result:**
- ✅ Regular login unaffected
- ✅ Redirects to `/portal`
- ✅ Dashboard loads correctly

**Actual Result:** _______________

### RT2: Admin Access from Main Site
**Steps:**
1. Navigate to `https://www.sourcifylending.com/admin`
2. Login as admin if not already
3. Verify admin dashboard loads

**Expected Result:**
- ✅ Admin can still access `/admin` on main site
- ✅ No changes to existing admin flow
- ✅ Admin features fully functional

**Actual Result:** _______________

### RT3: Signup Flow Unaffected
**Steps:**
1. Navigate to `https://www.sourcifylending.com/signup`
2. Complete signup
3. Verify redirect to portal

**Expected Result:**
- ✅ Signup works
- ✅ New account created
- ✅ Redirect to portal works

**Actual Result:** _______________

---

## Performance Testing

### PT1: Load Time
**Steps:**
1. Navigate to `https://admin.sourcifylending.com`
2. Measure page load time
3. Check Lighthouse score

**Expected Result:**
- ✅ Page loads in < 2 seconds
- ✅ Lighthouse score > 80
- ✅ No console errors

**Actual Result:** _______________

### PT2: Auth Callback Speed
**Steps:**
1. Complete OAuth login on admin subdomain
2. Measure time from callback to redirect

**Expected Result:**
- ✅ Callback completes in < 1 second
- ✅ Admin check doesn't cause delay
- ✅ Smooth user experience

**Actual Result:** _______________

---

## Test Results Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC1.1 Admin Login | ⬜ | |
| TC2.1 Non-Admin Blocked | ⬜ | |
| TC3.1 Session Recognized | ⬜ | |
| TC3.2 Regular User Rejected | ⬜ | |
| TC4.1 OAuth Admin | ⬜ | |
| TC4.2 OAuth Non-Admin | ⬜ | |
| TC5.1 No Redirect Loop | ⬜ | |
| TC5.2 Login Redirect | ⬜ | |
| TC6.1 Admin Subdomain | ⬜ | |
| TC6.2 Regular Subdomain | ⬜ | |
| TC7.1 Cross-Subdomain Session | ⬜ | |
| TC7.2 Session Isolation | ⬜ | |
| TC8.1 Invalid Credentials | ⬜ | |
| TC8.2 Not Confirmed | ⬜ | |
| TC8.3 Rate Limiting | ⬜ | |
| TC9.1 Admin Page Access | ⬜ | |
| TC9.2 Admin Layout Protection | ⬜ | |
| TC10.1 Login Page Messaging | ⬜ | |
| TC10.2 Error Message | ⬜ | |
| TC11.1 Navigation Works | ⬜ | |
| TC11.2 No Subdomain Switch | ⬜ | |
| TC12.1 Session Validation | ⬜ | |
| TC12.2 HTTPS Enforcement | ⬜ | |
| RT1 Main Site Login | ⬜ | |
| RT2 Admin from Main | ⬜ | |
| RT3 Signup Unaffected | ⬜ | |
| PT1 Load Time | ⬜ | |
| PT2 Callback Speed | ⬜ | |

Legend: ⬜ = Not Tested, 🟢 = Passed, 🟡 = Partial, 🔴 = Failed

---

## Test Sign-Off

**Tested By:** _______________  
**Date:** _______________  
**Overall Status:** _______________  
**Issues Found:** _______________  
**Sign-Off:** _______________
