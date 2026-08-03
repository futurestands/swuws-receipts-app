import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// IAM Module Tables
// ---------------------------------------------------------------------------

export const iamRole = pgTable(
  "iam_role",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(), // e.g. 'admin', 'commercial_officer'
    description: text("description"),
    level: integer("level").notNull().default(0),
    parentId: text("parent_id").references((): any => iamRole.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false), // Protected roles
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table: any) => ({
    codeIdx: uniqueIndex("iam_role_code_idx").on(table.code),
    parentIdx: index("iam_role_parent_idx").on(table.parentId),
  }),
)

export const iamPermission = pgTable(
  "iam_permission",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(), // e.g. 'receipts.create'
    module: text("module").notNull(), // e.g. 'Receipts'
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("iam_permission_code_idx").on(table.code),
    moduleIdx: index("iam_permission_module_idx").on(table.module),
  }),
)

export const iamRolePermission = pgTable(
  "iam_role_permission",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => iamRole.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => iamPermission.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("own"), // own, scheme, area, cluster, organization
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    rolePermUnq: uniqueIndex("iam_role_permission_unq").on(table.roleId, table.permissionId),
    roleIdx: index("iam_role_permission_role_idx").on(table.roleId),
  }),
)

export type IamRole = typeof iamRole.$inferSelect
export type IamPermission = typeof iamPermission.$inferSelect
export type IamRolePermission = typeof iamRolePermission.$inferSelect
