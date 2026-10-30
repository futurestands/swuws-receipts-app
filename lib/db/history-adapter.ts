import "server-only"
import { sql } from "drizzle-orm"
import { db, type DatabaseTransaction } from "@/lib/db"
import type { SessionUser } from "@/lib/session"
import { resolveCreatorOrganizationId } from "@/lib/scopes/org-resolver"

/**
 * SECURE HISTORY TRANSACTION ADAPTER
 *
 * Executes history persistence inside a serializable transaction block while initializing
 * the required database session GUC variables (swuws.history_organization_id and swuws.history_actor_id).
 * Never trusts caller-supplied actor or organization parameters.
 */
export async function withHistoryTransaction<T>(
  user: SessionUser,
  callback: (tx: DatabaseTransaction, organizationId: string) => Promise<T>
): Promise<T> {
  const organizationId = await resolveCreatorOrganizationId(user)
  if (!organizationId) {
    throw new Error("Organization scope is required for history persistence")
  }

  return db.transaction(
    async (tx) => {
      // 1. Initialize session GUCs
      await tx.execute(sql`SELECT set_config('swuws.history_organization_id', ${organizationId}, true)`)
      await tx.execute(sql`SELECT set_config('swuws.history_actor_id', ${user.id}, true)`)

      // 2. Execute callback
      return callback(tx, organizationId)
    },
    {
      isolationLevel: "serializable",
    }
  )
}
