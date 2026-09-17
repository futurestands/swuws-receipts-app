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
  phone: ["Phone", "Telephone", "Mobile", "Contact", "PhoneNumber"],
  address: "VillageName",
  schemeName: "SchemeName",
  meterRef: "MeterRef",
  serialNo: "MeterSerial",
  lastReading: ["InitialReading", "BaselineReading", "OpeningReading", "StartReading", "LastReading"],
  openingArrears: ["OpeningArrears", "Arrears", "Balance Brought Forward", "BalanceBroughtForward", "Brought Forward"],
  category: ["Category", "Type", "CustomerType"],
  notes: "Notes",
}

export const DEFAULT_BILLING_IMPORT_MAPPING = {
  accountNumber: ["AccountNumber", "Account Number", "CustID", "Account", "AccountNo", "Account #", "CustomerRef", "CustomerAccount", "Customer No", "CustomerNo", "Code", "Ref", "Reference", "Acc No", "Acct No", "Cust ID", "ID", 0],
  billAmount: ["BillAmount", "MonthlyBill", "CurrentCharges", "Bill Amount", 1],
  arrears: ["Balance Brought Forward", "Arrears", "OpeningBalance", "Brought Forward", "Opening Arrears", 2],
  currentCharges: ["CurrentCharges", "BillAmount", "MonthlyBill"],
  totalDue: ["TotalAmountDue", "TotalDue", "Balance", "GrandTotal", "Total Amount", "Amount Due", "Closing Balance"],
  dueDate: ["DueDate", "Due Date", 3],
  billingDate: ["BillingDate", "Billing Date", "Bill Date", "ReadingDate", "Reading Date"],
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

export const DEFAULT_DAILY_SYNC_MAPPING = {
  accountNumber: ["AccountNumber", "Account Number", "CustID", "Account", "AccountNo", "Account #", "CustomerRef", "CustomerAccount", "Customer No", "CustomerNo", "Code", "Ref", "Reference", "Acc No", "Acct No", "Cust ID", "ID", "MeterRef", 0],
  totalDue: ["TotalAmountDue", "TotalDue", "Balance", "GrandTotal", "Total Amount", "Amount Due", "Closing Balance", "TotalCharges", "AccountBalance", 1],
  paymentDate: ["LastPaymentDate", "PaymentDate", "Last Payment Date", "Date"],
}

/**
 * Headers written into Template Hub and starter Excel files.
 * Aliases above still match Pegasus files that use other names.
 */
export const CANONICAL_IMPORT_TEMPLATES: Record<string, Record<string, string>> = {
  "import.billing.monthly": {
    accountNumber: "AccountNumber",
    billAmount: "BillAmount",
    arrears: "Arrears",
    totalDue: "TotalDue",
    dueDate: "DueDate",
    billingDate: "BillingDate",
  },
  "import.daily.collections": {
    accountNumber: "AccountNumber",
    totalDue: "TotalAmountDue",
    paymentDate: "LastPaymentDate",
  },
  "import.customers.bulk": {
    name: "Name",
    customerAccount: "CustomerRef",
    phone: "Phone",
    address: "VillageName",
    schemeName: "SchemeName",
    meterRef: "MeterRef",
    serialNo: "MeterSerial",
    lastReading: "InitialReading",
    openingArrears: "OpeningArrears",
    category: "Category",
    notes: "Notes",
  },
  "import.hierarchy.master": {
    clusterName: "Region",
    branchName: "AreaOffice",
    schemeName: "SchemeName",
    schemeCode: "SchemeCode",
    serviceArea: "ServiceArea",
  },
  "import.users.bulk": {
    name: "Name",
    email: "Email",
    password: "Password",
    role: "Role",
    cluster: "Cluster",
    area: "Area",
    scheme: "Scheme",
    phone: "Phone",
    status: "Status",
  },
  "import.tariffs.bulk": {
    targetType: "Type",
    targetName: "AreaName",
    customerCategory: "Category",
    unitPrice: "UnitPrice",
    serviceFee: "ServiceFee",
    vatPercentage: "VAT",
    active: "Status",
  },
}

