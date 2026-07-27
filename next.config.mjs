/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase payload limit for large Excel/CSV imports
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // Trigger reload
  images: {
    unoptimized: true,
  },

  async redirects() {
    return [
      {
        source: "/admin/bulk-import",
        destination: "/admin/bulkusers",
        permanent: true,
      },
      {
        source: "/admin/bulk-import-hierarchy",
        destination: "/admin/bulkhierarchy",
        permanent: true,
      },
    ]
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default nextConfig