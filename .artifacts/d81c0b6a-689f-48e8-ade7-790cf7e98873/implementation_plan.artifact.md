# Implementation Plan - Notification Center Expansion

This plan outlines the expansion of the operational notification system to improve team coordination and data awareness across Billing, Meter Reading, and Reconciliation modules.

## User Review Required

> [!NOTE]
> These notifications are internal to the web portal and will appear in the top-right notification bell. They do not send external SMS or emails, which helps keep the system's operating costs low.

## Proposed Changes

### Meter Reading Domain

#### [MODIFY] [billing-engine.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing-engine.ts)
Update `cancelMeterReading` to notify the original field agent when their reading is reversed by an administrator.
- **Message**: "Your reading for [Customer Name] was cancelled by [Admin Name]."
- **Trigger**: Only when an Admin cancels a reading they did not create.

### Billing Lifecycle Domain

#### [MODIFY] [billing.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/billing.ts)
Update `updateCollectionPeriodStatus` to notify all field agents when a new Billing Period is activated.
- **Target**: All active users with `receipts.create` permission.
- **Message**: "New Billing Period Active: [Period Name] is now open for collection and readings."

### Reconciliation Domain

#### [MODIFY] [approval.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/approval.ts)
Enhance `submitForReview` to explicitly target users with the `finance_officer` role for reconciliation sign-offs.
- **Message**: "Reconciliation Sign-off Required: Batch [Batch ID] is ready for final approval."

---

## Verification Plan

### Manual Verification
1. **Cancellation Alert**:
   - As an Admin, cancel a reading captured by a Plumber.
   - Log in as the Plumber and verify the notification appears.
2. **Activation Alert**:
   - As an Admin, activate a new Billing Period.
   - Verify that all active agents receive a notification about the new period.
3. **Reconciliation Alert**:
   - Submit a reconciliation batch for review.
   - Verify that the designated finance/admin users receive the sign-off alert.
