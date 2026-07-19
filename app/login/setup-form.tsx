"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { bootstrapAdmin } from "@/app/actions/bootstrap"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function SetupForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await bootstrapAdmin({ name, email, password })
      if (!result.ok) {
        setLoading(false)
        setError(result.error)
        return
      }

      const { error: signInError } = await signIn.email({ email, password })
      setLoading(false)
      if (signInError) {
        // Account was created; just send them to the normal sign-in form.
        router.push("/login")
        router.refresh()
        return
      }
      router.push("/admin")
      router.refresh()
    } catch (err) {
      console.error("Setup error:", err)
      setLoading(false)
      setError("A network error occurred. Please check your connection and try again.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Initial setup</CardTitle>
        <CardDescription>
          No administrator account exists yet. Create the first one to get started — this form
          disappears once it&apos;s used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create administrator account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
