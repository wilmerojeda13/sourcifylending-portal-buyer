import { NextRequest, NextResponse } from 'next/server'
import { processCampaignSesEvent } from '@/lib/email-campaign-event-ingestion'
import { handleSesCampaignWebhook } from '@/lib/ses-campaign-webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const topicArn = process.env.AWS_SES_CAMPAIGN_TOPIC_ARN?.trim()
    const result = await handleSesCampaignWebhook(rawBody, {
      expectedTopicArn: topicArn ?? '',
      onNotification: async (payload) => processCampaignSesEvent({ payload }),
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
