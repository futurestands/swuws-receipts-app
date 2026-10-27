import { requireUser } from "@/lib/session"
import { canViewIntelligence } from "@/lib/permissions"
import { redirect } from "next/navigation"
import DecisionSupportDashboard from "./decision-support-dashboard"

export default async function DecisionSupportPage() {
  const user = await requireUser()
  if (!canViewIntelligence(user)) redirect("/intelligence")
  return <DecisionSupportDashboard />
}
