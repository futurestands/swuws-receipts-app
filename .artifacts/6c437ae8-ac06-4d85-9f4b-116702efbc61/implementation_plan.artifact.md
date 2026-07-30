# Implementation Plan: Category-Based Tariff System

This plan introduces support for different water rates within a single scheme based on customer categories (Domestic, Institutional, PSP, Commercial).

## User Review Required

> [!IMPORTANT]
> **Data Migration**: I will add a `category` field to all existing customers. By default, I will set everyone to **'Domestic'**. You will then be able to update these categories via the Bulk Import tool.
>
> **Tariff Hierarchy**: The billing engine will now look for a tariff that matches **both** the Scheme/Branch AND the Customer Category. If no category-specific tariff exists, it will fall back to the base rate if you configure one (or require a category-specific one).

## Proposed Changes

---

### 1. Database Schema Updates

#### [MODIFY] [lib/db/schema/crm.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/crm.ts)
- Add `category` column to the `customer` table.
- Type: `text`, default: `'domestic'`.
- Allowed values: `domestic`, `institutional`, `psp`, `commercial`.

#### [MODIFY] [lib/db/schema/billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/billing.ts)
- Add `customerCategory` column to `tariff_configuration`.
- Update the unique index `tariff_target_idx` to include `customerCategory`. This allows you to have 4 different prices for the same Water Scheme.

#### [NEW] [db/migrations/0037_customer_category_tariffs.sql](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/db/migrations/0037_customer_category_tariffs.sql)
- Migration script to add the columns and update the constraints.

---

### 2. Import Engine Hardening

#### [MODIFY] [app/actions/customer-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/customer-import.ts)
- Update the Excel schema to include a "Category" column.
- Logic: Map "Domestic", "Institution", etc., from Excel to the internal database keys.

#### [MODIFY] [app/actions/tariff-import.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/tariff-import.ts)
- Update the Tariff Excel schema to include "Category".
- Ensure bulk updates can set different prices for different categories in the same file.

---

### 3. Billing Engine Intelligence

#### [MODIFY] [app/actions/billing-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing-engine.ts)
- **`getTariffForCustomer`**:
    - Fetch the customer's category first.
    - Query `tariff_configuration` where `targetId` matches AND `customerCategory` matches the customer's category.
- **`upsertTariff`**: Update to handle the new category field.

---

### 4. Admin UI Enhancements

#### [MODIFY] [app/admin/tariff-panel.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/admin/tariff-panel.tsx)
- Update the "Add Tariff" form to include a "Category" dropdown.
- Update the display table to show which category each price applies to.

## Verification Plan

### Automated Verification
- Update `math.test.ts` to verify that a "Commercial" customer is billed correctly using a commercial tariff, even if a cheaper "Domestic" tariff exists for the same scheme.

### Manual Verification
1. Import a customer with category "Institutional".
2. Create a "Domestic" tariff for their scheme (e.g. 2000 UGX) and an "Institutional" tariff (e.g. 5000 UGX).
3. Record a meter reading for that customer.
4. **Verify**: The "Amount Due" is calculated using the 5000 UGX rate.
