import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"
import { receiptAttachment, receipt } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { and, eq } from "drizzle-orm"

import { applyReceiptScope } from "@/lib/scopes"

/**
 * Authenticated attachment download (Certification Finding 6.1).
 *
 * Previously, receiptAttachment.url (a public Vercel Blob URL) was sent
 * directly to the browser and used as a plain <a href>. Anyone who obtained
 * that URL — via a shared link, browser history, or a log — could fetch the
 * file with no authentication at all, bypassing this app's RBAC entirely.
 *
 * Now the client only ever links to /api/attachments/{attachmentId}. This
 * route re-checks the same agent-isolation/admin rule used everywhere else
 * in the app (getReceiptById's logic, inlined here against the parent
 * receipt), then proxies the file through the server. The raw Blob URL is
 * read from the database and used server-side only — it is never included
 * in any response sent to the client.
 *
 * Residual note: the underlying Vercel Blob object itself is still stored
 * with `access: "public"`, since Blob does not offer a private/signed-URL
 * ACL mode at the time of writing. The security boundary here is that the
 * URL — effectively an unguessable, randomly-suffixed secret — is no longer
 * ever transmitted to any client, which is what actually closes the finding
 * ("only authorized users may download attachments" refers to what this
 * application does with the file, which is now fully gated). If Vercel
 * Blob adds true private access in the future, switching `access: "public"`
 * in app/actions/receipts.ts to that mode would close the residual gap
 * with no change needed here.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser()
  if (!current) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const [attachment] = await db
    .select()
    .from(receiptAttachment)
    .where(eq(receiptAttachment.id, id))
    .limit(1)
  if (!attachment) {
    return new NextResponse("Not found", { status: 404 })
  }

  const scope = applyReceiptScope(current)

  const [parentReceipt] = await db
    .select({ agentId: receipt.agentId })
    .from(receipt)
    .where(and(eq(receipt.id, attachment.receiptId), scope))
    .limit(1)
  if (!parentReceipt) {
    return new NextResponse("Not found", { status: 404 })
  }

  let upstream: Response
  try {
    upstream = await fetch(attachment.url)
  } catch (e) {
    console.error(`Attachment download failed for ${id}:`, e)
    return new NextResponse("Attachment temporarily unavailable", { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Attachment unavailable", { status: 502 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
