# Fix App Icon Not Updating

This plan addresses the issue where the Android app icon remains as the default logo even after custom icons were added to the project.

## Root Cause Analysis

Modern Android devices use **Adaptive Icons**, which consist of separate foreground and background layers. I discovered that:
1.  The project contains default Android vector drawables (the Android mascot) in `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`.
2.  In Android's resource system, these XML vectors take priority over the PNG images you added to the `mipmap` folders.
3.  As a result, even though your new icons are in the project, the system continues to render the default Android robot icon.

## Proposed Changes

### Android Native Assets

#### [DELETE] `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- Removing this file will force Android to use the PNG images you placed in the `mipmap-hdpi`, `mipmap-xhdpi`, etc., folders.

#### [DELETE] `android/app/src/main/res/drawable/ic_launcher_background.xml`
- Removing the default grid background vector ensures the system uses the solid color background defined in your configuration.

### Web Assets (Optional but Recommended)

#### [MODIFY] [manifest.json](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/public/manifest.json)
- The current manifest refers to `icon-192.png` and `icon-512.png` which are missing from the `public` folder.
- I will update this to point to the existing `icon.svg` or `apple-icon.png` to ensure the PWA/Web icon is also correct.

---

## Verification Plan

### Manual Verification
- After applying the changes, you will need to **clean and rebuild** the Android project in Android Studio.
- Deploy the app to a physical device or emulator.
- Verify that the launcher icon now shows your logo.
