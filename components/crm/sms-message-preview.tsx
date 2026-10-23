"use client"

export function SmsMessagePreview({ recipient }: {
  recipient: { customerName: string | null; customerAccount: string | null; phoneNumber: string; message: string; status: string }
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{recipient.customerName || "Recipient"}</p>
          <p className="text-xs text-muted-foreground">{recipient.phoneNumber}</p>
          {recipient.customerAccount && <p className="break-all text-xs text-muted-foreground">Customer reference: {recipient.customerAccount}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{recipient.status === "queued" ? "Ready to send" : recipient.status}</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-sky-50 p-4 text-sm leading-relaxed text-slate-900">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{recipient.message || "No message text was saved for this recipient."}</p>
      </div>
      <p className="text-xs text-muted-foreground">Exact saved SMS text for this recipient. Opening this preview does not send a message.</p>
    </div>
  )
}
