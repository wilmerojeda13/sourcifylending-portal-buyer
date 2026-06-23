import OpenAI from 'openai'

export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'

export class OpenAIConfigurationError extends Error {
  constructor() {
    super('OpenAI is not configured. Set OPENAI_API_KEY on the server.')
    this.name = 'OpenAIConfigurationError'
  }
}

export type OpenAIDiagnosticCode =
  | 'OPENAI_API_KEY_MISSING'
  | 'OPENAI_AUTH_FAILED'
  | 'OPENAI_MODEL_NOT_FOUND'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_REQUEST_FAILED'

export type OpenAIDiagnostic = {
  code: OpenAIDiagnosticCode
  status?: number
  message: string
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new OpenAIConfigurationError()
  return new OpenAI({ apiKey })
}

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export function isOpenAIConfigurationError(error: unknown) {
  return error instanceof OpenAIConfigurationError
}

export function getOpenAIDiagnostic(error: unknown): OpenAIDiagnostic {
  if (isOpenAIConfigurationError(error)) {
    return {
      code: 'OPENAI_API_KEY_MISSING',
      message: error.message,
    }
  }

  const maybeError = error as { status?: number; message?: string; code?: string; type?: string }
  const status = typeof maybeError?.status === 'number' ? maybeError.status : undefined
  const message = error instanceof Error ? error.message : String(error)
  const combined = `${message} ${maybeError?.code ?? ''} ${maybeError?.type ?? ''}`.toLowerCase()

  if (status === 401 || status === 403 || combined.includes('incorrect api key') || combined.includes('invalid api key')) {
    return { code: 'OPENAI_AUTH_FAILED', status, message }
  }

  if (status === 404 || combined.includes('model') && (combined.includes('not found') || combined.includes('does not exist'))) {
    return { code: 'OPENAI_MODEL_NOT_FOUND', status, message }
  }

  if (status === 429 || combined.includes('rate limit') || combined.includes('quota')) {
    return { code: 'OPENAI_RATE_LIMITED', status, message }
  }

  return {
    code: 'OPENAI_REQUEST_FAILED',
    status,
    message,
  }
}

export function extractJsonObject(input: string) {
  const cleaned = input.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  return match ? match[0] : cleaned
}

export async function createOpenAIText(args: {
  system?: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>
  maxTokens?: number
  model?: string
  temperature?: number
}) {
  const client = getOpenAIClient()
  const model = args.model ?? getOpenAIModel()
  const messages = args.system
    ? [{ role: 'system' as const, content: args.system }, ...args.messages]
    : args.messages

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: args.maxTokens,
    temperature: args.temperature ?? 0.2,
  })

  return {
    text: response.choices[0]?.message?.content ?? '',
    model,
  }
}
