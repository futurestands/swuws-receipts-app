import { db } from "@/lib/db"
import { managedTemplate, templateVersion } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export type TemplateListRow = {
  id: string
  name: string
  code: string
  category: string
  type: string
  description: string | null
  activeVersionId: string | null
  createdAt: Date
  updatedAt: Date
  activeContent: string | null
  versionNumber: number
}

export async function loadTemplateRows(): Promise<TemplateListRow[]> {
  const rows = await db
    .select({
      id: managedTemplate.id,
      name: managedTemplate.name,
      code: managedTemplate.code,
      category: managedTemplate.category,
      type: managedTemplate.type,
      description: managedTemplate.description,
      activeVersionId: managedTemplate.activeVersionId,
      createdAt: managedTemplate.createdAt,
      updatedAt: managedTemplate.updatedAt,
      activeContent: templateVersion.content,
      versionNumber: templateVersion.versionNumber,
    })
    .from(managedTemplate)
    .leftJoin(templateVersion, eq(managedTemplate.activeVersionId, templateVersion.id))
    .orderBy(managedTemplate.category, managedTemplate.name)

  return rows.map((row) => ({
    ...row,
    activeContent: row.activeContent ?? null,
    versionNumber: row.versionNumber ?? 0,
  }))
}
