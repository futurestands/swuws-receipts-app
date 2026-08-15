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
 * Role hierarchy, used to enforce that a user can only create or promote
 * another user to a role at or below their own level (see canCreateRole in
 * lib/permissions/index.ts). Higher number = more authority.
 *
 * This does not grant permissions by itself — actual capabilities come from
 * the dynamic IAM system (iamRoleId / getEffectivePermissions). It exists
 * only to bound *which legacy role label* one user is allowed to hand to
 * another, since a handful of code paths (billing-engine.ts cancel-reading
 * check, approval.ts approver lookup) key off this legacy `role` string
 * directly, independent of IAM permissions.
 */
export const ROLE_RANK: Record<Role, number> = {
  [ROLES.SYSTEM_ADMIN]: 100,
  [ROLES.HEAD_COMMERCIAL]: 80,
  [ROLES.FINANCE_OFFICER]: 80,
  [ROLES.CLUSTER_MANAGER]: 50,
  [ROLES.COMMERCIAL_OFFICER]: 50,
  [ROLES.PLUMBER]: 10,
}

/**
 * Human-readable labels for UI display.
 */
export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.SYSTEM_ADMIN]: "System Administrator",
  [ROLES.HEAD_COMMERCIAL]: "Head Commercial",
  [ROLES.FINANCE_OFFICER]: "Finance Officer",
  [ROLES.CLUSTER_MANAGER]: "Cluster Manager",
  [ROLES.COMMERCIAL_OFFICER]: "Commercial Officer",
  [ROLES.PLUMBER]: "Plumber (User)",
}
