# Focused Delivery Dialog for Meter Readings

Redesign the post-confirmation workflow to use a focused Modal (Dialog) instead of an inline section. This ensures that after confirming a reading, the agent is presented exclusively with the two delivery options (Print and SMS) without having to scroll or interact with the rest of the page.

## User Review Required

> [!IMPORTANT]
> The "Confirm & Save Reading" button will now automatically open a centered pop-up window containing the Print and SMS choices. The rest of the page will be obscured until the dialog is closed.

## Proposed Changes

### Frontend (Components)

#### [MODIFY] [reading-entry-form.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/components/billing/reading-entry-form.tsx)
- **Import Dialog Components**: Add `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`.
- **Exclusive Modal View**:
    - Wrap the current "Success & Delivery Options" cards in a `Dialog`.
    - Set the `open` state of the dialog to `!!lastSubmission`.
    - Use `onOpenChange={(open) => !open && setLastSubmission(null)}` to reset state when closed.
- **Improved Separation**:
    - The Dialog will prominently show the two cards (Print and SMS) as the ONLY available actions.
    - Add `no-print` to the `DialogContent` and `DialogOverlay` to ensure they don't appear in the physical printout.
- **Refine Layout**:
    - Ensure the "Amount Due" is bold and central in the dialog.
    - Keep the "Resend" and "History" synchronization intact.

---

## Verification Plan

### Manual Verification
1. Capture a meter reading and click "Confirm & Save".
2. Verify that a Modal pops up immediately.
3. Verify that the capture form and history list are hidden/obscured behind the modal.
4. Click "Print Ticket" inside the modal and verify the print preview shows only the receipt.
5. Click "Send SMS" inside the modal and verify the success toast appears and the button updates.
6. Click "Close" or outside the modal and verify it returns to the empty capture form.
7. Click "Reprint" in the history table and verify the same Modal opens for that historical record.
