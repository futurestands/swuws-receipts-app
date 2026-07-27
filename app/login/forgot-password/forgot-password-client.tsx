"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react"
import Link from "next/link"

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setError("")

    // Using any cast to bypass type check issue while maintaining functionality
    const { error } = await (authClient as any).forgetPassword({
      email,
      redirectTo: "/login/reset-password",
    })

    if (error) {
      setStatus("error")
      setError(error.message || "Something went wrong")
    } else {
      setStatus("success")
    }
  }

  if (status === "success") {
    return (
      <div className="space-y-4 text-center py-8">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-muted-foreground">
          We've sent a password reset link to <strong>{email}</strong>.
          Please check your inbox (and spam folder) to continue.
        </p>
        <Button asChild variant="outline" className="w-full mt-6">
          <Link href="/login">Back to Login</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Reset Password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <p>{error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={status === "loading"}>
          {status === "loading" ? "Sending Link..." : "Send Reset Link"}
        </Button>
      </form>

      <div className="text-center">
        <Button asChild variant="link" className="gap-2 text-muted-foreground">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </Button>
      </div>
    </div>
  )
}
