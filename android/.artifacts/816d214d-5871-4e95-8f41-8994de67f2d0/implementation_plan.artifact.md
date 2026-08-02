# Project Stabilization Plan - Phase 2 (Dependency Resolution)

The project is currently failing to build because Capacitor plugins in `node_modules` are using extremely experimental versions of the Android Gradle Plugin (8.13.0) and Jetpack Compose (1.8.1/1.4.0), which are not yet available or stable in public repositories.

## Proposed Changes

### [Component Name] - Capacitor Plugins (node_modules)

I will patch the `build.gradle` files of the affected plugins to use stable versions that align with the root project.

#### [MODIFY] [barcode-scanner build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/node_modules/@capacitor/barcode-scanner/android/build.gradle)
- Downgrade AGP from `8.13.0` to `8.7.3`.
- Downgrade Compose Material 3 from `1.4.0` to `1.3.1`.
- Downgrade Activity Compose from `1.11.0` to `1.9.3`.
- Downgrade CameraX from `1.5.1` to `1.4.0`.

#### [MODIFY] [capacitor-android build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/node_modules/@capacitor/android/capacitor/build.gradle)
- Downgrade AGP from `8.13.0` to `8.7.3`.
- Ensure default library versions match the root project's stability targets.

#### [MODIFY] [community-bluetooth-le build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/node_modules/@capacitor-community/bluetooth-le/android/build.gradle)
- Downgrade AGP from `8.13.0` to `8.7.3`.

#### [MODIFY] [haptics build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/node_modules/@capacitor/haptics/android/build.gradle)
- Downgrade AGP from `8.13.0` to `8.7.3`.

#### [MODIFY] [splash-screen build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/node_modules/@capacitor/splash-screen/android/build.gradle)
- Downgrade AGP from `8.13.0` to `8.7.3`.

## Verification Plan
1. **Sync**: Perform a Gradle Sync.
2. **Build**: Run `Build > Assemble 'app'` to verify that all dependencies are now resolving and the app compiles.
