# Project Stabilization Walkthrough

The project build has been stabilized by addressing several critical issues related to experimental tool versions, dependency resolution, and SDK compatibility.

## Changes Made

### 1. Build Tools Downgrade
- **Gradle**: Downgraded from `9.5.0` to `8.10.2`.
- **Android Gradle Plugin (AGP)**: Downgraded from `9.3.1` to `8.7.3`.
- **Google Services Plugin**: Downgraded from `4.4.4` to `4.4.2`.

### 2. SDK Version Alignment
- **Target/Compile SDK**: Adjusted to `35` (Android 15) for better stability across libraries.
- **Min SDK**: Increased from `24` to `26` to satisfy the requirements of the `ionbarcode-android` library.

### 3. Dependency Resolution Fixes
- **Repository Optimization**: Replaced generic `google()` shorthand with explicit `https://maven.google.com` to resolve `Content is not allowed in prolog` errors caused by invalid server responses for certain experimental artifacts.
- **Enforced Stability**: Added a `resolutionStrategy` in the root `build.gradle` to force stable versions of critical libraries:
  - `androidx.lifecycle` forced to `2.8.3` (resolving duplicate class issues).
  - `androidx.window` forced to `1.3.0`.
  - `com.google.firebase:firebase-annotations` forced to `16.2.0`.
- **Plugin Patching**: Updated `node_modules` for Capacitor plugins (barcode-scanner, android, haptics, splash-screen, community-bluetooth-le) to align their buildscripts with the project's stable AGP (`8.7.3`) and Kotlin (`2.0.21`) versions.
- **Compose & CameraX Fixes**: For `@capacitor/barcode-scanner`, downgraded experimental Compose (1.8.1 -> 1.3.1) and CameraX (1.5.1 -> 1.4.0) dependencies to ensure they can be resolved from standard repositories.

### 4. Project Configuration Cleanup
- Removed experimental and potentially conflicting flags from `gradle.properties` (e.g., `android.dependency.useConstraints`, `android.newDsl`).

### 5. Mobile App Functional Fixes
- **Update Button**: Modified the "Update to vX.X.X" button in the Account dashboard to use an absolute URL instead of a relative one. This ensures the APK download triggers correctly from the production server when clicked from within the mobile app.
- **Icon Integrity**: Identified densities mismatch in `mipmap` resources. Provided a guide to use the **Image Asset Studio** to generate standard-compliant adaptive icons.

## Verification Results
- **Gradle Sync**: Successful.
- **Build**: `./gradlew :app:assembleDebug` completed successfully.

> [!TIP]
> Always verify that your local environment (Android Studio, JDK) is compatible with the selected Gradle and AGP versions. This project is now configured for high stability.
