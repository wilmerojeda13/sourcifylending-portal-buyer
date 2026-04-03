import { notFound } from 'next/navigation'
import PublicContentPage from '@/components/content/PublicContentPage'
import { buildPageMetadata, getPublishedContentPage } from '@/lib/content-engine'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('comparisons', params.slug)
  return page ? buildPageMetadata(page) : {}
}

export default async function ComparisonContentPage({ params }: { params: { slug: string } }) {
  const page = await getPublishedContentPage('comparisons', params.slug)
  if (!page) notFound()
  return <PublicContentPage page={page} />
}
