# Implementation Plan: Android Assets & Hardware Integration

This plan focuses on professionalizing the Android application by adding custom branding (Icons & Splash Screen) and preparing the foundation for native hardware access (Bluetooth printing & QR scanning).

## User Review Required

> [!IMPORTANT]
> **Source Images Needed**: To generate professional icons and splash screens, you should provide two high-resolution images:
> 1. `assets/icon.png`: **1024 x 1024 px** (The app icon)
> 2. `assets/splash.png`: **2732 x 2732 px** (The loading screen)
>
> Until these are provided, I will use your current web icons as placeholders.

## Proposed Changes

---

### 1. Asset Generation (Branding)

#### [NEW] Assets Pipeline
- Install `@capacitor/assets` to automatically generate all 20+ required Android icon and splash screen sizes.
- Create an `assets/` directory in the project root.

#### [MODIFY] Android Resources
- Run the asset generator to overwrite the default Capacitor/Android icons with SWUWS branding.

---

### 2. Native Capabilities (Hardware Access)

#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/android/app/src/main/AndroidManifest.xml)
- Add required Android permissions for future features:
    - `BLUETOOTH` & `BLUETOOTH_ADMIN`: For portable thermal printing.
    - `CAMERA`: For scanning customer ID/Meter QR codes.

#### [TODO] Install Native Plugins
- `@capacitor/barcode-scanner`: For high-speed QR detection.
- `@capacitor-community/bluetooth-le`: For communication with field printers.

## Verification Plan

### Manual Verification
1. **Asset Check**: Run the generation script and verify that the `android/app/src/main/res/mipmap-*` folders are updated with the new icons.
2. **Permissions Check**: Open the app on your phone. Go to **Settings > Apps > SWUWS**. **Verify**: The Camera and Bluetooth permissions are listed as available.
3. **Studio Sync**: In Android Studio, click **"Sync Project with Gradle Files"**. **Verify**: No errors occur.
