export type DispatchStatus = "sent" | "failed" | "unknown"

/** Claims must be conditional on queued -> processing in the database, not just the UI. */
export async function dispatchClaimedSms(io: {
  claim: () => Promise<boolean>
  send: () => Promise<{ delivered: boolean; reason?: string | null; error?: string; gatewayRef?: string; id?: string }>
  finish: (status: DispatchStatus, error: string | null, externalRef?: string) => Promise<void>
}) {
  if (!await io.claim()) return "skipped" as const
  try {
    const result = await io.send()
    if (result.delivered) {
      await io.finish("sent", null, result.gatewayRef || result.id)
      return "sent" as const
    }
    // Network errors can occur after the carrier accepted a request. Never retry those automatically.
    const status = result.reason === "gateway_error" ? "unknown" : "failed"
    await io.finish(status, result.error || result.reason || "Gateway rejected the message")
    return status
  } catch (error) {
    // If this write also fails, the durable processing state still prevents an automatic resend.
    await io.finish("unknown", `Delivery uncertain; review before retrying: ${error instanceof Error ? error.message : String(error)}`)
    return "unknown" as const
  }
}
