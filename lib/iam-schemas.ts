import { z } from "zod"

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  code: z.string().trim().min(2, "Code must be at least 2 characters").transform(val => val.toLowerCase().replace(/\s+/g, "_")),
  description: z.string().trim().optional(),
  level: z.number().int().min(0).max(100),
  parentId: z.string().nullable().optional(),
  active: z.boolean().default(true),
})
