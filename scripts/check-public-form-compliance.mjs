import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const requiredPages = [
  'src/app/get-started/page.tsx',
  'src/app/signup/page.tsx',
  'src/app/analyzer/page.tsx',
  'src/app/partners/page.tsx',
  'src/app/login/LoginForm.tsx',
  'src/app/forgot-password/page.tsx',
  'src/app/accept-invite/page.tsx',
  'src/app/affiliate/login/page.tsx',
  'src/app/claim-account/ClaimAccountClient.tsx',
  'src/app/auth/reset-password/page.tsx',
]

const messagingPages = [
  'src/app/get-started/page.tsx',
  'src/app/signup/page.tsx',
  'src/app/analyzer/page.tsx',
  'src/app/partners/page.tsx',
]

const failures = []

for (const file of requiredPages) {
  const content = readFileSync(resolve(root, file), 'utf8')
  if (!content.includes('PUBLIC_FORM_COMPLIANCE_OK')) {
    failures.push(`${file}: missing PUBLIC_FORM_COMPLIANCE_OK marker`)
  }

  if (!content.includes('/privacy') && !content.includes('PublicLegalLinks')) {
    failures.push(`${file}: missing Privacy link`)
  }

  if (!content.includes('/terms') && !content.includes('PublicLegalLinks')) {
    failures.push(`${file}: missing Terms link`)
  }
}

for (const file of messagingPages) {
  const content = readFileSync(resolve(root, file), 'utf8')
  if (!content.includes('PublicMessagingConsent')) {
    failures.push(`${file}: messaging-enabled page missing PublicMessagingConsent`)
  }
}

if (failures.length > 0) {
  console.error('Public form compliance gate failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Public form compliance gate passed.')
