import type { MetadataRoute } from 'next'
import { getAllPublishedContentPaths } from '@/lib/content-engine'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sourcifylending.com').replace(/\/$/, '')

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

  // Temporarily disable dynamic routes to isolate Railway build issue
  return staticRoutes
}
