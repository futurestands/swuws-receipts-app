import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"

/**
 * Returns the encryption key as a Buffer.
 * Validates that EBS_ENCRYPTION_KEY is configured and is exactly 32 bytes.
 * Throws an error if the key is missing or invalid to fail closed securely.
 *
 * Key Provisioning & Rotation:
 * - Provision a new key securely using `openssl rand -hex 32` or similar secure RNG.
 * - Store it in the environment variable `EBS_ENCRYPTION_KEY`.
 * - If you need to rotate the key:
 *   1. You must decrypt all existing secrets in the database using the old key.
 *   2. Update the environment variable with the new key.
 *   3. Re-encrypt and save the secrets.
 *   (Without doing this, old encrypted credentials will be unreadable and must be re-entered via the Admin UI).
 */
function getEncryptionKey(): Buffer {
  const keyStr = process.env.EBS_ENCRYPTION_KEY
  if (!keyStr) {
    throw new Error("EBS_ENCRYPTION_KEY environment variable is not set. Secure integration requires a 32-byte key.")
  }

  let keyBuffer: Buffer

  // Try parsing as hex (64 chars)
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    keyBuffer = Buffer.from(keyStr, "hex")
  }
  // Try parsing as base64
  else if (keyStr.endsWith("=") || keyStr.length === 44 || keyStr.length === 43) {
    keyBuffer = Buffer.from(keyStr, "base64")
  }
  // Fallback to raw string (must be exactly 32 chars)
  else {
    keyBuffer = Buffer.from(keyStr, "utf-8")
  }

  if (keyBuffer.length !== 32) {
    throw new Error(`EBS_ENCRYPTION_KEY must be exactly 32 bytes long for aes-256-gcm. Provided key parsed to ${keyBuffer.length} bytes.`)
  }

  return keyBuffer
}

export function encryptSecret(text: string): string {
  if (!text) return text

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag().toString("hex")

  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decryptSecret(encryptedText: string): string {
  if (!encryptedText) return encryptedText

  const parts = encryptedText.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format. Data may be corrupted or tampered with.")
  }

  const iv = Buffer.from(parts[0], "hex")
  const authTag = Buffer.from(parts[1], "hex")
  const content = parts[2]

  const key = getEncryptionKey()

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(content, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    // Catch decryption errors (like auth tag mismatch/tampering or wrong key)
    throw new Error("Decryption failed. The secret may have been tampered with or the encryption key is incorrect.")
  }
}
