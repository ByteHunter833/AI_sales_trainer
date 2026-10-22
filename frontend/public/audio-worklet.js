// Streaming area resampler: retain fractional input samples between render quanta.
// This low-pass averaging step prevents simply dropping samples when downsampling.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.remaining = this.ratio
    this.sum = 0
    this.frame = new Int16Array(1600)
    this.index = 0
    this.stopped = false
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') {
        this.stopped = true
        this.emit(0)
        this.port.postMessage({ flushed: true })
      } else if (data === 'reset') {
        this.index = 0
        this.sum = 0
        this.remaining = this.ratio
      }
    }
  }
  emit(level) {
    if (!this.index) return
    const buffer = new ArrayBuffer(this.index * 2)
    const view = new DataView(buffer)
    for (let i = 0; i < this.index; i++) view.setInt16(i * 2, this.frame[i], true)
    this.port.postMessage({ pcm: buffer, level }, [buffer])
    this.index = 0
  }
  process(inputs) {
    if (this.stopped) return true
    const samples = inputs[0]?.[0]
    if (!samples) return true
    let energy = 0
    for (const sample of samples) {
      energy += sample * sample
      let weight = 1
      while (weight > 1e-8) {
        const used = Math.min(weight, this.remaining)
        this.sum += sample * used
        this.remaining -= used
        weight -= used
        if (this.remaining < 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio))
          this.frame[this.index++] = Math.round(value * (value < 0 ? 32768 : 32767))
          this.sum = 0
          this.remaining = this.ratio
          if (this.index === this.frame.length) {
            // Explicit little-endian encoding, independent of the host platform.
            this.emit(Math.sqrt(energy / samples.length))
          }
        }
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PCMProcessor)
