# System Logic & Calculation Architecture

This document describes the end-to-end logic of the SWUWS Collection Portal, specifically focusing on how financial data is calculated and managed.

## 1. Hierarchy & Organizational Logic
The system uses a hierarchical structure to control data visibility and reporting:
- **Branch (Area)**: The highest organizational level.
- **Water Scheme**: Sub-units within a branch.
- **Customer**: Assigned to a specific Water Scheme.

**Scoping**: Most business logic (searching, reporting, issuing receipts) applies "Area Scoping," meaning users generally only interact with data belonging to their assigned Branch or Scheme.

---

## 2. Billing & Consumption Calculation
Calculations are triggered when a **Meter Reading** is submitted.

### Key Components:
- **Consumption**: `Current Reading - Previous Reading` (measured in m³).
- **Tariff**: Looked up based on the Customer's Category (e.g., Domestic) and their location (Scheme tariff takes precedence over Branch tariff).

### The Math:
1. **Water Charge**: `Consumption (m³) × Unit Price`
2. **Subtotal**: `Water Charge + Monthly Service Fee`
3. **VAT**: `Subtotal × (VAT Percentage / 100)` (e.g., 18%)
4. **Total New Bill**: `Subtotal + VAT`

### Customer Balance Update:
When a bill is generated:
`Customer.AccountBalance = Existing Arrears + Total New Bill`

---

## 3. Payment & Receipting Logic
When a payment is received and a receipt is issued:

### Balance Reconciliation:
- **Immediate Effect**: `Customer.AccountBalance = Previous Balance - Payment Amount`.
- **Bill Linking**: If a payment is linked to a specific monthly bill (`billingRecord`), that bill's status is updated (e.g., `partially_paid` or `paid`).

### Data Integrity (Immutability):
- **Receipts are Immutable**: Once saved, a receipt record cannot be edited or deleted.
- **Voiding Logic**: To correct an error, a "Void" action is performed. This does **not** delete the receipt but creates a reversing financial entry that adds the amount back to the customer's balance.

---

## 4. Arrears & Financial Reporting
- **Arrears**: Represented by the `accountBalance` field in the database. A positive number indicates debt.
- **Daily Collections**: External payment data (bank/mobile money exports) is imported and validated for duplicates before being committed to the system's performance metrics.
- **Aggregation**: Reports sum up `billedAmount` (from readings) and `amount` (from receipts) across specified time ranges and organizational levels to calculate collection efficiency.

---

## 5. Security & Audit Logic
- **Permissions**: Every action (create customer, issue receipt, void) is gated by a granular permission system (e.g., `receipts.create`, `customers.edit`).
- **Audit Logging**: Every financial transaction and critical change is recorded in an `auditLog` table, capturing who did what, when, and from which IP address.
