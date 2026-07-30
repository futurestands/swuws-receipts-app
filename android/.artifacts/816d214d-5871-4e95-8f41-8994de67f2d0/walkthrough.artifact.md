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
  - `androidx.lifecycle` forced to `2.7.0`.
  - `androidx.window` forced to `1.3.0`.
  - `com.google.firebase:firebase-annotations` forced to `16.2.0`.
- **Plugin Patching**: Updated `node_modules` for Capacitor plugins (barcode-scanner, community-android) to align their buildscripts with the project's stable AGP and Kotlin (`2.0.21`) versions.

### 4. Project Configuration Cleanup
- Removed experimental and potentially conflicting flags from `gradle.properties` (e.g., `android.dependency.useConstraints`, `android.newDsl`).

## Verification Results
- **Gradle Sync**: Successful.
- **Build**: `./gradlew :app:assembleDebug` completed successfully.

> [!TIP]
> Always verify that your local environment (Android Studio, JDK) is compatible with the selected Gradle and AGP versions. This project is now configured for high stability.
