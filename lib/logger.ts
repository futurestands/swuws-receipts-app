import "server-only"
import { SessionUser } from "./session"

/**
 * ENTERPRISE OBSERVABILITY LOGGING
 *
 * Provides a centralized point for system events. Currently wraps console.log/error,
 * but is structured to easily integrate with Sentry, Datadog, or Axiom.
 */

export type LogSeverity = "info" | "warn" | "error" | "fatal"
export type LogCategory = "security" | "finance" | "system" | "operational"

export interface LogEvent {
  message: string
  severity: LogSeverity
  category: LogCategory
  details?: Record<string, any>
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
  } else if (event.severity === "warn") {
    console.warn(logLine)
  } else {
    console.log(logLine)
  }

  // Future: Integrate Sentry or other APM here
  // if (event.error) Sentry.captureException(event.error);
}

/** Specialized logger for critical financial events */
export function logFinancial(message: string, details: Record<string, any>, user?: SessionUser) {
  logEvent({
    message,
    severity: "info",
    category: "finance",
    details,
    user,
  })
}

/** Specialized logger for security events */
export function logSecurity(message: string, severity: LogSeverity = "warn", details: Record<string, any> = {}, user?: SessionUser) {
  logEvent({
    message,
    severity,
    category: "security",
    details,
    user,
  })
}
