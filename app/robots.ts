import { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl()

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/verify'],
      disallow: ['/dashboard/', '/admin/', '/api/', '/offline-shell'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
