import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { getSettings } from './actions/settings'
import { SWRegistration } from '@/components/SWRegistration'
import { NativeBridge } from '@/components/NativeBridge'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  const iconUrl = settings.logoUrl || '/logo.jpg'
  const orgName = settings.orgName || 'South Western Umbrella of Water and Sanitation'

  return {
    title: {
      template: `%s | ${orgName}`,
      default: `${orgName} (SWUWS) Portal`,
    },
    description: 'Official Revenue Assurance and Payment Tracking System for the South Western Umbrella of Water and Sanitation (SWUWS). Track water billing, receipts, and collections.',
    keywords: [
      'swuws',
      'SWUWS',
      'South Western Umbrella of Water and Sanitation',
      'SWUWS portal',
      'water billing uganda',
      'water collections',
      'MWE',
      'Ministry of Water and Environment',
      'receipt verification'
    ],
    authors: [{ name: settings.developerCredit || 'SWUWS IT' }],
    creator: 'SWUWS',
    publisher: 'South Western Umbrella of Water and Sanitation',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
      other: {
        rel: 'apple-touch-icon-precomposed',
        url: iconUrl,
      },
    },
    openGraph: {
      type: 'website',
      locale: 'en_UG',
      url: 'https://swuws.example', // Placeholder, but useful for OG structure
      siteName: orgName,
      title: `${orgName} - Official Portal`,
      description: 'Official Revenue Assurance and Payment Tracking System for SWUWS. Log in to access the dashboard or verify a receipt.',
      images: [
        {
          url: iconUrl,
          width: 800,
          height: 600,
          alt: `${orgName} Logo`,
        },
      ],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#2c4a5e',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <NativeBridge />
        <SWRegistration />
        {children}
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
