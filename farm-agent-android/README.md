Farm Management Agent (Android)

Minimal scaffold for an offline-first Android app using Kotlin, Jetpack Compose, Room, and Supabase for optional cloud sync.

Quick start

1. Open the `farm-agent-android` folder in Android Studio.
2. Add required SDKs and configure Gradle (AGP 7.4+, Kotlin 1.7+ recommended).
3. Set your Supabase URL and API key in `SupabaseService.kt`.

Notes

- This is a scaffold with core Room entities, DAOs, a repository, and a Supabase sync skeleton.
- Implement WorkManager/AlarmManager and UI screens next.
