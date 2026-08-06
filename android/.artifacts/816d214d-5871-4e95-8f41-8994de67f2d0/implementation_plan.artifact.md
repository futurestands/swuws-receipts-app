# Fixes for Printing, Scrolling, and Receipt Deletion

This plan addresses mobile usability issues: non-functional printing on the meter reading side, restricted scrolling on the dashboard, and making it easier to delete (void) receipts.

## 1. Quick Receipt Deletion (Voiding)
Currently, users must navigate to the receipt details page to void a receipt. I will add a "Void" button directly to the `ReceiptsTable` for authorized users.

### [Component Name] - Receipts Dashboard

#### [MODIFY] [receipts-table.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/dashboard/receipts-table.tsx)
- Add a new "Actions" column to the table.
- Include a small `VoidReceiptButton` in each row.
- Import `VoidReceiptButton` from the details folder (I will move it to a more shared location if necessary, but for now I'll use it as-is).

## 2. Fix Dashboard Scrolling
The user reported the dashboard is "fixed in one position" and they "can't scroll to end". This is often caused by `overflow-hidden` containers on mobile or fixed heights in the layout.

#### [MODIFY] [responsive-table.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/components/ui/responsive-table.tsx)
- Change `overflow-hidden` to `overflow-visible` on the main container to ensure it doesn't clip vertical content or interfere with page scrolling on mobile devices.

#### [MODIFY] [app-shell.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/components/layout/app-shell.tsx)
- Ensure the `<main>` area doesn't have restrictive overflow settings that block natural scrolling on Android Chrome/Capacitor.

## 3. Meter Reading Printing Fix
The `window.print()` command often fails in Capacitor native apps because there is no system print spooler configured by default.

#### [MODIFY] [reading-entry-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/components/billing/reading-entry-form.tsx)
- Adjust the print logic to better handle the mobile environment.
- Ensure the print dialog doesn't lock the UI ("unable to continue").

## Verification Plan

### Manual Verification
1. **Scrolling**: Open the dashboard on an Android device and verify the page scrolls to the bottom.
2. **Deletion**: Check if a "Void" button appears on each receipt row and works as expected.
3. **Printing**: Capture a meter reading and click "Print" to see if the preview opens correctly on mobile.
