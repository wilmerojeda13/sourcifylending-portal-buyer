import { notFound } from 'next/navigation'
import PublicContentPage from '@/components/content/PublicContentPage'
import { buildPageMetadata, getPublishedContentPage } from '@/lib/content-engine'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('partner-personas', params.slug)
  return page ? buildPageMetadata(page) : {}
}

export default async function PartnerPersonaContentPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('partner-personas', params.slug)
  if (!page) notFound()
  return <PublicContentPage page={page} />
}
