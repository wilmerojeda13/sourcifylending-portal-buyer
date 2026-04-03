const AUTH_ENCODER = new TextEncoder()

export async function hashOfflinePin(pin: string) {
  const digest = await crypto.subtle.digest('SHA-256', AUTH_ENCODER.encode(pin))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyOfflinePin(pin: string, expectedHash: string | null | undefined) {
  if (!expectedHash) return false
  const hash = await hashOfflinePin(pin)
  return hash === expectedHash
}
