# Implementation Plan - Unified Receipt Form & Search Integration

The previous implementation provided an extra search bar at the top of the form, which caused confusion. This plan unifies the "Customer Name" field with the search logic, ensuring that typing directly into the required name field triggers the auto-fill and balance tracking as requested.

## User Review Required

> [!IMPORTANT]
> I am removing the redundant "Customer" search box at the top. The **Customer Name** field itself will now become the search bar. This provides a cleaner, more intuitive experience: type the name, see suggestions, select to auto-fill everything.

## Proposed Changes

### Dashboard UI

#### [MODIFY] [receipt-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/receipt-form.tsx)
-   **Remove Redundant Field**: Delete the standalone "Customer" search block at the top of the form.
-   **Upgrade Customer Name Field**:
    -   Bind the `Customer name` input to trigger the `quickSearchCustomers` logic.
    -   Display the suggestion dropdown directly below the `Customer name` field.
    -   When a customer is selected:
        -   Populate **Name**, **Account #**, **Phone**, **Address**, **Scheme**, and **Branch**.
        -   Lock these fields to the profile (using `readOnly`).
        -   Show the **Live Balance Tracker** and the **Disconnect** button.
-   **Manual Entry Support**: If no suggestion is selected, the field remains a standard text input for new customers.
-   **Refined Layout**: Reorder the fields to follow a logical flow: Name (Search) -> Identity Snapshot -> Financials -> Metadata.

---

## Verification Plan

### Manual Verification
1.  **Unified Search**:
    -   Go to the "Customer name" field.
    -   Type a few letters.
    -   Verify the dropdown appears with matching customers.
2.  **Auto-fill Trigger**:
    -   Select a customer from the dropdown.
    -   Verify the **Account number**, **Phone**, **Branch**, and **Scheme** are all instantly filled and the **Balance Tracker** appears.
3.  **Balance Tracking**:
    -   Change the "Amount paid" and verify the "Resulting Arrears" updates in real-time.
4.  **Correction**:
    -   Click "Disconnect" or "Change".
    -   Verify all fields are cleared and ready for either a new search or manual entry.
