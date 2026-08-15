"use client"

import { useEffect } from "react"

export function SWRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (registration) => {
            console.log("SW registered: ", registration)
          },
          (registrationError) => {
            console.log("SW registration failed: ", registrationError)
          }
        )
      })
    }
  }, [])

  return null
}
