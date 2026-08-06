import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { getSettings } from './actions/settings'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  const iconUrl = settings.logoUrl || '/logo.jpg'

  return {
    title: 'SWUWS Collection Portal',
    description: 'Revenue Assurance and Payment Tracking System — Southwestern Umbrella of Water and Sanitation',
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
      other: {
        rel: 'apple-touch-icon-precomposed',
        url: iconUrl,
      },
    }
  }
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#2c4a5e',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
