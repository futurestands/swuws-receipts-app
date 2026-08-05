# Mobile App Fixes: Update Button & App Icon

This plan addresses the two issues reported: the "Update" button not working on mobile and the app icon not reflecting the new logo.

## 1. Update Button Fix
The "Update" button currently uses a relative path (`/swuws-portal.apk`). In a Capacitor app, relative paths resolve to `http://localhost`, which does not contain the APK. It needs to point to the absolute URL of the production server.

### [Component Name] - Account Section

#### [MODIFY] [account-client.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/dashboard/account/account-client.tsx)
- Update the component to accept `siteUrl` as a prop.
- Change the download link to use the absolute `siteUrl`.
- Add `target="_blank"` and `rel="noopener noreferrer"` to ensure it opens in the system browser, which triggers the download correctly on Android.

#### [MODIFY] [page.tsx](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/app/dashboard/account/page.tsx)
- Fetch the absolute `siteUrl` using the existing `getSiteUrl` helper.
- Pass `siteUrl` to the `AccountClient` component.

---

## 2. App Icon Fix
The current app icons in `android/app/src/main/res/mipmap-*` are all identical copies of a large 169KB image (`img.png`). Android requires icons to be specifically sized for different screen densities (mdpi, hdpi, etc.). Using a single large file often causes the system to fall back to the default icon or display nothing.

### Proposed Solution
I will provide instructions and a script/guide to correctly generate these icons using Android Studio's built-in **Image Asset Studio**. This is the only way to ensure the icons are correctly masked, padded, and sized for all Android versions (including Adaptive Icons).

#### [GUIDE] App Icon Generation
1. Right-click the `app` folder in Android Studio.
2. Select **New > Image Asset**.
3. Set **Icon Type** to "Launcher Icons (Adaptive and Legacy)".
4. For the **Foreground Layer**, select the logo provided by the user (or `assets/logo.jpg`).
5. Adjust the **Scaling** so the logo fits within the safe zone (circle).
6. Click **Next** and **Finish**. This will automatically generate all required files in the `mipmap` folders.

## Verification Plan

### Update Button
1. Deploy the app to a test environment.
2. Click the "Update" button on an Android device.
3. Verify that it opens the browser and starts the download of `swuws-portal.apk`.

### App Icon
1. Rebuild the app in Android Studio.
2. Install the app on an emulator or device.
3. Verify that the new logo appears on the home screen.
