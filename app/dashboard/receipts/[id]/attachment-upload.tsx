"use client"

import { useRef, useState, useTransition } from "react"
import { uploadReceiptAttachment } from "@/app/actions/receipts"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { ReceiptAttachment } from "@/lib/db/schema"

// Certification Finding 6.1: attachments returned from the server no longer
// include the raw Blob url — only fields safe to send to the browser.
type AttachmentSummary = Omit<ReceiptAttachment, "url">

export function AttachmentUpload({
  receiptId,
  initialAttachments,
}: {
  receiptId: string
  initialAttachments: AttachmentSummary[]
}) {
  const [attachments, setAttachments] = useState(initialAttachments)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const formData = new FormData()
    formData.append("file", file)
    startTransition(async () => {
      const result = await uploadReceiptAttachment(receiptId, formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAttachments((prev) => [result.attachment, ...prev])
      toast.success("Attachment added")
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
          className="text-sm"
        />
        {pending && <span className="text-sm text-muted-foreground">Uploading…</span>}
      </div>
      {attachments.length > 0 && (
        <ul className="text-sm space-y-1">
          {attachments.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {a.fileName}
              </a>
              <span className="text-muted-foreground"> — added by {a.uploadedByName}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Attachments can only be added, never removed or replaced, once linked to this receipt.
        Accepted formats: PDF, PNG, JPG.
      </p>
    </div>
  )
}

