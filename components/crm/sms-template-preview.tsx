"use client"

import { useEffect, useState } from "react"
import { getSmsCompositionPreview } from "@/app/actions/crm"
import { applySmsDueDate } from "@/lib/sms-due-date"
import { previewSmsTemplate } from "@/lib/sms-template-preview"

export function SmsTemplatePreview({ category, templateId, manualMessage, source, dueDate }: { category: string; templateId: string; manualMessage?: string; dueDate?: string; source: "directory" | "csv" }) {
  const key = JSON.stringify([category, templateId, source])
  const [result, setResult] = useState<{ key: string; content?: string; thanksContent?: string | null; error?: string } | null>(null)
  useEffect(() => {
    if (manualMessage !== undefined) return
    let cancelled = false
    getSmsCompositionPreview({ category, templateId: templateId === "default" ? undefined : templateId, source })
      .then(value => { if (!cancelled) setResult({ key, ...value }) })
      .catch(() => { if (!cancelled) setResult({ key, error: "Could not load the message preview. Please try selecting the template again." }) })
    return () => { cancelled = true }
  }, [category, templateId, source, key, manualMessage])
  const current = result?.key === key ? result : null
  const content = manualMessage !== undefined ? manualMessage : current?.content
  let dateError = ""
  let preview = null
  let thanksPreview = ""
  try {
    if (content) preview = previewSmsTemplate(applySmsDueDate(content, dueDate, source === "csv" && category === "Bill Reminders" && templateId === "default" && manualMessage === undefined), source)
    if (current?.thanksContent) thanksPreview = previewSmsTemplate(applySmsDueDate(current.thanksContent, dueDate)).body
  } catch (error) { dateError = error instanceof Error ? error.message : "Invalid due date" }
  return (
    <section aria-label="Message preview" aria-live="polite" className="space-y-2 rounded-md border bg-white p-3">
      <p className="text-xs font-semibold">Message preview</p>
      <p className="text-[11px] text-muted-foreground">Example customer and values. Each recipient’s name, account, period and balance will be personalised when the draft is created.</p>
      <p className="whitespace-pre-wrap break-words text-sm">{dateError || preview?.body || (manualMessage !== undefined ? "Type your message to see a preview." : current?.error || "Loading message preview…")}</p>
      {dateError && <p role="alert" className="text-xs text-red-600">Enter the required due date before creating the list.</p>}
      {!!preview?.missing.length && <p role="alert" className="text-xs text-amber-700">This template needs additional information: {preview.missing.join(", ")}. Use a custom message with the supported customer placeholders.</p>}
      {manualMessage === undefined && current?.thanksContent && <div className="border-t pt-2">
        <p className="text-xs font-semibold">For uploaded balances below UGX 1,500</p>
        <p className="whitespace-pre-wrap break-words text-sm">{thanksPreview}</p>
      </div>}
    </section>
  )
}
