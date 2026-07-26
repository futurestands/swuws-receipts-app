import {
  pgTable,
  text,
  timestamp,
  bigint,
  integer,
  index,
} from "drizzle-orm/pg-core"
import { waterScheme } from "./hierarchy"
import { user } from "./auth"

/**
 * Module 1 (Customer Management).
 */
export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    customerAccount: text("customerAccount").unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    waterSchemeId: text("waterSchemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    meterRef: text("meterRef").unique(),
    serialNo: text("serialNo"),
    lastReading: bigint("lastReading", { mode: "number" }).notNull().default(0),
    lastReadingDate: timestamp("lastReadingDate"),
    notes: text("notes"),
    openingArrears: integer("openingArrears").notNull().default(0),
    accountBalance: bigint("accountBalance", { mode: "number" }).notNull().default(0),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("customer_name_idx").on(table.name),
    schemeIdx: index("customer_scheme_idx").on(table.waterSchemeId),
  }),
)

export type Customer = typeof customer.$inferSelect
