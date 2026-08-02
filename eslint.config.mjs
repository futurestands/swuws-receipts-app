import nextConfig from "eslint-config-next/core-web-vitals"
import nextTypescriptConfig from "eslint-config-next/typescript"

/**
 * Conservative ESLint setup: the standard Next.js + TypeScript preset only.
 * No additional stylistic rules layered on top - deliberately, so this
 * doesn't force a mass reformat of the existing codebase. Ignores build
 * output and generated files.
 */
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "*.config.*", "public/**", "scripts/**", "android/**"],
  },
  ...nextConfig,
  ...nextTypescriptConfig,
]

export default eslintConfig
