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

  // Try to get dynamic content, but don't fail if env vars are missing
  let contentPages: any[] = []
  try {
    contentPages = await getAllPublishedContentPaths()
  } catch (error) {
    // Skip dynamic routes if Supabase isn't available during build
    console.warn('Could not generate dynamic sitemap routes:', error)
  }

  const dynamicRoutes: MetadataRoute.Sitemap = contentPages.map((page) => ({
    url: `${SITE_URL}/${page.route_group}/${page.slug}`,
    lastModified: new Date(page.updated_at || page.published_at || Date.now()),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...dynamicRoutes]
}
