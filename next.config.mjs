/** @type {import('next').NextConfig} */
const nextConfig = {
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