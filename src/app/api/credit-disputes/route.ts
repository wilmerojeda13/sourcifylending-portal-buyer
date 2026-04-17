import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/business-context'
import { logMemoryEvent } from '@/lib/ai-memory'
import { getAccountEntitlements } from '@/lib/account-state'

// ─── Legal basis definitions ──────────────────────────────────────────────────

interface Statute {
  statute: string
  cite: string
  purpose: string
}

function getLegalBasis(disputeType: string, recipientType?: string): Statute[] {
  const type = disputeType.toLowerCase()

  if (type === 'personal information') {
    return [
      { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
      { statute: 'FCRA § 607(b)', cite: '15 U.S.C. § 1681e(b)', purpose: 'Maximum possible accuracy requirement' },
    ]
  }

  if (type === 'account reporting' || type === 'account information') {
    return [
      { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
      { statute: 'FCRA § 607(b)', cite: '15 U.S.C. § 1681e(b)', purpose: 'Maximum possible accuracy requirement' },
      { statute: 'FCRA § 623', cite: '15 U.S.C. § 1681s-2', purpose: 'Furnisher responsibilities for accurate reporting' },
    ]
  }

  if (type === 'collection account') {
    if (recipientType === 'Debt Collector') {
      return [
        { statute: 'FDCPA § 809', cite: '15 U.S.C. § 1692g', purpose: 'Right to debt validation' },
        { statute: 'FDCPA § 807', cite: '15 U.S.C. § 1692e', purpose: 'Prohibition on false or misleading representations' },
        { statute: 'FDCPA § 808', cite: '15 U.S.C. § 1692f', purpose: 'Prohibition on unfair or unconscionable collection practices' },
        { statute: 'FDCPA § 813', cite: '15 U.S.C. § 1692k', purpose: 'Civil liability for FDCPA violations' },
        { statute: 'FCRA § 623', cite: '15 U.S.C. § 1681s-2', purpose: 'Furnisher obligations if also reporting to bureaus' },
      ]
    }
    // Bureau or Furnisher
    return [
      { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
      { statute: 'FCRA § 607(b)', cite: '15 U.S.C. § 1681e(b)', purpose: 'Maximum possible accuracy requirement' },
      { statute: 'FCRA § 623', cite: '15 U.S.C. § 1681s-2', purpose: 'Furnisher responsibilities for accurate reporting' },
    ]
  }

  if (type === 'hard inquiry') {
    return [
      { statute: 'FCRA § 604', cite: '15 U.S.C. § 1681b', purpose: 'Permissible purposes for obtaining consumer reports' },
      { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
    ]
  }

  if (type === 'obsolete reporting') {
    return [
      { statute: 'FCRA § 605', cite: '15 U.S.C. § 1681c', purpose: 'Prohibition on reporting obsolete or time-barred information' },
      { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
    ]
  }

  // Default fallback
  return [
    { statute: 'FCRA § 611', cite: '15 U.S.C. § 1681i', purpose: 'Reinvestigation of disputed information' },
    { statute: 'FCRA § 607(b)', cite: '15 U.S.C. § 1681e(b)', purpose: 'Maximum possible accuracy requirement' },
  ]
}

// ─── Bureau addresses ─────────────────────────────────────────────────────────

const BUREAU_ADDRESSES: Record<string, string> = {
  'Experian':   'Experian Information Solutions, Inc.\nP.O. Box 4500\nAllen, TX 75013',
  'Equifax':    'Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374-0256',
  'TransUnion': 'TransUnion LLC Consumer Dispute Center\nP.O. Box 2000\nChester, PA 19016-2000',
  'Furnisher':  '[Furnisher Name]\n[Furnisher Address]\n[City, State, ZIP]',
  'Debt Collector': '[Debt Collector Name]\n[Debt Collector Address]\n[City, State, ZIP]',
}

function formatStatutes(statutes: Statute[]): string {
  return statutes.map(s => `   • ${s.statute} / ${s.cite} — ${s.purpose}`).join('\n')
}

// ─── Letter generators ────────────────────────────────────────────────────────

function generatePersonalInfoLetter(p: {
  fullName: string; date: string; bureau: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Inaccurate Personal Identifying Information
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear ${p.bureau} Dispute Department,

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing inaccurate personal identifying information currently appearing on my consumer credit report maintained by your agency. I respectfully request that you conduct a reasonable reinvestigation of this information as required by federal law.

─────────────────────────────────────
DISPUTED ITEM
─────────────────────────────────────
Dispute Category:       Personal Identifying Information
Item Being Disputed:    ${p.itemDisputed}
Inaccurate Information: ${p.incorrectInfo}
Correct Information:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

${formatStatutes(p.statutes)}

Under FCRA § 607(b) / 15 U.S.C. § 1681e(b), consumer reporting agencies are required to follow reasonable procedures to assure the maximum possible accuracy of information they report. Under FCRA § 611 / 15 U.S.C. § 1681i, you are required to conduct a reasonable reinvestigation of the disputed information and to correct or delete any information that is inaccurate, incomplete, or cannot be verified.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Conduct a reasonable reinvestigation of the disputed information under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1).
2. Correct the inaccurate personal information identified above and update my credit file accordingly.
3. If the accuracy of this information cannot be verified during the investigation, delete the inaccurate entry from my credit file pursuant to FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).
4. Provide written notification of the results of your reinvestigation as required by FCRA § 611(a)(6) / 15 U.S.C. § 1681i(a)(6).
5. Identify in your response the name, address, and telephone number of any data furnisher or third party contacted during the investigation.

Please note that under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1), your agency is required to complete the reinvestigation within 30 days of receipt of this dispute (or 45 days if I provide additional relevant information during the investigation period).

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed in support of this dispute:
   • Copy of government-issued photo identification
   • Proof of current mailing address
   • [Attach any additional supporting documentation]

I expect this matter to be addressed promptly and in full compliance with applicable federal law.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateAccountReportingLetter(p: {
  fullName: string; date: string; bureau: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Inaccurate Account Information
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear ${p.bureau} Dispute Department,

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing inaccurate or incomplete account information currently appearing on my consumer credit report maintained by your agency. I request that you conduct a reasonable reinvestigation of this information as required by federal law.

─────────────────────────────────────
DISPUTED ITEM
─────────────────────────────────────
Dispute Category:       Account Reporting
Item Being Disputed:    ${p.itemDisputed}
Inaccurate Information: ${p.incorrectInfo}
Correct Information:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

${formatStatutes(p.statutes)}

Under FCRA § 611 / 15 U.S.C. § 1681i, your agency is required to conduct a reasonable reinvestigation of disputed account information and to correct or delete any information that is inaccurate, incomplete, or cannot be verified. Under FCRA § 607(b) / 15 U.S.C. § 1681e(b), consumer reporting agencies must maintain reasonable procedures to ensure the maximum possible accuracy of reported information. Under FCRA § 623 / 15 U.S.C. § 1681s-2, the furnisher of this information is also obligated to investigate and correct any inaccuracy upon receiving notice of a dispute.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Conduct a reasonable reinvestigation of the disputed account information under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1).
2. Contact the furnisher of this account and notify them of this dispute pursuant to FCRA § 611(a)(2) / 15 U.S.C. § 1681i(a)(2).
3. Correct all inaccurate information and update my credit file to reflect accurate account data.
4. If the disputed information cannot be verified, delete it from my credit report pursuant to FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).
5. Provide written notification of the results of your investigation and a copy of the revised credit report.
6. Provide the name, address, and telephone number of any furnisher or third party contacted during the investigation.

Under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1), you are required to complete the reinvestigation within 30 days of receipt of this dispute.

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed in support of this dispute:
   • Copy of government-issued photo identification
   • Proof of current mailing address
   • [Account statements, payment records, or other relevant documentation]

I expect a prompt response and full compliance with the Fair Credit Reporting Act.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateCollectionBureauLetter(p: {
  fullName: string; date: string; bureau: string; recipientType: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  const recipientLabel = p.recipientType === 'Furnisher' ? 'furnisher' : `${p.bureau} Dispute Department`
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Inaccurate Collection Account Reporting
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear ${recipientLabel},

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing the accuracy of a collection account currently appearing on my consumer credit report and requesting a full reinvestigation as required by law.

─────────────────────────────────────
DISPUTED ITEM
─────────────────────────────────────
Dispute Category:       Collection Account
Item Being Disputed:    ${p.itemDisputed}
Inaccurate Information: ${p.incorrectInfo}
Correct Information:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

${formatStatutes(p.statutes)}

Under FCRA § 611 / 15 U.S.C. § 1681i, your agency is required to reinvestigate this dispute and correct or delete any information that is inaccurate, incomplete, or unverifiable. Under FCRA § 623 / 15 U.S.C. § 1681s-2, the furnisher of this account is obligated to investigate any dispute that is referred to it and to correct or delete inaccurate information.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Conduct a reasonable reinvestigation of the disputed collection account under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1).
2. Notify the collection agency or original creditor reporting this account of this dispute, as required by FCRA § 611(a)(2) / 15 U.S.C. § 1681i(a)(2).
3. Require the furnisher to provide full documentation supporting the accuracy of this account's reported status, balance, and payment history.
4. If the account information cannot be fully verified, delete the account from my credit report pursuant to FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).
5. Provide written notice of the results of the investigation and a copy of my updated credit report.

Under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1), you are required to complete the reinvestigation within 30 days of receipt of this dispute.

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed in support of this dispute:
   • Copy of government-issued photo identification
   • Proof of current mailing address
   • [Payment records, account statements, or correspondence related to this account]

I expect a prompt response and full compliance with the Fair Credit Reporting Act.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateCollectionDebtCollectorLetter(p: {
  fullName: string; date: string; bureau: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES['Debt Collector']
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute and Request for Debt Validation
    Pursuant to the Fair Debt Collection Practices Act, 15 U.S.C. § 1692 et seq.
    and the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

To Whom It May Concern,

Pursuant to my rights under the Fair Debt Collection Practices Act ("FDCPA"), 15 U.S.C. § 1692 et seq., I am hereby formally disputing the alleged debt identified below and requesting full validation of this debt as required by federal law. I am also disputing the accuracy of any information you are reporting to consumer reporting agencies in connection with this account.

─────────────────────────────────────
DISPUTED DEBT / ACCOUNT
─────────────────────────────────────
Dispute Category:       Collection Account — Debt Collector
Item Being Disputed:    ${p.itemDisputed}
Inaccurate Information: ${p.incorrectInfo}
Correct Information:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute and validation request is submitted under the following provisions of federal law:

${formatStatutes(p.statutes)}

Under FDCPA § 809 / 15 U.S.C. § 1692g, I have the right to dispute this debt and request validation within 30 days of your first communication. Upon receipt of this dispute, you are required to cease collection activity until you provide adequate validation of the alleged debt. Under FDCPA § 807 / 15 U.S.C. § 1692e, debt collectors are prohibited from using false, deceptive, or misleading representations in connection with the collection of any debt. Under FDCPA § 808 / 15 U.S.C. § 1692f, debt collectors are prohibited from using unfair or unconscionable means to collect or attempt to collect a debt.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
Pursuant to FDCPA § 809 / 15 U.S.C. § 1692g, I request that you provide the following:

1. The name and address of the original creditor to whom this debt is allegedly owed.
2. The amount of the alleged debt, including a complete accounting of all charges, interest, fees, and the dates they were assessed.
3. A copy of the original signed agreement, contract, or application creating the alleged obligation.
4. Verification that your agency is licensed to collect debts in my state.
5. A copy of all records showing when the account was opened, payment history, and charge-off date, if applicable.

Additionally, if you are reporting this account to any consumer reporting agency, I request that you:

6. Cease reporting this account to any consumer reporting agency pending full validation of the debt, consistent with your obligations under FCRA § 623 / 15 U.S.C. § 1681s-2.
7. Correct or delete any inaccurate information you have furnished to any credit bureau in connection with this account.

Please be advised that if you continue collection activity or reporting without providing proper validation, I reserve all rights available to me under applicable federal and state law, including the civil liability provisions of FDCPA § 813 / 15 U.S.C. § 1692k.

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed:
   • Copy of government-issued photo identification
   • [Any documentation relevant to this account]

All future correspondence regarding this matter should be in writing only.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateHardInquiryLetter(p: {
  fullName: string; date: string; bureau: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Unauthorized Hard Inquiry
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear ${p.bureau} Dispute Department,

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing a hard inquiry currently appearing on my consumer credit report that I do not recognize and did not authorize. I request that your agency investigate whether a permissible purpose existed for this inquiry and remove it if no lawful basis can be established.

─────────────────────────────────────
DISPUTED ITEM
─────────────────────────────────────
Dispute Category:       Hard Inquiry — Unauthorized / No Permissible Purpose
Item Being Disputed:    ${p.itemDisputed}
Reported Information:   ${p.incorrectInfo}
Consumer's Position:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

${formatStatutes(p.statutes)}

Under FCRA § 604 / 15 U.S.C. § 1681b, a consumer reporting agency may only furnish a consumer report to a person with a "permissible purpose" as defined by statute. I did not initiate any credit application, employment screening, or other transaction that would give rise to a permissible purpose for this inquiry. Under FCRA § 611 / 15 U.S.C. § 1681i, your agency is required to investigate disputed information and delete any entry that cannot be verified.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Investigate whether the entity that pulled my credit report had a permissible purpose under FCRA § 604 / 15 U.S.C. § 1681b at the time of the inquiry.
2. Contact the entity that requested this inquiry and demand written documentation of the permissible purpose.
3. If no permissible purpose can be established or documented, delete this inquiry from my credit report immediately pursuant to FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).
4. Provide written notification of the results of the investigation, including the name, address, and contact information of the entity that initiated this inquiry.

Under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1), your agency is required to complete the reinvestigation within 30 days of receipt of this dispute.

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed:
   • Copy of government-issued photo identification
   • Copy of credit report showing the disputed inquiry
   • [Any documentation showing you did not authorize this inquiry]

I expect a prompt response in full compliance with the Fair Credit Reporting Act.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateGuidedInquiryLetter(p: {
  fullName: string
  date: string
  bureau: string
  inquiryCompany: string
  inquiryDate: string
  reason: string
  userStatement: string
  supportingDocuments: string[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  const documents = p.supportingDocuments.length > 0
    ? p.supportingDocuments.map((doc) => `   • ${doc}`).join('\n')
    : '   • [Attach any supporting documents you want to keep with your records]'

  const reasonBlock: Record<string, string> = {
    'I do not recognize this inquiry':
      'I do not recognize this inquiry and dispute that it was furnished or reported with a valid permissible purpose.',
    'I did not authorize this inquiry':
      'I did not authorize this inquiry and dispute that any permissible purpose existed for the pull.',
    'This inquiry appears duplicated':
      'This inquiry appears more than once on my consumer report and should be reviewed for duplication or duplicate reporting.',
    'This inquiry information is inaccurate':
      'The inquiry information appears inaccurate based on the details I provided below and should be corrected or deleted if it cannot be verified.',
    'This inquiry is related to identity theft or fraud':
      'I believe this inquiry may be related to identity theft or fraud and should be investigated under the applicable identity theft protections.',
  }

  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Hard Inquiry
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. §§ 1681b, 1681e(b), and 1681i

Dear ${p.bureau} Dispute Department,

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing the hard inquiry identified below. I believe this inquiry was reported inaccurately and/or without a permissible purpose.

Inquiry being disputed:
Company: ${p.inquiryCompany}
Date: ${p.inquiryDate}

Reason for dispute:
${reasonBlock[p.reason] ?? p.reason}

User statement / notes:
${p.userStatement}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

   • FCRA § 604 / 15 U.S.C. § 1681b — Permissible purposes for consumer reports
   • FCRA § 607(b) / 15 U.S.C. § 1681e(b) — Reasonable procedures to assure maximum possible accuracy
   • FCRA § 611 / 15 U.S.C. § 1681i — Procedure in case of disputed accuracy
${p.reason === 'This inquiry is related to identity theft or fraud'
    ? '   • FCRA § 605B / 15 U.S.C. § 1681c-2 — Block of information resulting from identity theft\n'
    : ''}

Under FCRA § 604 / 15 U.S.C. § 1681b, a consumer reporting agency may furnish a consumer report only for a permissible purpose. Under FCRA § 607(b) / 15 U.S.C. § 1681e(b), consumer reporting agencies must follow reasonable procedures to assure the maximum possible accuracy of the information they report. Under FCRA § 611 / 15 U.S.C. § 1681i, disputed information must be reinvestigated and deleted or corrected if it cannot be verified.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Investigate whether the entity that caused this inquiry had a permissible purpose under FCRA § 604 / 15 U.S.C. § 1681b.
2. Verify the reporting basis, date, and accuracy of the inquiry information shown on my consumer report.
3. Correct or delete the inquiry if it is inaccurate, incomplete, cannot be verified, or was furnished without a permissible purpose.
4. Provide written confirmation of the results of your investigation, including the name and contact information of the entity that initiated the inquiry.
5. If this dispute involves identity theft or fraud, apply the protections available under FCRA § 605B / 15 U.S.C. § 1681c-2 as applicable.

Supporting documents:
${documents}

Please send written confirmation of the outcome of your investigation to the address on file.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers prepare a dispute letter for an inquiry they believe is inaccurate or unauthorized. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

function generateObsoleteLetter(p: {
  fullName: string; date: string; bureau: string
  itemDisputed: string; incorrectInfo: string; correctInfo: string
  statutes: Statute[]
}): string {
  const addr = BUREAU_ADDRESSES[p.bureau] ?? p.bureau
  return `${p.fullName}
[Your Mailing Address]
[City, State, ZIP]

${p.date}

${addr}

Re: Formal Dispute of Obsolete / Time-Barred Information
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear ${p.bureau} Dispute Department,

Pursuant to my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq., I am formally disputing information currently appearing on my consumer credit report that appears to be obsolete or beyond the maximum allowable reporting period established by federal law. I request that your agency investigate and remove this information immediately.

─────────────────────────────────────
DISPUTED ITEM
─────────────────────────────────────
Dispute Category:       Obsolete / Time-Barred Reporting
Item Being Disputed:    ${p.itemDisputed}
Reported Information:   ${p.incorrectInfo}
Consumer's Position:    ${p.correctInfo}

─────────────────────────────────────
LEGAL BASIS
─────────────────────────────────────
This dispute is submitted under the following provisions of the Fair Credit Reporting Act:

${formatStatutes(p.statutes)}

Under FCRA § 605 / 15 U.S.C. § 1681c, consumer reporting agencies are prohibited from including in consumer reports most adverse items of information that antedate the report by more than seven years (10 years for bankruptcies). The item identified above appears to fall outside the applicable reporting period and should therefore be deleted from my credit report. Under FCRA § 611 / 15 U.S.C. § 1681i, your agency is required to investigate disputed information and delete any item that cannot be verified as within the permissible reporting period.

─────────────────────────────────────
REQUESTED ACTION
─────────────────────────────────────
I respectfully request that you:

1. Investigate the date of first delinquency or the applicable date that triggers the reporting period for the item identified above.
2. Verify whether this item falls within the permissible reporting period under FCRA § 605 / 15 U.S.C. § 1681c.
3. If this item is outside the permissible reporting period, delete it from my credit report immediately pursuant to FCRA § 605 and § 611(a)(5)(A) / 15 U.S.C. § 1681c and § 1681i(a)(5)(A).
4. Provide written notification of the results of your investigation and a copy of the updated credit report.

Under FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1), your agency is required to complete the reinvestigation within 30 days of receipt of this dispute.

─────────────────────────────────────
SUPPORTING DOCUMENTS
─────────────────────────────────────
The following documents are enclosed:
   • Copy of government-issued photo identification
   • Copy of credit report identifying the disputed item
   • [Any documentation showing the date of first delinquency or account closure]

I expect this matter to be resolved promptly in accordance with the Fair Credit Reporting Act.

Sincerely,


${p.fullName}
[Your Mailing Address]
[City, State, ZIP]
[Phone: ___________________]
[Email: ___________________]

─────────────────────────────────────
DISCLAIMER
─────────────────────────────────────
This draft dispute letter is provided for informational purposes to help consumers understand and exercise their rights under applicable consumer protection laws. It does not constitute legal advice or legal representation. SourcifyLending is not a credit repair organization and does not guarantee any particular outcome from submitting this or any dispute letter.`
}

// ─── Main letter dispatcher ───────────────────────────────────────────────────

function generateDisputeLetter(params: {
  fullName: string
  bureau: string
  disputeType: string
  recipientType?: string
  itemDisputed: string
  incorrectInformation: string
  correctInformation: string
  date: string
}): { letter: string; legalBasis: Statute[] } {
  const statutes = getLegalBasis(params.disputeType, params.recipientType)
  const base = {
    fullName: params.fullName,
    date: params.date,
    bureau: params.bureau,
    itemDisputed: params.itemDisputed,
    incorrectInfo: params.incorrectInformation,
    correctInfo: params.correctInformation,
    statutes,
  }

  const type = params.disputeType.toLowerCase()
  let letter: string

  if (type === 'personal information') {
    letter = generatePersonalInfoLetter(base)
  } else if (type === 'account reporting' || type === 'account information') {
    letter = generateAccountReportingLetter(base)
  } else if (type === 'collection account') {
    if (params.recipientType === 'Debt Collector') {
      letter = generateCollectionDebtCollectorLetter(base)
    } else {
      letter = generateCollectionBureauLetter({ ...base, recipientType: params.recipientType ?? 'Bureau' })
    }
  } else if (type === 'hard inquiry') {
    letter = generateHardInquiryLetter(base)
  } else if (type === 'obsolete reporting') {
    letter = generateObsoleteLetter(base)
  } else {
    // Fallback: account reporting style
    letter = generateAccountReportingLetter(base)
  }

  return { letter, legalBasis: statutes }
}

// ─── Escalation letters ───────────────────────────────────────────────────────

function generateEscalationLetter(params: {
  fullName: string
  bureau: string
  itemDisputed: string
  originalDisputeDate: string
  date: string
  letterType: 'cfpb' | 'method_of_verification' | 'followup'
}): string {
  const { fullName, bureau, itemDisputed, originalDisputeDate, date, letterType } = params

  if (letterType === 'cfpb') {
    return `${fullName}
[Your Mailing Address]
[City, State, ZIP]

${date}

Consumer Financial Protection Bureau
1700 G Street, NW
Washington, DC 20552

Re: Formal Complaint Against ${bureau} — Unresolved Credit Dispute
    Pursuant to the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq.

Dear CFPB,

I am submitting this formal complaint against ${bureau} for failure to conduct a proper reinvestigation and resolve a credit dispute I submitted on ${originalDisputeDate}, in apparent violation of my rights under the Fair Credit Reporting Act ("FCRA"), 15 U.S.C. § 1681 et seq.

COMPLAINT SUMMARY
Bureau: ${bureau}
Item Disputed: ${itemDisputed}
Original Dispute Date: ${originalDisputeDate}

Despite submitting a formal dispute, ${bureau} has failed to:

1. Complete a reasonable reinvestigation within the 30-day statutory period required by FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1).
2. Provide adequate verification or documentation of the disputed item.
3. Correct or delete the inaccurate information as required by FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).

Under FCRA § 616 / 15 U.S.C. § 1681n and FCRA § 617 / 15 U.S.C. § 1681o, consumer reporting agencies are subject to civil liability for willful and negligent noncompliance with the FCRA, respectively.

I respectfully request that the Bureau investigate this matter and take appropriate action to enforce compliance with the Fair Credit Reporting Act.

Sincerely,

${fullName}
[Your Mailing Address]
[City, State, ZIP]`
  }

  if (letterType === 'method_of_verification') {
    return `${fullName}
[Your Mailing Address]
[City, State, ZIP]

${date}

${BUREAU_ADDRESSES[bureau] ?? bureau}

Re: Request for Method of Verification
    FCRA § 611(a)(7) / 15 U.S.C. § 1681i(a)(7)

Dear ${bureau} Dispute Department,

Pursuant to FCRA § 611(a)(7) / 15 U.S.C. § 1681i(a)(7), I am exercising my right to request the method of verification used during your investigation of my dispute filed on ${originalDisputeDate}.

The disputed item is: ${itemDisputed}

Under FCRA § 611(a)(7), I am entitled to receive the following within 15 days of your receipt of this request:

1. A description of the procedure used to determine the accuracy and completeness of the disputed information.
2. The business name, address, and telephone number of any furnisher or third party contacted during the investigation.
3. Any documentation or records obtained from the furnisher during the investigation.

Please provide this information in writing within 15 days as required by law.

Sincerely,

${fullName}
[Your Mailing Address]
[City, State, ZIP]`
  }

  // Follow-up
  return `${fullName}
[Your Mailing Address]
[City, State, ZIP]

${date}

${BUREAU_ADDRESSES[bureau] ?? bureau}

Re: Follow-Up Dispute — Prior Dispute Submitted ${originalDisputeDate}
    FCRA § 611 / 15 U.S.C. § 1681i

Dear ${bureau} Dispute Department,

I am submitting this follow-up dispute regarding a matter I formally disputed on ${originalDisputeDate}:

Disputed Item: ${itemDisputed}

This item remains inaccurately reported on my credit file. As the 30-day reinvestigation period required by FCRA § 611(a)(1) / 15 U.S.C. § 1681i(a)(1) has elapsed without proper resolution, I am resubmitting this dispute and demanding immediate action.

Under FCRA § 607(b) / 15 U.S.C. § 1681e(b), your agency is required to maintain reasonable procedures to ensure the maximum possible accuracy of reported information. If the accuracy of this item cannot be verified, it must be deleted from my credit report immediately under FCRA § 611(a)(5)(A) / 15 U.S.C. § 1681i(a)(5)(A).

I expect written confirmation of the outcome of the reinvestigation within 30 days of receipt of this letter.

Sincerely,

${fullName}
[Your Mailing Address]
[City, State, ZIP]`
}

// ─── GET — list disputes ──────────────────────────────────────────────────────
export async function GET() {
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('credit_disputes')
    .select('*')
    .eq('user_id', context.activeBusinessId)
    .neq('status', 'Deleted')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ disputes: data })
}

// ─── POST — create dispute and generate law-aware letter ──────────────────────
export async function POST(req: NextRequest) {
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const entitlements = getAccountEntitlements(
    context.activeProfile.feature_tier,
    context.activeProfile.billing_status,
    context.activeProfile.member_status
  )
  const isFreeAccount = entitlements.access_state === 'free_active'
  const isPaidAccount = entitlements.access_state === 'paid_active'

  const body = await req.json()
  const {
    bureau,
    dispute_type,
    recipient_type,
    item_disputed,
    incorrect_information,
    correct_information,
    workflow,
    inquiry_company,
    inquiry_date,
    inquiry_reason,
    user_statement,
    supporting_documents,
  } = body

  const guidedInquiryRequested = workflow === 'guided_inquiry' || (!!inquiry_company && !!inquiry_date)

  if (isFreeAccount) {
    if (!bureau || !inquiry_company || !inquiry_date || !inquiry_reason || !user_statement || !guidedInquiryRequested) {
      return NextResponse.json({ error: 'Free inquiry disputes require bureau, inquiry company, inquiry date, reason, and user statement.' }, { status: 400 })
    }
  } else if (isPaidAccount) {
    if (!bureau || !dispute_type || !item_disputed || !incorrect_information || !correct_information) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Paid membership is inactive. Reactivate to use dispute tools.' }, { status: 403 })
  }

  const fullName = context.activeProfile.full_name ?? context.viewerProfile.full_name ?? 'Consumer'
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const now = new Date().toISOString()
  const letterResult = isFreeAccount
    ? {
        letter: generateGuidedInquiryLetter({
          fullName,
          date: dateStr,
          bureau,
          inquiryCompany: String(inquiry_company).trim(),
          inquiryDate: new Date(inquiry_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          reason: String(inquiry_reason).trim(),
          userStatement: String(user_statement).trim(),
          supportingDocuments: Array.isArray(supporting_documents)
            ? supporting_documents.map((doc) => String(doc).trim()).filter(Boolean)
            : [],
        }),
        legalBasis: getLegalBasis('hard inquiry'),
      }
    : generateDisputeLetter({
        fullName,
        bureau,
        disputeType: String(dispute_type).trim(),
        recipientType: recipient_type,
        itemDisputed: item_disputed,
        incorrectInformation: incorrect_information,
        correctInformation: correct_information,
        date: dateStr,
      })

  const { data: dispute, error } = await supabase
    .from('credit_disputes')
    .insert({
      user_id: context.activeBusinessId,
      bureau,
      dispute_type: isFreeAccount ? 'Hard Inquiry' : String(dispute_type).trim(),
      item_disputed: isFreeAccount ? String(inquiry_company).trim() : item_disputed,
      incorrect_information: isFreeAccount ? String(inquiry_reason).trim() : incorrect_information,
      correct_information: isFreeAccount ? String(user_statement).trim() : correct_information,
      generated_letter: letterResult.letter,
      status: 'Generated',
      date_generated: now,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logMemoryEvent(
    context.activeBusinessId,
    'dispute_generated',
    `Dispute letter generated for ${bureau}`,
    `${isFreeAccount ? 'Hard Inquiry' : String(dispute_type).trim()}: ${isFreeAccount ? String(inquiry_company).trim() : item_disputed}`,
    dispute.id
  )

  return NextResponse.json({ dispute, legal_basis: letterResult.legalBasis }, { status: 201 })
}

// ─── PATCH — update status / escalation ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const context = await getBusinessContext()
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const body = await req.json()
  const { id, status, response_notes, escalation_type } = body

  if (!id) return NextResponse.json({ error: 'Dispute ID required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('credit_disputes')
    .select('*')
    .eq('id', id)
    .eq('user_id', context.activeBusinessId)
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

  if (escalation_type && ['cfpb', 'method_of_verification', 'followup'].includes(escalation_type)) {
    const fullName = context.activeProfile.full_name ?? context.viewerProfile.full_name ?? 'Consumer'
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const originalDisputeDate = existing.date_sent
      ? new Date(existing.date_sent).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'the original dispute date'

    const escalationLetter = generateEscalationLetter({
      fullName,
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
    .eq('user_id', context.activeBusinessId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dispute: updated })
}
