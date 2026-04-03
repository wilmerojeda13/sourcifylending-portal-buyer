import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(
    { error: 'Notion CRM sync has been retired.' },
    { status: 410 }
  )
}
