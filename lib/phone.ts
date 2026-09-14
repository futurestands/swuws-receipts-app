/**
 * Phone number normalisation for the SMS gateways.
 *
 * Every provider we support (Africa's Talking, Twilio, Infobip) requires
 * E.164 — a leading "+" and country code. Contact lists exported from the
 * field are almost always in local form ("0770000001", "0770 000 001"),
 * which the gateway rejects outright, so an entire batch can report as
 * failed without a single request being malformed on our side.
 *
 * Default country code is Uganda (256) and can be overridden with
 * SMS_DEFAULT_COUNTRY_CODE for other deployments.
 */

const DEFAULT_COUNTRY_CODE = (process.env.SMS_DEFAULT_COUNTRY_CODE || "256").replace(/\D/g, "")

/** Uganda MSISDNs are 9 digits after the country code; most of Africa matches. */
const MIN_SUBSCRIBER_DIGITS = 8
const MAX_SUBSCRIBER_DIGITS = 12

/**
 * Converts a phone number to E.164, or returns null when it cannot be
 * salvaged. Callers should treat null as "unsendable" rather than passing
 * the raw value on to the gateway.
 */
export function normalizePhone(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null

  // Strip spaces, dashes, brackets and any other formatting noise.
  let digits = String(raw).trim().replace(/[^\d+]/g, "")
  if (!digits) return null

  // "00256..." is the other common international prefix.
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`

  if (digits.startsWith("+")) {
    const body = digits.slice(1).replace(/\D/g, "")
    return body.length >= MIN_SUBSCRIBER_DIGITS ? `+${body}` : null
  }

  digits = digits.replace(/\D/g, "")

  // Already carries the country code, just without a "+".
  if (digits.startsWith(countryCode) && digits.length > countryCode.length + MIN_SUBSCRIBER_DIGITS - 1) {
    return `+${digits}`
  }

  // Local trunk form: drop the leading 0 and prepend the country code.
  const subscriber = digits.startsWith("0") ? digits.slice(1) : digits
  if (subscriber.length < MIN_SUBSCRIBER_DIGITS || subscriber.length > MAX_SUBSCRIBER_DIGITS) {
    return null
  }

  return `+${countryCode}${subscriber}`
}

/** True when the value can be turned into something a gateway will accept. */
export function isSendablePhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null
}
