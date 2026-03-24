/**
 * Audio conversion utilities for the Voice Agent module.
 *
 * Twilio Media Streams use: G.711 µ-law (mulaw), 8kHz, mono, 8-bit
 * Gemini Live API expects:  PCM signed 16-bit little-endian, 16kHz, mono
 * Gemini Live API outputs:  PCM signed 16-bit little-endian, 24kHz, mono
 */

// Mulaw decode table (256 entries) — precomputed for performance
const MULAW_DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(256)
  for (let i = 0; i < 256; i++) {
    let u = ~i
    const sign = u & 0x80
    const exp  = (u >> 4) & 0x07
    const mant = u & 0x0F
    let sample = ((mant << 3) + 0x84) << exp
    sample -= 0x84
    table[i] = sign ? -sample : sample
  }
  return table
})()

/**
 * Decode a mulaw byte to a signed 16-bit PCM sample.
 */
export function mulawToLinear16(mu: number): number {
  return MULAW_DECODE_TABLE[mu & 0xFF]
}

/**
 * Encode a signed 16-bit PCM sample to mulaw.
 */
export function linear16ToMulaw(sample: number): number {
  const BIAS   = 0x84
  const CLIP   = 32635
  const MULAW_MAX = 0x1FFF

  let sign = 0
  if (sample < 0) {
    sign = 0x80
    sample = -sample
  }
  if (sample > CLIP) sample = CLIP

  sample += BIAS

  let exp = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exp > 0; exp--, expMask >>= 1) {}

  const mantissa = (sample >> (exp + 3)) & 0x0F
  const ulawByte = ~(sign | (exp << 4) | mantissa)
  return ulawByte & 0xFF
}

/**
 * Convert a Buffer of mulaw bytes (8kHz) to PCM Int16Array (8kHz).
 */
export function mulawBufferToPcm8k(mulawBuf: Buffer): Int16Array {
  const pcm = new Int16Array(mulawBuf.length)
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm[i] = mulawToLinear16(mulawBuf[i])
  }
  return pcm
}

/**
 * Upsample Int16Array from 8kHz to 16kHz by linear interpolation.
 */
export function upsample8kTo16k(pcm8k: Int16Array): Int16Array {
  const out = new Int16Array(pcm8k.length * 2)
  for (let i = 0; i < pcm8k.length - 1; i++) {
    out[i * 2]     = pcm8k[i]
    out[i * 2 + 1] = Math.round((pcm8k[i] + pcm8k[i + 1]) / 2)
  }
  // Last sample
  out[(pcm8k.length - 1) * 2]     = pcm8k[pcm8k.length - 1]
  out[(pcm8k.length - 1) * 2 + 1] = pcm8k[pcm8k.length - 1]
  return out
}

/**
 * Downsample Int16Array from 24kHz to 8kHz (take every 3rd sample).
 */
export function downsample24kTo8k(pcm24k: Int16Array): Int16Array {
  const len = Math.floor(pcm24k.length / 3)
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = pcm24k[i * 3]
  }
  return out
}

/**
 * Downsample Int16Array from 16kHz to 8kHz (take every 2nd sample).
 */
export function downsample16kTo8k(pcm16k: Int16Array): Int16Array {
  const len = Math.floor(pcm16k.length / 2)
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = pcm16k[i * 2]
  }
  return out
}

/**
 * Convert PCM Int16Array to mulaw Buffer.
 */
export function pcmToMulawBuffer(pcm: Int16Array): Buffer {
  const buf = Buffer.allocUnsafe(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    buf[i] = linear16ToMulaw(pcm[i])
  }
  return buf
}

/**
 * Full pipeline: Twilio mulaw base64 (8kHz) → PCM base64 (16kHz) for Gemini.
 */
export function twilioAudioToGemini(base64Mulaw: string): string {
  const mulawBuf = Buffer.from(base64Mulaw, 'base64')
  const pcm8k    = mulawBufferToPcm8k(mulawBuf)
  const pcm16k   = upsample8kTo16k(pcm8k)
  // Convert Int16Array to Buffer (little-endian)
  const pcmBuf   = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength)
  return pcmBuf.toString('base64')
}

/**
 * Full pipeline: Gemini PCM base64 (24kHz) → Twilio mulaw base64 (8kHz).
 */
export function geminiAudioToTwilio(base64Pcm24k: string): string {
  const pcmBuf  = Buffer.from(base64Pcm24k, 'base64')
  // Reinterpret as Int16Array
  const pcm24k  = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, pcmBuf.byteLength / 2)
  const pcm8k   = downsample24kTo8k(pcm24k)
  const mulaw   = pcmToMulawBuffer(pcm8k)
  return mulaw.toString('base64')
}
