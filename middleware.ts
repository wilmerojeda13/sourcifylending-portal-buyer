import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase() ?? ''
  const apexHosts = new Set(['sourcifylending.com', 'sourcifylending.com:443'])

  if (apexHosts.has(host)) {
    const url = request.nextUrl.clone()
    url.host = 'www.sourcifylending.com'
    url.protocol = 'https:'
    return NextResponse.redirect(url, 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
