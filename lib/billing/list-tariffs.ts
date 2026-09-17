import { db } from "@/lib/db"
import { branch, tariffConfiguration, waterScheme } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"

export type TariffListRow = {
  id: string
  targetType: string
  targetId: string
  targetName: string
  customerCategory: string
  unitPrice: number
  serviceFee: number
  vatPercentage: number
}

export async function loadTariffRows(): Promise<TariffListRow[]> {
  const rows = await db
    .select({
      id: tariffConfiguration.id,
      targetType: tariffConfiguration.targetType,
      targetId: tariffConfiguration.targetId,
      customerCategory: tariffConfiguration.customerCategory,
      unitPrice: tariffConfiguration.unitPrice,
      serviceFee: tariffConfiguration.serviceFee,
      vatPercentage: tariffConfiguration.vatPercentage,
      branchName: branch.name,
      schemeName: waterScheme.name,
    })
    .from(tariffConfiguration)
    .leftJoin(
      branch,
      and(eq(tariffConfiguration.targetType, "branch"), eq(tariffConfiguration.targetId, branch.id)),
    )
    .leftJoin(
      waterScheme,
      and(eq(tariffConfiguration.targetType, "scheme"), eq(tariffConfiguration.targetId, waterScheme.id)),
    )
    .orderBy(desc(tariffConfiguration.createdAt))

  return rows.map((t) => ({
    id: t.id,
    targetType: t.targetType,
    targetId: t.targetId,
    targetName:
      t.targetType === "branch"
        ? t.branchName || "Unknown Branch"
        : t.schemeName || "Unknown Scheme",
    customerCategory: t.customerCategory,
    unitPrice: Number(t.unitPrice),
    serviceFee: Number(t.serviceFee),
    vatPercentage: t.vatPercentage,
  }))
}
