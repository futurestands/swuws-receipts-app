import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ebsGatewayConfig, pegasusEvent } from "@/lib/db/schema"
import { decryptSecret } from "@/lib/ebs/crypto"
import { fakePegasusAdapter, defaultPegasusAdapter, NotConfiguredError } from "@/lib/ebs/pegasus-adapter"
import { checkRateLimit } from "@/lib/rate-limit"
import { logSecurity } from "@/lib/logger"
import { randomUUID } from "crypto"

// Maximum allowed payload size: 100 KB
const MAX_PAYLOAD_SIZE = 100 * 1024

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const parts = forwarded.split(",")
    if (parts.length > 0 && parts[0]) {
      return parts[0].trim()
    }
  }
  return "unknown"
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)

    // 0a. Loose Pre-Auth Rate Limit to protect DB against flooding (e.g., 60 req / min)
    const preAuthLimit = await checkRateLimit(`ebs-webhook-preauth:${ip}`, 60, 60, { failClosed: true })
    if (!preAuthLimit.allowed) {
      logSecurity("EBS Webhook pre-auth rate limit exceeded", "warn", { ip })
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // 1. Check Configuration
    const [config] = await db.select().from(ebsGatewayConfig).limit(1)
    if (!config || !config.active) {
      return NextResponse.json({ error: "EBS Integration Disabled" }, { status: 403 })
    }

    if (!config.encryptedWebhookSecret) {
      return NextResponse.json({ error: "EBS Webhook Secret Not Configured" }, { status: 503 })
    }

    let webhookSecret = ""
    try {
      webhookSecret = decryptSecret(config.encryptedWebhookSecret)
    } catch {
      logSecurity("Failed to decrypt EBS webhook secret", "error", {})
      return NextResponse.json({ error: "Internal Configuration Error" }, { status: 503 })
    }

    // 2. Read Raw Body ONCE and check size cap
    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, "utf-8") > MAX_PAYLOAD_SIZE) {
      logSecurity("EBS Webhook payload too large", "warn", { sizeBytes: Buffer.byteLength(rawBody, "utf-8") })
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    // 3. Select Adapter: use fake adapter ONLY when process.env.NODE_ENV === "test"
    const adapter = process.env.NODE_ENV === "test"
      ? fakePegasusAdapter
      : defaultPegasusAdapter

    // 4. Verify Signature
    let signatureVerified = false
    try {
      signatureVerified = adapter.verifySignature(rawBody, request.headers, webhookSecret)
    } catch (err: unknown) {
      if (err instanceof NotConfiguredError) {
        return NextResponse.json({ error: "Webhook verification not configured" }, { status: 503 })
      }
      signatureVerified = false
    }

    if (!signatureVerified) {
      logSecurity("EBS Webhook signature verification failed", "warn", { hasHeaders: !!request.headers.get("x-pegasus-signature") })
      return NextResponse.json({ error: "Invalid authentication signature" }, { status: 401 })
    }

    // 0b. Strict Post-Auth Rate Limit (e.g., 30 req / min)
    const postAuthLimit = await checkRateLimit(`ebs-webhook-postauth:${ip}`, 30, 60, { failClosed: true })
    if (!postAuthLimit.allowed) {
      logSecurity("EBS Webhook post-auth rate limit exceeded", "warn", { ip })
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // 5. Parse Event
    let eventId = `evt-${randomUUID()}`
    let accountNumber: string | null = null
    let amount: number | null = null
    let paidAt: Date | null = null
    let parsedPayload: Record<string, unknown> = {}

    try {
      parsedPayload = JSON.parse(rawBody)
      const paymentEvent = adapter.parsePaymentEvent(rawBody)
      eventId = adapter.mapEventId(paymentEvent)
      accountNumber = paymentEvent.accountNumber
      amount = paymentEvent.amount
      paidAt = paymentEvent.paidAt
    } catch (parseErr: unknown) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : "Parse error"
      // Store failed event for audit/review
      try {
        await db.insert(pegasusEvent).values({
          id: `evt-${randomUUID()}`,
          providerEventId: `err-${randomUUID()}`,
          signatureVerified: true,
          status: "failed",
          rawPayload: { raw: rawBody.substring(0, 2000), error: parseMsg },
          errorMessage: parseMsg,
        }).onConflictDoNothing()
      } catch {
        // Ignore secondary storage error
      }
      return NextResponse.json({ error: `Invalid event payload: ${parseMsg}` }, { status: 400 })
    }

    // 6. Durable, Idempotent Event Inbox Insert (ON CONFLICT DO NOTHING)
    const inboxId = `inv-${randomUUID()}`
    const insertResult = await db.insert(pegasusEvent).values({
      id: inboxId,
      providerEventId: eventId,
      signatureVerified: true,
      status: "received",
      accountNumber,
      amount,
      paidAt,
      rawPayload: parsedPayload,
    }).onConflictDoNothing().returning({ id: pegasusEvent.id })

    // 7. Process via Processor (Step 4 processor) - non-blocking for webhook response
    if (insertResult.length > 0) {
      try {
        // Import processor dynamically or call it safely
        const { processPegasusEvent } = await import("@/lib/ebs/pegasus-processor")
        void processPegasusEvent(inboxId).catch((procErr) => {
          console.error("Background Pegasus event processing failed:", procErr)
        })
      } catch (procImportErr) {
        console.error("Failed to load pegasus-processor:", procImportErr)
      }
    }

    // If no row returned, it was already processed (Idempotent duplication)
    if (insertResult.length === 0) {
      return NextResponse.json({ status: "SUCCESS", message: "Event already received (idempotent duplicate)." }, { status: 200 })
    }

    // 8. Return 2xx only after durable storage
    return NextResponse.json({
      status: "SUCCESS",
      message: "Webhook event received and durably stored for reconciliation review.",
      eventId,
    }, { status: 200 })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("EBS Webhook Error:", message)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: "STANDBY_READY",
    message: "Pegasus EBS Webhook Endpoint is active and awaiting authenticated signed payloads."
  }, { status: 200 })
}
