/**
 * CENTRALIZED IMPORT COLUMN MAPPINGS
 *
 * Shared between validators (upload) and template generators (download).
 * These serve as the fallbacks when no custom template is configured
 * in Template Management.
 */

export const DEFAULT_HIERARCHY_IMPORT_MAPPING = {
  clusterName: "Region",
  branchName: "AreaOffice",
  schemeName: "SchemeName",
  // Matches the real header used in this organization's established
  // hierarchy import file ("SchemeCode (Optional)"), not just "SchemeCode".
  schemeCode: ["SchemeCode", "SchemeCode (Optional)", "Code"],
  serviceArea: "ServiceArea",
}

export const DEFAULT_USER_IMPORT_MAPPING = {
  name: "Name",
  email: "Email",
  password: "Password",
  role: "Role",
  cluster: "Cluster",
  area: "Area",
  scheme: "Scheme",
  phone: "Phone",
  status: "Status",
}

export const DEFAULT_CUSTOMER_IMPORT_MAPPING = {
  name: "Name",
  customerAccount: "CustomerRef",
  phone: "Phone",
  address: "VillageName",
  schemeName: "SchemeName",
  meterRef: "MeterRef",
  serialNo: "MeterSerial",
  openingArrears: ["OpeningArrears", "Arrears", "Balance Brought Forward", "BalanceBroughtForward", "Brought Forward"],
  category: "Category",
  notes: "Notes",
}

export const DEFAULT_BILLING_IMPORT_MAPPING = {
  accountNumber: "AccountNumber",
  billAmount: "BillAmount",
  arrears: ["Arrears", "Balance Brought Forward", "BalanceBroughtForward", "Brought Forward"],
  currentCharges: "CurrentCharges",
  totalDue: "TotalDue",
  dueDate: "DueDate",
}

export const DEFAULT_TARIFF_IMPORT_MAPPING = {
  targetType: "Type",
  targetName: "AreaName",
  customerCategory: "Category",
  unitPrice: "UnitPrice",
  serviceFee: "ServiceFee",
  vatPercentage: "VAT",
  active: "Status"
}
