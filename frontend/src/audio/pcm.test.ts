// Execute the actual AudioWorklet source with a minimal worklet host.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

interface Processor { process(input: Float32Array[][]): boolean; port: { onmessage: (event: { data: string }) => void } }
function processor(rate: number) {
  const frames: { pcm: ArrayBuffer; level: number }[] = []
  let ProcessorClass: new () => Processor
  const source = readFileSync('public/audio-worklet.js', 'utf8')
  runInNewContext(source, {
    sampleRate: rate,
    AudioWorkletProcessor: class { port = { postMessage: (data: { pcm: ArrayBuffer; level: number }) => { if (data.pcm) frames.push(data) } } },
    registerProcessor: (_name: string, klass: new () => Processor) => { ProcessorClass = klass },
  })
  return { worklet: new ProcessorClass!(), frames }
}

describe('PCM worklet', () => {
  for (const rate of [16000, 44100, 48000]) {
    it(`resamples ${rate} Hz to exact 16 kHz PCM with continuous fractional state`, () => {
      const { worklet, frames } = processor(rate)
      let remaining = rate
      while (remaining > 0) {
        const size = Math.min(128, remaining)
        worklet.process([[new Float32Array(size).fill(0.5)]])
        remaining -= size
      }
      expect(frames.length).toBe(10)
      expect(frames.reduce((sum, f) => sum + f.pcm.byteLength, 0)).toBe(32000)
      for (const frame of frames) expect(new DataView(frame.pcm).getInt16(0, true)).toBe(16384)
    })
  }
  it('clips positive and negative samples and explicitly encodes little endian', () => {
    const { worklet, frames } = processor(16000)
    worklet.process([[new Float32Array(1600).fill(2)]])
    worklet.process([[new Float32Array(1600).fill(-2)]])
    expect(new DataView(frames[0].pcm).getInt16(0, true)).toBe(32767)
    expect(new DataView(frames[1].pcm).getInt16(0, true)).toBe(-32768)
  })
  it('flushes the final partial frame before stopping capture', () => {
    const { worklet, frames } = processor(48000)
    worklet.process([[new Float32Array(300).fill(0.5)]])
    expect(frames).toHaveLength(0)
    worklet.port.onmessage({ data: 'flush' })
    expect(frames).toHaveLength(1)
    expect(frames[0].pcm.byteLength).toBe(200)
    worklet.process([[new Float32Array(4800).fill(0.5)]])
    expect(frames).toHaveLength(1)
  })
  it('discards samples captured during mute when resetting the accumulator', () => {
    const { worklet, frames } = processor(16000)
    worklet.process([[new Float32Array(800).fill(-0.5)]])
    worklet.port.onmessage({ data: 'reset' })
    worklet.process([[new Float32Array(1600).fill(0.5)]])
    expect(frames).toHaveLength(1)
    expect(new DataView(frames[0].pcm).getInt16(0, true)).toBe(16384)
  })
})
