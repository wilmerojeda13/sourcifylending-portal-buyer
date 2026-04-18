import type { MetadataRoute } from 'next'
import { getAllPublishedContentPaths } from '@/lib/content-engine'
import { SITE_URL } from '@/lib/site-config'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/get-started',
    '/signup',
    '/analyzer',
    '/partners',
    '/privacy',
    '/terms',
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }))

  const publishedContent = await getAllPublishedContentPaths()
  const dynamicRoutes: MetadataRoute.Sitemap = publishedContent.map((page) => ({
    url: `${SITE_URL}/${page.route_group}/${page.slug}`,
    lastModified: new Date(page.published_at || page.updated_at),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...dynamicRoutes]
}
