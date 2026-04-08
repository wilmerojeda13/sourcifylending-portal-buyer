import { NextResponse } from 'next/server'

const SAMPLE_RATE = 8000
const DURATION_SECONDS = 6
const CHANNELS = 1
const BITS_PER_SAMPLE = 16
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const AMPLITUDE = 0.28

function buildRingbackWav() {
  const totalSamples = SAMPLE_RATE * DURATION_SECONDS
  const pcmData = Buffer.alloc(totalSamples * BYTES_PER_SAMPLE)

  for (let i = 0; i < totalSamples; i += 1) {
    const time = i / SAMPLE_RATE
    const cyclePosition = time % 6
    const isRinging = cyclePosition < 2

    let sampleValue = 0
    if (isRinging) {
      const toneA = Math.sin(2 * Math.PI * 440 * time)
      const toneB = Math.sin(2 * Math.PI * 480 * time)
      sampleValue = ((toneA + toneB) / 2) * AMPLITUDE
    }

    const intSample = Math.max(-1, Math.min(1, sampleValue)) * 32767
    pcmData.writeInt16LE(intSample, i * BYTES_PER_SAMPLE)
  }

  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE
  const dataSize = pcmData.length
  const wavHeader = Buffer.alloc(44)

  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36 + dataSize, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20)
  wavHeader.writeUInt16LE(CHANNELS, 22)
  wavHeader.writeUInt32LE(SAMPLE_RATE, 24)
  wavHeader.writeUInt32LE(byteRate, 28)
  wavHeader.writeUInt16LE(blockAlign, 32)
  wavHeader.writeUInt16LE(BITS_PER_SAMPLE, 34)
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(dataSize, 40)

  return Buffer.concat([wavHeader, pcmData])
}

export async function GET() {
  const audio = buildRingbackWav()

  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(audio.length),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
