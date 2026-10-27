import { describe, expect, it } from "vitest"
import { createLogSchema, productionDateSchema, sourceSchema } from "./schemas"
import { productionTestDatabaseUrl } from "./test-database"

const input = { schemeId: "sch-1", sourceId: "src-1", productionDate: "2024-02-29", waterProducedM3: "12.30", waterSuppliedM3: "0", operatingHours: "0", notes: "", requestKey: "00000000-0000-4000-8000-000000000001" }
describe("production input contract", () => {
  it("preserves explicit zero and distinguishes missing values", () => {
    expect(createLogSchema.parse(input)).toMatchObject({ waterSuppliedM3: "0.00", operatingHours: "0.00" })
    expect(createLogSchema.parse({ ...input, waterSuppliedM3: "", operatingHours: "" })).toMatchObject({ waterSuppliedM3: null, operatingHours: null })
  })
  it.each(["", "-1", "NaN", "Infinity", "1e2", "1.234", "10000000000", 0, NaN, Infinity])("rejects invalid measured volume %s", waterProducedM3 => {
    expect(createLogSchema.safeParse({ ...input, waterProducedM3 }).success).toBe(false)
  })
  it.each(["2023-02-29", "2024-04-31", "2024-00-01", "9999-01-01", "2024-01-01T00:00:00Z"])("rejects invalid/future production day %s", v => expect(productionDateSchema.safeParse(v).success).toBe(false))
  it("rejects client-owned states, unknown fields, excessive hours and notes", () => {
    for (const extra of [{status:"verified"},{operatingHours:"24.01"},{notes:"x".repeat(2001)},{recordedById:"other"}]) expect(createLogSchema.safeParse({ ...input, ...extra }).success).toBe(false)
  })
  it("validates bucket pairs and preserves zero regime", () => {
    const source = { schemeId:"s",sourceName:"Spring",technology:"gravity",capacityMethod:"bucket_test",regimeHoursPerDay:"0",containerVolumeLitres:"20",averageFillTimeSeconds:"10" }
    expect(sourceSchema.parse(source).regimeHoursPerDay).toBe("0.00")
    expect(sourceSchema.safeParse({...source,averageFillTimeSeconds:"0"}).success).toBe(false)
    expect(sourceSchema.safeParse({...source,averageFillTimeSeconds:""}).success).toBe(false)
    expect(sourceSchema.safeParse({...source,technology:"invalid"}).success).toBe(false)
  })
})
describe("disposable database guard", () => {
  it("fails closed without an explicit safe target", () => {
    for(const value of ["", "postgres://u@remote/db_production_test", "postgres://u@localhost/business", "postgres://u@127.0.0.1/db_production_test?host=remote"]) expect(()=>productionTestDatabaseUrl(value,undefined)).toThrow()
  })
  it("rejects same database with different credentials or loopback alias",()=>expect(()=>productionTestDatabaseUrl("postgres://a@127.0.0.1:5555/db_production_test","postgres://b@localhost:5555/db_production_test")).toThrow())
  it("accepts a separately named disposable database",()=>expect(productionTestDatabaseUrl("postgres://a@127.0.0.1:5555/db_production_test", "postgres://a@127.0.0.1:5555/business")).toContain("db_production_test"))
})
