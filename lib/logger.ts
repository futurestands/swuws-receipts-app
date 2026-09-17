import "server-only"
import { SessionUser } from "./session"

/**
 * ENTERPRISE OBSERVABILITY LOGGING
 *
 * Console first, then the admin System errors page for error/fatal events.
 */

export type LogSeverity = "info" | "warn" | "error" | "fatal"
export type LogCategory = "security" | "finance" | "system" | "operational"

export interface LogEvent {
  message: string
  severity: LogSeverity
  category: LogCategory
  details?: Record<string, unknown>
  user?: SessionUser
  error?: Error | unknown
}

export function logEvent(event: LogEvent) {
  const timestamp = new Date().toISOString()
  const userContext = event.user ? `[User: ${event.user.id}]` : "[System]"
  const level = event.severity.toUpperCase()
  const meta = event.details ? ` - Details: ${JSON.stringify(event.details)}` : ""

  const logLine = `[${timestamp}] [${level}] [${event.category}] ${userContext} ${event.message}${meta}`

  if (event.severity === "error" || event.severity === "fatal") {
    console.error(logLine)
    if (event.error) console.error(event.error)
    const err = event.error instanceof Error ? event.error : undefined
    void import("./system-errors")
      .then(({ recordSystemError }) =>
        recordSystemError({
          message: event.message,
          stack: err?.stack || (typeof event.error === "string" ? event.error : undefined),
          source: event.category,
          user: event.user
            ? {
                id: event.user.id,
                name: event.user.name,
                email: event.user.email,
                role: event.user.role,
              }
            : null,
        })
      )
      .catch(() => {})
  } else if (event.severity === "warn") {
    console.warn(logLine)
  } else {
    console.log(logLine)
  }
}

/** Specialized logger for critical financial events */
export function logFinancial(message: string, details: Record<string, unknown>, user?: SessionUser) {
  logEvent({
    message,
    severity: "info",
    category: "finance",
    details,
    user,
  })
}

/** Specialized logger for security events */
export function logSecurity(message: string, severity: LogSeverity = "warn", details: Record<string, unknown> = {}, user?: SessionUser) {
  logEvent({
    message,
    severity,
    category: "security",
    details,
    user,
  })
}
