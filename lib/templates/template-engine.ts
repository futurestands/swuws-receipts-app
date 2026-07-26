/**
 * Enterprise Template Engine (v1.2)
 * Handles variable substitution using Mustache-style {{placeholder}} syntax.
 */

export type TemplateData = Record<string, string | number | boolean | null | undefined>

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Renders a template string by replacing {{variable}} with values from the data object.
 * Supports basic conditional rendering for presence of values.
 */
export function renderTemplate(
  content: string,
  data: TemplateData,
  options?: { escape?: boolean },
): string {
  let rendered = content

  // 1. Process variables: {{var_name}}
  rendered = rendered.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = data[key]
    if (value === undefined || value === null) {
      return "" // or keep match if we want to show missing tags
    }
    const str = String(value)
    return options?.escape ? escapeHtml(str) : str
  })

  // 2. Process conditional blocks: {{#if var_name}}...{{/if}}
  // Simple implementation: checks if var_name is truthy in data
  rendered = rendered.replace(/\{\{\s*#if\s+([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g, (match, key, body) => {
    const value = data[key]
    return value ? body : ""
  })

  return rendered
}

/**
 * Discovers all placeholders used in a template string.
 */
export function getPlaceholders(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)
  const placeholders = new Set<string>()
  for (const match of matches) {
    if (!match[1].startsWith("#") && !match[1].startsWith("/")) {
      placeholders.add(match[1])
    }
  }
  return Array.from(placeholders)
}
