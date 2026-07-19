/**
 * CENTRALIZED ROLE DEFINITIONS
 *
 * This is the single source of truth for all role names in the system.
 * Using these constants prevents typos and makes it easier to rename roles
 * or add new ones in the future.
 */

export const ROLES = {
  // Global scope
  SYSTEM_ADMIN: "admin",
  HEAD_COMMERCIAL: "head_commercial",
  FINANCE_OFFICER: "finance_officer",

  // Regional/Hierarchy scope
  CLUSTER_MANAGER: "cluster_manager",
  COMMERCIAL_OFFICER: "commercial_officer",

  // Local/Operational scope
  PLUMBER: "agent",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES = Object.values(ROLES)

/**
 * Human-readable labels for UI display.
 */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.SYSTEM_ADMIN]: "System Administrator",
  [ROLES.HEAD_COMMERCIAL]: "Head Commercial",
  [ROLES.FINANCE_OFFICER]: "Finance Officer",
  [ROLES.CLUSTER_MANAGER]: "Cluster Manager",
  [ROLES.COMMERCIAL_OFFICER]: "Commercial Officer",
  [ROLES.PLUMBER]: "Plumber (Agent)",
}
