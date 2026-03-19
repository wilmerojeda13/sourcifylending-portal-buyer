import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logMemoryEvent } from '@/lib/ai-memory'

// ─── Letter generation logic ──────────────────────────────────────────────────
function generateDisputeLetter(params: {
  firstName: string
  bureau: string
  disputeType: string
  itemDisputed: string
  incorrectInformation: string
  correctInformation: string
  date: string
}): string {
  const { firstName, bureau, disputeType, itemDisputed, incorrectInformation, correctInformation, date } = params

  const bureauAddress: Record<string, string> = {
    'Experian':   'Experian\nP.O. Box 4500\nAllen, TX 75013',
    'Equifax':    'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374',
    'TransUnion': 'TransUnion LLC Consumer Dispute Center\nP.O. Box 2000\nChester, PA 19016',
  }

  return `${date}

${bureauAddress[bureau] ?? bureau}

RE: Formal Dispute of Inaccurate Information Under FCRA §1681i

Dear ${bureau} Dispute Team,

I am writing to formally dispute inaccurate information appearing on my credit report in accordance with my rights under the Fair Credit Reporting Act (FCRA), specifically Section 1681i, which requires consumer reporting agencies to investigate disputed items within 30 days of receipt.

DISPUTE DETAILS
Category: ${disputeType}
Item Being Disputed: ${itemDisputed}
Incorrect Information on File: ${incorrectInformation}
Correct Information: ${correctInformation}

Under FCRA §1681i, I request that you investigate this item and correct or remove any inaccurate, incomplete, or unverifiable information. Per FCRA §1681e(b), you are required to maintain and report accurate information. Per FCRA §1681s-2, any furnisher of inaccurate information must correct the record.

Please provide written confirmation of:
1. The receipt of this dispute
2. The completion of your investigation
3. Any corrections made to my credit file
4. The name, address, and contact information of any data furnisher contacted

If you cannot verify the accuracy of this information within the statutory 30-day period, the item must be deleted from my credit report.

I am prepared to provide additional supporting documentation if required. Please notify me of the outcome of your investigation at the address on file.

Sincerely,

${firstName}
[Your Address]
[City, State, ZIP]
[Your Phone Number]
[Your Email Address]

Enclosures: [List any supporting documents attached]

This dispute is submitted pursuant to FCRA §1681i, §1681e(b), and §1681s-2.`
}

function generateEscalationLetter(params: {
  firstName: string
  bureau: string
  itemDisputed: string
  originalDisputeDate: string
  date: string
  letterType: 'cfpb' | 'method_of_verification' | 'followup'
}): string {
  const { firstName, bureau, itemDisputed, originalDisputeDate, date, letterType } = params

  if (letterType === 'cfpb') {
    return `${date}

Consumer Financial Protection Bureau
1700 G Street, NW
Washington, DC 20552

RE: Formal CFPB Complaint Against ${bureau} — Unresolved Credit Dispute

Dear CFPB,

I am filing this formal complaint against ${bureau} for failure to properly investigate and resolve a credit dispute I submitted on ${originalDisputeDate}, in violation of my rights under the Fair Credit Reporting Act (FCRA) §1681i.

DISPUTE SUMMARY
Bureau: ${bureau}
Item Disputed: ${itemDisputed}
Original Dispute Date: ${originalDisputeDate}

Despite submitting a formal dispute, ${bureau} has failed to:
1. Complete a proper investigation within the 30-day statutory period (FCRA §1681i)
2. Provide adequate verification of the disputed item
3. Correct or remove inaccurate information as required

I respectfully request that the CFPB investigate this matter and take appropriate action to enforce compliance with the FCRA.

Sincerely,
${firstName}`
  }

  if (letterType === 'method_of_verification') {
    return `${date}

${bureau}

RE: Request for Method of Verification — FCRA §1681i(a)(7)

Dear ${bureau} Dispute Team,

I am writing to exercise my right under FCRA §1681i(a)(7) to request the method of verification used in your recent investigation of my dispute filed on ${originalDisputeDate}.

The disputed item is: ${itemDisputed}

Per FCRA §1681i(a)(7), I have the right to know:
1. The procedure used to investigate my dispute
2. The business name, address, and phone number of any furnisher contacted
3. Any documentation obtained from the furnisher during the investigation

Please provide this information within 15 days of receipt of this letter.

Sincerely,
${firstName}`
  }

  // Follow-up
  return `${date}

${bureau}

RE: Follow-Up Dispute — Prior Dispute Submitted ${originalDisputeDate} — FCRA §1681i

Dear ${bureau} Dispute Team,

I am following up on a dispute I submitted on ${originalDisputeDate} regarding: ${itemDisputed}

This item remains inaccurate on my credit report. As the 30-day investigation period under FCRA §1681i has passed without proper resolution, I am resubmitting this dispute and demanding immediate action.

Per FCRA §1681e(b), you are required to maintain maximum possible accuracy. Per FCRA §1681i, if you cannot verify the accuracy of this information, it must be deleted from my credit report immediately.

I expect written confirmation of the outcome within 30 days.

Sincerely,
${firstName}`
}

// ─── GET — list disputes for authenticated user ───────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('credit_disputes')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'Deleted')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ disputes: data })
}

// ─── POST — create a new dispute and generate a letter ───────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { bureau, dispute_type, item_disputed, incorrect_information, correct_information } = body

  if (!bureau || !dispute_type || !item_disputed || !incorrect_information || !correct_information) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const firstName = (profile?.full_name ?? user.email ?? 'Client').split(' ')[0]
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const letter = generateDisputeLetter({
    firstName,
    bureau,
    disputeType: dispute_type,
    itemDisputed: item_disputed,
    incorrectInformation: incorrect_information,
    correctInformation: correct_information,
    date: dateStr,
  })

  const now = new Date().toISOString()
  const { data: dispute, error } = await supabase
    .from('credit_disputes')
    .insert({
      user_id: user.id,
      bureau,
      dispute_type,
      item_disputed,
      incorrect_information,
      correct_information,
      generated_letter: letter,
      status: 'Generated',
      date_generated: now,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log memory event so the AI knows a dispute was created
  logMemoryEvent(user.id, 'dispute_generated', `Dispute letter generated for ${bureau}`, `${dispute_type}: ${item_disputed}`, dispute.id)

  return NextResponse.json({ dispute }, { status: 201 })
}

// ─── PATCH — update dispute status / mark as sent / add notes ────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, status, response_notes, escalation_type } = body

  if (!id) return NextResponse.json({ error: 'Dispute ID required' }, { status: 400 })

  // Fetch existing dispute (owned by this user)
  const { data: existing } = await supabase
    .from('credit_disputes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (status) {
    updates.status = status
    if (status === 'Sent' && !existing.date_sent) {
      const sentDate = new Date()
      const deadline = new Date(sentDate)
      deadline.setDate(deadline.getDate() + 30)
      updates.date_sent = sentDate.toISOString()
      updates.investigation_deadline = deadline.toISOString()
    }
  }
  if (response_notes !== undefined) updates.response_notes = response_notes

  // Generate escalation letter if requested
  if (escalation_type && ['cfpb', 'method_of_verification', 'followup'].includes(escalation_type)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const firstName = (profile?.full_name ?? user.email ?? 'Client').split(' ')[0]
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const originalDisputeDate = existing.date_sent
      ? new Date(existing.date_sent).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'the original dispute date'

    const escalationLetter = generateEscalationLetter({
      firstName,
      bureau: existing.bureau,
      itemDisputed: existing.item_disputed,
      originalDisputeDate,
      date: dateStr,
      letterType: escalation_type,
    })

    return NextResponse.json({ escalation_letter: escalationLetter })
  }

  const { data: updated, error } = await supabase
    .from('credit_disputes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dispute: updated })
}
