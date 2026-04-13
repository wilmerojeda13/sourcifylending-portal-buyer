import { randomUUID } from 'node:crypto'
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'

export interface CampaignEmailSendInput {
  recipientEmail: string
  subject: string
  htmlBody?: string | null
  textBody?: string | null
  fromEmail?: string | null
  fromName?: string | null
  replyToEmail?: string | null
  configurationSetName?: string | null
}

export interface CampaignEmailSendResult {
  success: boolean
  providerMessageId: string | null
  errorMessage: string | null
}

export interface CampaignSesEnvConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  defaultFromEmail: string | null
  defaultFromName: string | null
  defaultConfigurationSetName: string | null
}

export interface CampaignSesClientLike {
  send(command: SendEmailCommand): Promise<{ MessageId?: string }>
}

export interface CampaignEmailSendOptions {
  client?: CampaignSesClientLike
  env?: NodeJS.ProcessEnv
}

type CampaignSesEnvValidationResult =
  | { ok: true; config: CampaignSesEnvConfig }
  | { ok: false; errorMessage: string }

function normalize(value: string | null | undefined) {
  return value?.trim() || ''
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown SES send error'
  }
}

function encodeMimeWord(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^[\x20-\x7E]+$/.test(trimmed) && !/[\\"]/g.test(trimmed)) return trimmed
  return `=?UTF-8?B?${Buffer.from(trimmed, 'utf8').toString('base64')}?=`
}

function formatAddress(email: string, name?: string | null) {
  const trimmedEmail = email.trim()
  const trimmedName = normalize(name)
  if (!trimmedName) return trimmedEmail
  return `${encodeMimeWord(trimmedName)} <${trimmedEmail}>`
}

function buildBodyPart(contentType: 'text/plain' | 'text/html', body: string) {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n')
}

function buildRawMessage(input: CampaignEmailSendInput, fromEmail: string, fromName: string | null) {
  const recipientEmail = normalize(input.recipientEmail)
  const replyToEmail = normalize(input.replyToEmail)
  const subject = normalize(input.subject)
  const textBody = input.textBody?.trim() || null
  const htmlBody = input.htmlBody?.trim() || null
  const fromAddress = formatAddress(fromEmail, fromName)
  const headers = [
    `From: ${fromAddress}`,
    `To: ${recipientEmail}`,
    `Subject: ${encodeMimeWord(subject) || subject}`,
    ...(replyToEmail ? [`Reply-To: ${replyToEmail}`] : []),
    'MIME-Version: 1.0',
  ]

  if (textBody && htmlBody) {
    const boundary = `campaign-email-${randomUUID()}`
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    return [
      ...headers,
      '',
      `--${boundary}`,
      buildBodyPart('text/plain', textBody),
      '',
      `--${boundary}`,
      buildBodyPart('text/html', htmlBody),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n')
  }

  const bodyContentType = htmlBody ? 'text/html' : 'text/plain'
  const body = htmlBody ?? textBody ?? ''

  return [
    ...headers,
    `Content-Type: ${bodyContentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
  ].join('\r\n')
}

export function validateCampaignSesEnv(env: NodeJS.ProcessEnv = process.env): CampaignSesEnvValidationResult {
  const missing: string[] = []
  const region = normalize(env.AWS_REGION)
  const accessKeyId = normalize(env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = normalize(env.AWS_SECRET_ACCESS_KEY)

  if (!region) missing.push('AWS_REGION')
  if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY')

  if (missing.length > 0) {
    return {
      ok: false,
      errorMessage: `Missing required SES env vars: ${missing.join(', ')}`,
    }
  }

  return {
    ok: true,
    config: {
      region,
      accessKeyId,
      secretAccessKey,
      defaultFromEmail: normalize(env.AWS_SES_FROM_EMAIL) || null,
      defaultFromName: normalize(env.AWS_SES_FROM_NAME) || null,
      defaultConfigurationSetName: normalize(env.AWS_SES_CONFIGURATION_SET) || null,
    },
  }
}

function createCampaignSesClient(config: CampaignSesEnvConfig) {
  return new SESv2Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

async function sendCampaignEmailInternal(
  input: CampaignEmailSendInput,
  options: CampaignEmailSendOptions = {},
): Promise<CampaignEmailSendResult> {
  const envResult = validateCampaignSesEnv(options.env)
  if (!envResult.ok) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: envResult.errorMessage,
    }
  }

  const fromEmail = normalize(input.fromEmail) || envResult.config.defaultFromEmail
  if (!fromEmail) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'Missing required from email. Set fromEmail on the send input or AWS_SES_FROM_EMAIL.',
    }
  }

  const recipientEmail = normalize(input.recipientEmail)
  if (!recipientEmail) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'Missing recipient email.',
    }
  }

  const subject = normalize(input.subject)
  if (!subject) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'Missing email subject.',
    }
  }

  const htmlBody = input.htmlBody?.trim() || null
  const textBody = input.textBody?.trim() || null
  if (!htmlBody && !textBody) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'Missing email body. Provide htmlBody, textBody, or both.',
    }
  }

  const client = options.client ?? createCampaignSesClient(envResult.config)
  const rawMessage = buildRawMessage(
    {
      ...input,
      recipientEmail,
      subject,
      htmlBody,
      textBody,
      fromEmail,
      fromName: normalize(input.fromName) || envResult.config.defaultFromName,
      replyToEmail: normalize(input.replyToEmail) || null,
    },
    fromEmail,
    normalize(input.fromName) || envResult.config.defaultFromName,
  )

  try {
    const command = new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [recipientEmail],
      },
      ReplyToAddresses: normalize(input.replyToEmail) ? [normalize(input.replyToEmail)] : undefined,
      ConfigurationSetName: normalize(input.configurationSetName) || envResult.config.defaultConfigurationSetName || undefined,
      Content: {
        Raw: {
          Data: Buffer.from(rawMessage, 'utf8'),
        },
      },
    })

    const response = await client.send(command)
    return {
      success: true,
      providerMessageId: response.MessageId ?? null,
      errorMessage: null,
    }
  } catch (error) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: getErrorMessage(error),
    }
  }
}

export async function sendCampaignEmail(
  input: CampaignEmailSendInput,
  options: CampaignEmailSendOptions = {},
): Promise<CampaignEmailSendResult> {
  return sendCampaignEmailInternal(input, options)
}

export async function sendTestEmail(
  input: CampaignEmailSendInput,
  options: CampaignEmailSendOptions = {},
): Promise<CampaignEmailSendResult> {
  return sendCampaignEmailInternal(input, options)
}
