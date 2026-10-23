export const PEGASUS_HEADERS = ["MeterRef", "Phone", "BillNumber", "CustomerName", "Period", "AccountBalance"] as const
export const PEGASUS_SAMPLE_CSV = [
  PEGASUS_HEADERS.join(","),
  "60000123,770000001,8820001,Example Customer,202607,45000",
].join("\n")

