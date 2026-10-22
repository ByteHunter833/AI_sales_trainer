export class VoiceAudio {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private silent: GainNode | null = null
  private playing = new Set<AudioBufferSourceNode>()
  private nextPlay = 0
  private disposed = false
  private capturing = true
  private flushComplete: (() => void) | null = null
  muted = false

  async start(onPCM: (pcm: ArrayBuffer, level: number) => void) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access needs localhost or HTTPS and a supported browser.')
    }
    // Resume synchronously from the user's click to satisfy audio autoplay rules.
    this.context = new AudioContext()
    const resume = this.context.resume()
    try {
      await resume
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return }
      this.stream = stream
      await this.context.audioWorklet.addModule('/audio-worklet.js')
      if (this.disposed) return
      this.source = this.context.createMediaStreamSource(stream)
      this.worklet = new AudioWorkletNode(this.context, 'pcm-capture')
      this.worklet.port.onmessage = ({ data }) => {
        if (data.flushed) this.flushComplete?.()
        else if (!this.disposed && this.capturing && !this.muted && data.pcm) onPCM(data.pcm, data.level)
      }
      this.silent = this.context.createGain()
      this.silent.gain.value = 0
      this.source.connect(this.worklet).connect(this.silent).connect(this.context.destination)
    } catch (error) {
      this.close()
      if (error instanceof DOMException && error.name === 'NotAllowedError') throw new Error('Microphone permission was denied. Allow microphone access in your browser, then try again.')
      if (error instanceof DOMException && error.name === 'NotFoundError') throw new Error('No microphone was found. Connect a microphone and try again.')
      throw error
    }
  }

  play(pcm: ArrayBuffer) {
    const ctx = this.context
    if (!ctx || this.disposed || pcm.byteLength % 2 !== 0) return
    if (this.nextPlay - ctx.currentTime > 20) throw new Error('Audio playback fell behind. End this session and check your audio device.')
    const values = new DataView(pcm)
    const buffer = ctx.createBuffer(1, pcm.byteLength / 2, 24000)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = values.getInt16(i * 2, true) / 32768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const start = Math.max(ctx.currentTime + 0.025, this.nextPlay)
    source.start(start)
    this.nextPlay = start + buffer.duration
    this.playing.add(source)
    source.onended = () => { this.playing.delete(source); source.disconnect() }
  }

  interrupt() {
    this.playing.forEach(source => { try { source.stop() } catch { /* already ended */ } source.disconnect() })
    this.playing.clear()
    this.nextPlay = 0
  }

  stopCapture() {
    this.capturing = false
    this.stream?.getTracks().forEach(t => t.stop())
    this.worklet?.disconnect()
    this.source?.disconnect()
    this.silent?.disconnect()
  }

  async finishCapture() {
    if (this.worklet && !this.disposed) {
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 250)
        this.flushComplete = () => { clearTimeout(timeout); resolve() }
        this.worklet!.port.postMessage('flush')
      })
      this.flushComplete = null
    }
    this.stopCapture()
  }

  toggleMute() {
    this.muted = !this.muted
    this.worklet?.port.postMessage('reset')
    return this.muted
  }

  close() {
    this.disposed = true
    this.flushComplete?.()
    this.stopCapture()
    this.interrupt()
    if (this.worklet) this.worklet.port.onmessage = null
    if (this.context && this.context.state !== 'closed') void this.context.close()
  }
}
