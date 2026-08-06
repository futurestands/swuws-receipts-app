import { MetadataRoute } from 'next'
import { getSettings } from './actions/settings'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings()
  const iconUrl = settings.logoUrl || '/logo.jpg'

  // Determine type from extension if possible, default to any
  const type = iconUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg'

  return {
    name: 'SWUWS Collection Portal',
    short_name: settings.receiptPrefix || 'SWUWS',
    description: 'Revenue Assurance and Payment Tracking System — Southwestern Umbrella of Water and Sanitation',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: iconUrl,
        sizes: 'any',
        type: type,
        purpose: 'any',
      },
      {
        src: iconUrl,
        sizes: '192x192',
        type: type,
      },
      {
        src: iconUrl,
        sizes: '512x512',
        type: type,
      },
    ],
  }
}
