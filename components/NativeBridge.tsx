"use client"

import { useEffect } from "react"
import { isNative } from "@/lib/mobile-hardware"

export function NativeBridge() {
  useEffect(() => {
    if (isNative()) {
      // 1. Hide Splash Screen (Essential to fix "White Screen" on launch)
      import("@capacitor/splash-screen").then(({ SplashScreen }) => {
        SplashScreen.hide().catch(err => console.warn('NativeBridge: Could not hide splash screen', err))
      })

      // 2. Configure Status Bar for global branding
      import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Light }).catch(() => {})
        StatusBar.setBackgroundColor({ color: '#0B2A4A' }).catch(() => {})
      })
    }
  }, [])

  return null
}
