# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- Parent project has `.env.local` with Supabase credentials

## Setup (One-Time)

```bash
# 1. Navigate to the agent directory
cd /automated_agent

# 2. Install dependencies
npm install

# 3. Verify parent .env.local exists
cat ../.env.local | grep SUPABASE
```

## Run the Agent

```bash
# Process leads
npm run process
```

## Expected Output

```
═══════════════════════════════════════════════════════════
  SourcifyLending Lead Processor Agent
═══════════════════════════════════════════════════════════
  Started: 2026-01-15T10:30:00.000Z
  Database: https://your-project.supabase.co
───────────────────────────────────────────────────────────
  ✓ Database connection verified

📧 Scanning for professional emails...
  Found 150 leads with emails
  ✓ Professional email detected: ceo@acme-corp.com (Lead: John Doe)
    ✓ Tagged as High Priority
  ✓ Professional email detected: contact@lawfirm.io (Lead: Smith & Associates)
    ✓ Tagged as High Priority

🎯 Creating follow-up tasks for Interested leads...
  Found 12 interested leads
  ✓ Created follow-up task for Sarah Johnson (Due: 1/16/2026)
  ✓ Created follow-up task for TechStart Inc (Due: 1/16/2026)

═══════════════════════════════════════════════════════════
  EXECUTION SUMMARY
═══════════════════════════════════════════════════════════
  Duration: 2.34s
───────────────────────────────────────────────────────────
  PROFESSIONAL EMAIL SCAN:
    Leads processed: 150
    High Priority flagged: 23
───────────────────────────────────────────────────────────
  INTERESTED LEAD TASKS:
    Leads processed: 12
    Tasks created: 12
───────────────────────────────────────────────────────────
═══════════════════════════════════════════════════════════
```

## Troubleshooting

### "Database connection failed"
- Verify `.env.local` exists in parent directory
- Check `SUPABASE_SERVICE_ROLE_KEY` is valid
- Ensure network access to Supabase URL

### "Cannot find module"
- Run `npm install` first
- Verify Node.js version 18+

### Permission Denied
- Service role key must have admin privileges
- Check Supabase RLS policies allow service role access

## Scheduling

### Using Cron (Linux/Mac)
```bash
# Edit crontab
crontab -e

# Add line to run every hour
0 * * * * cd /path/to/automated_agent && npm run process >> /var/log/lead-processor.log 2>&1
```

### Using Windows Task Scheduler
1. Create Task → Name: "Lead Processor"
2. Triggers → New → Daily → Repeat every 1 hour
3. Actions → New → Program: `node` → Arguments: `"./node_modules/tsx/dist/cli.mjs" lead-processor.ts`
4. Working directory: `C:\path\to\automated_agent`

### Using Node.js Scheduler (Alternative)
Install `node-cron` for in-process scheduling:
```bash
npm install node-cron
```

Add to lead-processor.ts:
```typescript
import cron from 'node-cron'

// Run every hour
cron.schedule('0 * * * *', () => {
  console.log('Scheduled run starting...')
  main()
})
```

## Support

- Review logs in console output
- Check `crm_audit_logs` table for action history
- Verify `crm_tags` and `crm_tasks` tables for results
