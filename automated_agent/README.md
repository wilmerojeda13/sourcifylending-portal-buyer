# SourcifyLending Lead Processor Agent

An automated agent that processes CRM leads in the SourcifyLending portal.

## Purpose

This agent performs two key actions on the CRM database:

1. **Professional Email Detection**: Scans the `crm_leads` table for leads with professional email domains (non-gmail/yahoo/outlook/etc.) and automatically flags them with a "High Priority" tag.

2. **Interested Lead Task Creation**: Automatically creates "Follow-Up" tasks for any lead currently marked as 'interested' in the CRM, ensuring no interested lead falls through the cracks.

## Tech Stack

- **Database**: Supabase (PostgreSQL)
- **Language**: TypeScript (Node.js 18+)
- **Key Dependencies**:
  - `@supabase/supabase-js` - Database client
  - `dotenv` - Environment variable management
  - `tsx` - TypeScript execution

## Database Schema Dependencies

The agent interacts with the following tables:

### Tables Used
- `crm_leads` - Main CRM leads data
- `crm_tags` - Tag definitions (creates 'High Priority' tag if missing)
- `crm_tag_links` - Lead-to-tag associations
- `crm_tasks` - Task creation for follow-ups
- `crm_audit_logs` - Audit trail for all automated actions

### Key Schema Requirements
- Leads must have: `id`, `email`, `is_archived`, `stage`, `last_call_outcome`
- Tasks use `created_source` constraint: ('manual', 'disposition', 'automation', 'system', 'calendar')
- Tags use `slug` unique constraint

## Environment Variables

The agent reads from the parent project's `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ **IMPORTANT**: Uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses Row Level Security. Never expose this key in client-side code.

## Installation

```bash
# From within the automated_agent directory
cd /automated_agent

# Install dependencies
npm install
```

## Usage

### Run the processor
```bash
npm run process
```

### Run in dry-run mode (logs only, no DB changes)
```bash
npm run process:dry
```

### Run tests
```bash
npm test
```

## How It Works

### Professional Email Detection

Emails are classified as "consumer" if they match these domains:
- gmail.com, yahoo.com, hotmail.com, outlook.com
- live.com, aol.com, icloud.com, protonmail.com
- And 10+ other common consumer providers

All other domains are considered "professional" (business domains).

### Interested Lead Detection

A lead is considered "interested" if:
- `stage` = 'interested', OR
- `last_call_outcome` = 'Interested'

The agent checks for existing pending tasks to avoid duplicates.

## Output

The agent provides detailed console output:
- Database connection status
- Processing progress for each lead
- Summary statistics (processed, flagged, tasks created)
- Error details (if any)

## Scheduling

This agent is designed to run on a schedule. Example cron:
```cron
# Run every hour
0 * * * * cd /path/to/automated_agent && npm run process >> /var/log/lead-processor.log 2>&1
```

## Architecture Decisions

1. **Service Role Key**: Required because the agent needs to:
   - Create tags (admin function)
   - Create tasks on behalf of users
   - Write audit logs across all leads

2. **Idempotent Operations**: 
   - Checks for existing tags before creating
   - Checks for existing tasks before creating
   - Safe to run multiple times without duplication

3. **Audit Trail**: All actions logged to `crm_audit_logs` with:
   - `performed_by_name`: 'Lead Processor Agent'
   - `source`: 'lead-processor-agent'
   - Full metadata for traceability

## Error Handling

The agent handles these error scenarios:
- Database connection failures (fatal)
- Missing environment variables (fatal)
- Tag creation failures (logged, continues)
- Task creation failures (logged, continues)
- Constraint violations (logged, continues)

## CRM/Dialer Separation

Per SourcifyLending architecture:
- **This agent only touches CRM tables** (`crm_leads`, `crm_tasks`, etc.)
- It does NOT modify `dialer_raw_leads` or dialer campaign tables
- Raw leads remain in the Dialer; promoted leads in CRM are processed

## License

Internal use only - SourcifyLending
