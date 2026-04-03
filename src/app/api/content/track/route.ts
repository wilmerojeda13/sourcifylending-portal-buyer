import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getContentAttributionCookieValue, recordContentEvent } from '@/lib/content-engine'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      pageId?: string
      path?: string
      currentUrl?: string
      destinationPath?: string
      referrer?: string
      eventAction?: 'page_visit' | 'portal_click'
      eventType?: 'visit'
    }

    if (!body.pageId || body.eventType !== 'visit') {
      return NextResponse.json({ error: 'Invalid content tracking payload.' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data: page, error } = await supabase
      .from('seo_content_pages')
      .select('id, slug, route_group, title_tag')
      .eq('id', body.pageId)
      .maybeSingle()

    if (error || !page) {
      return NextResponse.json({ error: 'Content page not found.' }, { status: 404 })
    }

    await recordContentEvent({
      pageId: page.id,
      eventType: 'visit',
      metadata: {
        kind: body.eventAction || 'page_visit',
        path: body.path || null,
        current_url: body.currentUrl || null,
        destination_path: body.destinationPath || null,
        referer: body.referrer || req.headers.get('referer') || null,
        channel: classifyContentTraffic({
          referrer: body.referrer || req.headers.get('referer'),
          currentUrl: body.currentUrl,
        }),
      },
    })

    const cookieStore = await cookies()
    cookieStore.set('sl_content_attribution', getContentAttributionCookieValue(page), {
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
      sameSite: 'lax',
      secure: true,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[content/track] failed', error)
    return NextResponse.json({ error: 'Unable to record content visit.' }, { status: 500 })
  }
}

function classifyContentTraffic({
  referrer,
  currentUrl,
}: {
  referrer?: string | null
  currentUrl?: string | null
}) {
  const aiHosts = ['chat.openai.com', 'chatgpt.com', 'perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']
  const searchHosts = ['google.', 'bing.com', 'search.yahoo.com', 'duckduckgo.com']

  const referrerValue = (referrer || '').toLowerCase()
  const currentUrlValue = (currentUrl || '').toLowerCase()

  if (aiHosts.some((host) => referrerValue.includes(host) || currentUrlValue.includes(`utm_source=${host.replace(/\./g, '')}`) || currentUrlValue.includes(host))) {
    return 'ai_search'
  }

  if (currentUrlValue.includes('utm_source=chatgpt') || currentUrlValue.includes('utm_source=perplexity') || currentUrlValue.includes('utm_source=claude') || currentUrlValue.includes('utm_source=gemini') || currentUrlValue.includes('utm_medium=ai')) {
    return 'ai_search'
  }

  if (searchHosts.some((host) => referrerValue.includes(host)) || currentUrlValue.includes('utm_medium=organic') || currentUrlValue.includes('utm_source=google') || currentUrlValue.includes('utm_source=bing')) {
    return 'organic_search'
  }

  return 'direct_or_other'
}
