# Mobile Feedback & App Update System

This plan implements a high-performance "First Response" system for field agents, including tactile feedback (vibration) and a proactive app update mechanism.

## User Review Required

> [!IMPORTANT]
> - Vibration feedback requires installing the `@capacitor/haptics` plugin.
> - Users will be able to disable vibration in their "My Account" settings.
> - The "Download APK" button will automatically change to "Update App" when a newer version is released by an administrator.

## Proposed Changes

### 1. Database & Schema

#### [NEW MIGRATION] `0039_app_versioning.sql`
- Add `latestAppVersion` to `org_settings` table.
- Add `preferences` JSONB column to `user` table to store toggle states.

#### [MODIFY] [auth.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/auth.ts) & [system.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/db/schema/system.ts)
- Update Drizzle schema definitions to include the new columns.

### 2. Hardware & Core Logic

#### [MODIFY] [mobile-hardware.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/mobile-hardware.ts)
- Integrate `@capacitor/haptics`.
- Update `hapticFeedback()` to check the user's `preferences.vibrationEnabled` before vibrating.

#### [NEW] [version.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/lib/version.ts)
- Define the hardcoded `CURRENT_APP_VERSION` (e.g., "1.0.0").

### 3. User Account & Preferences

#### [MODIFY] [account-client.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/account/account-client.tsx)
- Add a **User Preferences** section with a toggle for "Tactile Feedback (Vibration)".
- Implement logic to compare the local app version with the server version.
- **Dynamic Update Button**: If a newer version is available, change the "Download APK" button to a high-contrast "UPDATE AVAILABLE" button.

### 4. Admin & Notifications

#### [MODIFY] [settings.ts](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/actions/settings.ts)
- Add functions to update the `latestAppVersion` in the database.
- Trigger a system-wide notification when a new app version is published.

---

## Verification Plan

### Manual Verification
1. **Haptics**: Toggle vibration ON in settings. Tap a button on an Android device. Verify it vibrates. Toggle OFF and verify it stops.
2. **Version Check**: Manually set `latestAppVersion` in the DB to "1.1.0". Refresh the app on a device with "1.0.0".
3. **Update UI**: Verify the "Download APK" button now says "Update to v1.1.0 (New)".
4. **Notifications**: Verify a notification appears in the notification center saying "A new app update is available."
