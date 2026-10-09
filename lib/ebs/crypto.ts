import crypto from "crypto"

// Note: Ensure EBS_ENCRYPTION_KEY is a 32-byte (64 hex characters or 32 ascii characters) string in your .env
const ENCRYPTION_KEY = process.env.EBS_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef" // 32 chars fallback for dev
const ALGORITHM = "aes-256-gcm"

export function encryptSecret(text: string): string {
  if (!text) return text
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, "utf-8"), iv)

  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag().toString("hex")

  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decryptSecret(encryptedText: string): string {
  if (!encryptedText) return encryptedText
  const parts = encryptedText.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted format")

  const iv = Buffer.from(parts[0], "hex")
  const authTag = Buffer.from(parts[1], "hex")
  const content = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, "utf-8"), iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(content, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}
