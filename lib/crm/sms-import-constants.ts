export const SMS_IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const SMS_IMPORT_MAX_ROWS = 50_000
export const SMS_PURPOSES = ["Bill Reminders", "Seasonal Greetings", "Alerts"] as const
export const SMS_SAMPLE_CSV = [
  "MeterRef,Phone,BillNumber,CustomerName,Period,AccountBalance",
  "60000123,0770000001,880001,Example Customer One,202607,45000",
  "60000124,256782000002,880002,Example Customer Two,202607,12500",
].join("\r\n")
