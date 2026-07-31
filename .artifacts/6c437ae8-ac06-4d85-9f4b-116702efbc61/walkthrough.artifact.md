# Walkthrough: App Icon & Manifest Fix

I have resolved the issue where the app icon was not updating on Android and improved the PWA/Web manifest configuration.

## Changes Made

### 1. Android Native Fix
- **Removed Default Vectors**: Deleted `ic_launcher_foreground.xml` and `ic_launcher_background.xml` from the Android resource folders.
- **Reason**: In Android's build system, XML vector drawables take priority over PNG images. By removing these default "Android Mascot" vectors, the system is now forced to use the PNG logo assets you added to the `mipmap` folders.

### 2. Web/PWA Manifest Update
- **Updated `manifest.json`**: Changed the `icons` configuration to point to available assets (`icon.svg` and `apple-icon.png`) instead of missing `icon-192.png` and `icon-512.png` files.
- **Benefit**: This ensures that when the portal is accessed via a browser or installed as a PWA, the correct logo is displayed.

## Verification & Next Steps

> [!IMPORTANT]
> To see the changes on your device, you MUST perform a clean rebuild of the Android project.

1.  **Clean Project**: In Android Studio, go to `Build` > `Clean Project`.
2.  **Rebuild**: Go to `Build` > `Rebuild Project`.
3.  **Deploy**: Run the app on your device or emulator. The launcher icon should now correctly display your logo.

> [!TIP]
> If the background of your icon appears as a plain white square and you want a different color, you can change the hex code in [ic_launcher_background.xml](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/android/app/src/main/res/values/ic_launcher_background.xml).
