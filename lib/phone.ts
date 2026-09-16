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
 * SWUWS only texts Uganda mobiles / 03 lines: 10 digits starting 07 or 03.
 * E.164 is +256 then those same 9 subscriber digits (the leading 0 is dropped).
 */
const UGANDA_E164 = /^\+256[73]\d{8}$/
/** Directory placeholder for customers with no phone — never send SMS here. */
const UGANDA_PLACEHOLDER = /^\+256[73]0{8}$/

/**
 * Converts a phone number to E.164, or returns null when it cannot be
 * salvaged. This does not decide whether SWUWS should spend an SMS on it —
 * use normalizeSendablePhone for that.
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

/**
 * E.164 number we are willing to spend an SMS credit on.
 * For Uganda: 07xxxxxxxx or 03xxxxxxxx only. 0700000000 (and 0300000000)
 * is the no-phone placeholder and is never sendable.
 */
export function normalizeSendablePhone(
  raw: string | null | undefined,
  countryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  const e164 = normalizePhone(raw, countryCode)
  if (!e164) return null

  if (countryCode === "256") {
    if (!UGANDA_E164.test(e164)) return null
    if (UGANDA_PLACEHOLDER.test(e164)) return null
  }

  return e164
}

/** True when SWUWS will queue or send an SMS to this number. */
export function isSendablePhone(raw: string | null | undefined): boolean {
  return normalizeSendablePhone(raw) !== null
}
