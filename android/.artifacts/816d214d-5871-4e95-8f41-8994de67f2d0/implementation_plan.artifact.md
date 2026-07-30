# Project Stabilization Plan

The previous Proguard/R8 issue was fixed, but the project is currently facing major dependency resolution errors (`Content is not allowed in prolog`). These errors are likely caused by the use of extremely experimental versions of the build tools and SDK, which may not be fully supported by the current repository configuration or Gradle environment.

## Current Issues
- **Dependency Resolution Failure**: Widespread errors when parsing POM files for standard libraries (androidx, firebase, compose).
- **Experimental Versions**:
  - Gradle: 9.5.0 (Current stable is 8.x)
  - Android Gradle Plugin: 9.3.1
  - Android SDK: 36 (Current stable is 35)
  - Kotlin: 2.2.20

## Proposed Changes
I recommend downgrading to a known stable stack to resolve these resolution issues.

### [Component Name] - Build Configuration

#### [MODIFY] [gradle-wrapper.properties](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/android/gradle/wrapper/gradle-wrapper.properties)
- Downgrade `distributionUrl` to Gradle 8.10.2.

#### [MODIFY] [build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/android/build.gradle)
- Downgrade AGP to 8.7.3.

#### [MODIFY] [variables.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/android/variables.gradle)
- Downgrade `compileSdkVersion` and `targetSdkVersion` to 35.

#### [MODIFY] [node_modules/@capacitor/barcode-scanner/android/build.gradle](file:///C:/Users/MJ/Downloads/SWUWS_Complete_Project/RECEIPT/node_modules/@capacitor/barcode-scanner/android/build.gradle)
- Align AGP and Kotlin versions with the root project.

## Verification Plan
1. **Sync**: Perform a Gradle Sync to ensure the new versions are accepted.
2. **Build**: Run `./gradlew :app:assembleDebug` to verify that dependencies are resolved correctly and the project compiles.
3. **Run**: (Optional) Deploy to a device/emulator if available.
