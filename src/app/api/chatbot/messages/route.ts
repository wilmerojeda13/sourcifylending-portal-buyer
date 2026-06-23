import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIText, extractJsonObject, getOpenAIModel, isOpenAIConfigured } from '@/lib/openai'

interface ChatRequest {
  message: string
  collectedData: Record<string, any>
  conversationHistory: Array<{ role: string; content: string }>
}

function buildSystemPrompt(collectedData: Record<string, any>): string {
  return `You are a friendly, helpful SourcifyLending assistant on the company website.

Your job is to help new visitors understand if they may qualify for business credit building and funding programs.

Guidelines:
1. Ask one question at a time - be conversational and natural
2. Extract key information: full name, email, phone, business name, business age, monthly revenue, credit score, funding goal, industry, state
3. Be encouraging but honest - don't promise funding approval
4. After collecting main info, summarize and prepare for qualification
5. Keep responses short (1-2 sentences usually)
6. Be warm and use their name when they share it

Current collected data:
${JSON.stringify(collectedData, null, 2)}

When you need to extract data from the user's response, you MUST respond with JSON in this format:
{
  "response": "Your conversational response here",
  "extracted": {
    "full_name": "value or null",
    "email": "value or null",
    "phone": "value or null",
    "business_name": "value or null",
    "business_age": "value or null",
    "monthly_revenue": "value or null",
    "credit_score_range": "value or null",
    "funding_goal": "value or null",
    "industry": "value or null",
    "state": "value or null"
  }
}

Only include fields that were mentioned in the user's message.`
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { message, collectedData, conversationHistory } = body

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    if (!isOpenAIConfigured()) {
      console.error('OPENAI_API_KEY not set, using fallback')
      return NextResponse.json({
        response: 'Thanks! Can you tell me a bit more about your business?',
        extractedData: {},
      })
    }

    // Build conversation for OpenAI
    const messages = [
      ...conversationHistory.map((m) => ({
        role: (m.role === 'bot' ? 'assistant' : m.role) as 'user' | 'assistant',
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ]

    const response = await createOpenAIText({
      model: getOpenAIModel(),
      maxTokens: 256,
      system: buildSystemPrompt(collectedData),
      messages,
    })

    const assistantMessage = response.text

    // Try to parse JSON response
    let parsedResponse = { response: assistantMessage, extracted: {} }
    try {
      parsedResponse = JSON.parse(extractJsonObject(assistantMessage))
    } catch {
      // If JSON parsing fails, return raw response
      parsedResponse = { response: assistantMessage, extracted: {} }
    }

    return NextResponse.json({
      response: parsedResponse.response,
      extractedData: parsedResponse.extracted,
    })
  } catch (error) {
    console.error('Chatbot API error:', error)
    return NextResponse.json(
      {
        response:
          'Sorry, I had trouble processing that. Can you tell me your business name?',
        extractedData: {},
      },
      { status: 200 } // Return 200 so client can continue with fallback
    )
  }
}
