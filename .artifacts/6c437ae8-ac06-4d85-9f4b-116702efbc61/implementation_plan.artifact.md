# Implementation Plan: Mobile App Download Integration

This plan adds a dedicated "Mobile App" section to the user's account page, allowing agents to download the Android APK directly from the portal for testing and field use.

## User Review Required

> [!IMPORTANT]
> **APK File Placement**: I will add the download button to the UI, but it will only work once you place your generated APK file into the following folder on your computer:
> `C:\Users\MJ\Downloads\SWUWS_Complete_Project\RECEIPT\public\swuws-portal.apk`
>
> **Android Studio Step**: After you build the signed APK in Android Studio, rename it to `swuws-portal.apk` and copy it to that `public` folder before pushing to Vercel.

## Proposed Changes

### 1. Account Page Enhancement

#### [MODIFY] [account-client.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/app/dashboard/account/account-client.tsx)
- Add a new full-width card: **"SWUWS Mobile App"**.
- Features:
    - **Description**: Explains that the app is optimized for field collections, QR scanning, and Bluetooth printing.
    - **Download Button**: A large, primary action button that triggers the download of the `.apk` file.
    - **Visuals**: Uses the `Smartphone` and `Download` icons for a professional look.

## Verification Plan

### Manual Verification
1. Navigate to the **My Account** page.
2. **Verify**: The new "Mobile App" card is visible below the profile/security sections.
3. Click the **"Download for Android"** button.
4. **Verify**: The browser attempts to download `swuws-portal.apk` (ensure the file is in the `public` folder first).
