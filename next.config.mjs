import { execSync } from "child_process"

let commitHash = "dev"
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim()
} catch (e) {
  commitHash = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "unknown"
}

const buildTime = new Date().toISOString()

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: commitHash,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
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
      {
        source: "/swuws-portal.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="swuws-portal.apk"' },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ]
  },
}

export default nextConfig