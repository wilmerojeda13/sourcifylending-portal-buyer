import { notFound } from 'next/navigation'
import PublicContentPage from '@/components/content/PublicContentPage'
import { buildPageMetadata, getPublishedContentPage } from '@/lib/content-engine'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('partner-comparisons', params.slug)
  return page ? buildPageMetadata(page) : {}
}

export default async function PartnerComparisonContentPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('partner-comparisons', params.slug)
  if (!page) notFound()
  return <PublicContentPage page={page} />
}
