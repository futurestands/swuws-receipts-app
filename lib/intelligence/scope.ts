import type { UserPermissionsContext } from "@/lib/permissions"
import { intelligenceHierarchyFilter } from "@/lib/production/scope"

export function applyIntelligenceSchemeFilter(user: UserPermissionsContext, targetSchemeId?: string | null) {
  return intelligenceHierarchyFilter(user, targetSchemeId)
}
