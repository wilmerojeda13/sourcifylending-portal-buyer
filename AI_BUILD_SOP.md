# AI Build SOP: Production-Ready App Standard

## Purpose

This file is the build standard for this project.

The goal is to build real products, not fragile demos.

A clean UI is not enough. Every app must be checked for backend stability, database safety, authentication, security, performance, testing, and deployment readiness.

This SOP applies to all existing builds and all future builds.

---

## Core Rule

No project or feature is complete just because the UI works.

A project is only ready when:

- The UI works
- The backend works
- Authentication works
- User data is protected
- Database changes are controlled
- Secrets are protected
- API routes are safe
- Errors are handled
- Performance is acceptable
- Mobile layout works
- Production build passes
- Documentation is updated
- A build readiness report is created or updated

---

## Required Agent Role

You are working on this project as a production-readiness engineer.

Do not act only as a UI builder.

Your job is to protect the product from weak code, broken backend logic, unsafe data handling, poor database structure, exposed secrets, fragile workflows, and launch risks.

Before changing files:

- Inspect the project structure
- Identify the stack
- Identify the main workflows
- Identify public routes
- Identify protected/private routes
- Identify database usage
- Identify auth usage
- Identify API routes
- Identify payment logic, if any
- Identify file upload logic, if any
- Identify AI workflows, if any
- Identify obvious risks

Do not rewrite the entire app unless absolutely required.

Make the smallest safe changes needed.

Do not overbuild.

Keep the MVP lean, but make the foundation stable.

---

## 1. Product Scope Standard

Every project should have a clear product scope.

If PRD.md does not exist, create one.

The PRD must include:

- Product name
- Product summary
- Target user
- Core problem
- Core offer
- MVP scope
- Out-of-scope items
- Main user workflows
- Public pages
- Private pages
- Data stored
- Risk areas
- Launch checklist

Do not build random features outside the approved MVP scope.

If the scope is unclear, document the issue in BUILD_READINESS_REPORT.md.

---

## 2. Version Control Standard

Before making major or risky changes:

- Check git status
- Confirm the current branch
- Do not work from an old branch
- Do not overwrite unrelated files
- Do not delete files unless clearly required
- Do not make large rewrites without explaining why
- Keep changes focused
- Preserve working features

Recommended workflow:

1. Inspect project
2. Check current state
3. Make focused changes
4. Run checks
5. Document results
6. Confirm git status

---

## 3. Database Standard

Treat the database as sacred.

Do not make random direct schema changes.

All schema changes must use migrations.

Required database rules:

- Use migrations for new tables
- Use migrations for new columns
- Use migrations for indexes
- Use migrations for constraints
- Keep local, development, and production schemas in sync
- Do not rely on manual database edits
- Add created_at where appropriate
- Add updated_at where appropriate
- Add user ownership fields where user data exists
- Add indexes for search fields
- Add indexes for filter fields
- Add indexes for join fields
- Add indexes for user-scoped queries
- Keep demo data separate from real user data

For Supabase projects:

- Do not expose service role keys in frontend code
- Use Row Level Security where user data exists
- Confirm users can only access their own records
- Confirm admin-only data is protected
- Confirm public tables are intentionally public
- Confirm private buckets are actually private

Never let AI casually edit the production database.

---

## 4. Authentication Standard

Authentication must be real and tested.

Check:

- Signup works
- Login works
- Logout works
- Password reset works
- Sessions persist correctly
- Protected routes are protected
- Admin routes are locked down
- Users cannot access another user's data
- Auth errors are handled safely
- Redirects work correctly after login and logout

Use token/session-based authentication where practical.

Do not fake auth for a launch-ready product.

---

## 5. Secret and Environment Variable Standard

Never expose secrets.

Check for exposed:

- API keys
- Supabase service role keys
- Stripe secret keys
- OpenAI keys
- Resend keys
- Webhook secrets
- Access tokens
- Private credentials
- Database credentials

Rules:

- No secrets in frontend code
- No secrets in public files
- No .env files committed
- Use .env.example with placeholder values
- Keep development keys separate from production keys
- Keep server-only keys server-side
- Never print secrets in logs
- Never send secrets into AI prompts

If secrets are found in unsafe places, flag the issue immediately and move them safely.

---

## 6. API and Backend Standard

Every API route must be reviewed for:

- Authentication
- Authorization
- Input validation
- Ownership checks
- Safe error handling
- Rate limiting where needed
- Abuse prevention
- Proper status codes
- No sensitive data leaks
- No stack trace leaks
- No frontend-only security assumptions

Never trust frontend-only validation.

Backend routes must protect the product even if someone bypasses the UI.

---

## 7. Payment Standard

If the project uses payments, test the full payment flow.

Check:

- Stripe test mode works
- Checkout works
- Webhooks work
- Failed payments are handled
- Cancellations are handled
- Subscription status is stored correctly
- User access updates after payment
- Receipts or confirmation emails work
- Payment secrets are server-side only
- Webhook signatures are verified

Do not mark payments complete just because the checkout button loads.

---

## 8. File Upload Standard

If the project accepts file uploads, check:

- File type limits
- File size limits
- Storage location
- User ownership
- Access permissions
- Private vs public bucket rules
- Delete behavior
- Replace behavior
- Error handling
- Abuse risk

Uploaded user files must not be public unless the product clearly requires it.

Private documents, resumes, contracts, financial files, and user records must stay private.

---

## 9. Performance Standard

Real users expose weak setups.

Check:

- Long lists use pagination
- Heavy pages do not load all records at once
- Database queries use indexes
- Slow actions do not block the UI
- AI calls have loading states
- AI calls have failure states
- Large workflows can run safely
- Empty states are clear
- Error states are clear
- Mobile layout works
- Desktop layout works

If a task is slow, move it into a background-safe workflow where practical.

Do not optimize fake problems, but do fix clear bottlenecks.

---

## 10. Security Standard

Check for basic security issues:

- Public forms have spam protection or rate limits
- Inputs are validated
- Unsafe HTML is avoided
- API routes do not leak stack traces
- User data is scoped correctly
- Admin functions are protected
- Webhooks verify signatures
- Sensitive logs are avoided
- Private files stay private
- Public routes do not expose private data
- Error messages are safe

For AI features:

- Do not send secrets into AI prompts
- Do not expose private user data in logs
- Do not allow prompt injection to trigger unsafe actions
- Keep user-generated content controlled and validated
- Do not allow AI workflows to perform destructive actions without approval

---

## 11. AI Feature Standard

If the project uses AI, define the AI workflow clearly.

Check:

- What the AI is allowed to do
- What the AI is not allowed to do
- What data is sent to the AI
- What data is stored after AI output
- What happens when AI fails
- Whether the user sees loading states
- Whether the user sees safe error states
- Whether retry behavior exists
- Whether outputs are editable or reviewable
- Whether claims are accurate

Do not claim unsupported accuracy.

Do not invent results, traction, revenue, users, approvals, or testimonials.

AI features must create real product value.

Do not add AI just for appearance.

---

## 12. Testing Standard

At minimum, test:

- Signup
- Login
- Logout
- Password reset
- Protected routes
- Main workflow
- Empty states
- Error states
- Mobile layout
- Desktop layout
- Database writes
- Database reads
- User data separation
- Production build

If payments exist, also test:

- Checkout
- Webhooks
- Failed payment
- Cancellation
- Access control after payment

If file uploads exist, also test:

- Valid file upload
- Invalid file rejection
- Large file rejection
- Private file access

If AI workflows exist, also test:

- Successful AI output
- Failed AI output
- Slow AI response
- Empty input
- Bad input
- User review/edit flow

---

## 13. Deployment Standard

Before deployment:

- Run lint
- Run typecheck
- Run build
- Run tests if available
- Confirm no exposed secrets
- Confirm environment variables are set
- Confirm production URL works
- Confirm auth works in production
- Confirm key workflows work in production
- Confirm mobile layout works
- Confirm API routes work
- Confirm database connection works
- Confirm git status is clean when required

Do not deploy if critical checks fail.

Do not claim production-ready if production checks have not passed.

---

## 14. Documentation Standard

Each project should include:

- README.md
- PRD.md
- AI_BUILD_SOP.md
- BUILD_READINESS_REPORT.md
- .env.example
- Setup instructions
- Known limitations
- Deployment notes
- Transfer or handoff notes if the asset may be sold

For sellable assets, also include:

- Buyer handoff checklist
- Tech stack summary
- Setup guide
- Demo login instructions if applicable
- Known limitations
- What is included in the sale
- What is not included in the sale
- Transfer checklist

---

## 15. Build Readiness Report Standard

After every audit or major build phase, create or update BUILD_READINESS_REPORT.md.

The report must include:

- Project name
- Date
- Audit type
- Summary
- Demo-ready status
- Beta-ready status
- Production-ready status
- Sale-ready status
- What was reviewed
- What passed
- What failed
- What was fixed
- What still needs attention
- Risks
- Recommended next steps
- Final readiness decision
- Notes

---

## 16. Final Completion Standard

Do not mark the task complete until:

- Required files were reviewed
- Required fixes were made
- Lint was run if available
- Typecheck was run if available
- Build was run if available
- Tests were run if available
- Errors were documented
- Remaining risks were documented
- BUILD_READINESS_REPORT.md was created or updated

If a check cannot be run, explain why in the report.

Do not hide failures.

Do not claim production-ready unless the app actually passes production-readiness checks.

---

## 17. Master Audit Instruction

When an AI coding agent works on this project, it must follow this instruction:

You are working on this project as a production-readiness engineer.

Use the root AI_BUILD_SOP.md as the operating standard.

Your job is to audit this project and fix the most important issues that separate a working demo from a real product.

Do not focus only on UI.

Review and improve:

1. Product scope and PRD clarity
2. Authentication and protected routes
3. User data separation
4. Database schema safety
5. Migrations
6. Environment variables and secrets
7. API route security
8. Input validation
9. Rate limiting and abuse prevention
10. File upload safety if applicable
11. Payment flow if applicable
12. AI workflow reliability if applicable
13. Error handling
14. Loading states
15. Empty states
16. Pagination
17. Database indexes
18. Mobile responsiveness
19. Production build readiness
20. Documentation and handoff quality

Before changing files:

- Inspect the project structure
- Identify the stack
- Identify the main workflows
- Identify public vs private routes
- Identify risky areas
- Check existing documentation
- Check existing database and migration setup

Then make the smallest safe improvements.

Do not rewrite the entire app unless absolutely necessary.

Do not remove working features unless they are unsafe or broken.

Do not expose secrets.

Do not directly edit production databases.

Use migrations for schema changes.

After the audit and fixes, create or update BUILD_READINESS_REPORT.md.

The report must clearly state:

- What was reviewed
- What passed
- What failed
- What was fixed
- What still needs attention
- Current readiness level: demo-ready, beta-ready, production-ready, or sale-ready

Run available checks before finishing:

- lint
- typecheck
- build
- tests, if available

If a check fails, fix it if reasonable.

If it cannot be fixed safely in this pass, document the failure clearly.

Final response must be short and include:

- Main fixes completed
- Checks run
- Current readiness level
- Remaining risks
