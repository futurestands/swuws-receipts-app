import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// Reference data (admin-configurable)
// ---------------------------------------------------------------------------

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const cluster = pgTable("cluster", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  organizationId: text("organizationId").references(() => organization.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const branch = pgTable("branch", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  clusterId: text("clusterId").references(() => cluster.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const paymentMethod = pgTable("payment_method", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Module 2 (Branch & Scheme Management). A water scheme belongs to a
 * branch and has a free-text service area description.
 */
export const waterScheme = pgTable(
  "water_scheme",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    branchId: text("branchId").references(() => branch.id, { onDelete: "set null" }),
    serviceArea: text("serviceArea"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    branchIdx: index("water_scheme_branch_idx").on(table.branchId),
  }),
)

export type Organization = typeof organization.$inferSelect
export type Cluster = typeof cluster.$inferSelect
export type Branch = typeof branch.$inferSelect
export type PaymentMethod = typeof paymentMethod.$inferSelect
export type WaterScheme = typeof waterScheme.$inferSelect
