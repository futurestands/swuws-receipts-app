"use client"

import { useEffect, useState } from "react"
import { getSmsCompositionPreview } from "@/app/actions/crm"
import { previewSmsTemplate } from "@/lib/sms-template-preview"

export function SmsTemplatePreview({ category, templateId, manualMessage, source }: { category: string; templateId: string; manualMessage?: string; source: "directory" | "csv" }) {
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
  const preview = content ? previewSmsTemplate(content, source) : null
  return (
    <section aria-label="Message preview" aria-live="polite" className="space-y-2 rounded-md border bg-white p-3">
      <p className="text-xs font-semibold">Message preview</p>
      <p className="text-[11px] text-muted-foreground">Example customer and values. Each recipient’s name, account, period and balance will be personalised when the draft is created.</p>
      <p className="whitespace-pre-wrap break-words text-sm">{preview?.body || (manualMessage !== undefined ? "Type your message to see a preview." : current?.error || "Loading message preview…")}</p>
      {!!preview?.missing.length && <p role="alert" className="text-xs text-amber-700">This template needs additional information: {preview.missing.join(", ")}. Use a custom message with the supported customer placeholders.</p>}
      {manualMessage === undefined && current?.thanksContent && <div className="border-t pt-2">
        <p className="text-xs font-semibold">For uploaded balances below UGX 1,500</p>
        <p className="whitespace-pre-wrap break-words text-sm">{previewSmsTemplate(current.thanksContent).body}</p>
      </div>}
    </section>
  )
}
