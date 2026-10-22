import { useEffect, useRef, useState } from 'react'
import { VoiceAudio } from '../audio/VoiceAudio'
import { api } from '../services/api'
import type { Message, SessionConfig } from '../types'

export type VoiceStatus = 'idle' | 'preparing' | 'connecting' | 'live' | 'ending' | 'ended' | 'error'

export function useTraining(onEnded: (id: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [level, setLevel] = useState(0)
  const [muted, setMuted] = useState(false)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const audio = useRef<VoiceAudio | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const statusRef = useRef<VoiceStatus>('idle')
  const generation = useRef(0)
  const flushing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endCallback = useRef(onEnded)
  endCallback.current = onEnded

  function update(value: VoiceStatus) { statusRef.current = value; setStatus(value) }
  function cleanup() {
    if (timer.current) clearTimeout(timer.current)
    audio.current?.close()
    audio.current = null
    socket.current?.close()
    socket.current = null
  }
  function fail(message: string) {
    update('error'); setError(message); cleanup(); setLevel(0)
  }

  useEffect(() => () => { generation.current++; cleanup() }, [])

  async function start(config: SessionConfig) {
    if (!['idle', 'error'].includes(statusRef.current)) return
    cleanup()
    const attempt = ++generation.current
    update('preparing'); setError(''); setMessages([]); setSessionId(null); setMuted(false); setStartedAt(null)
    const voice = new VoiceAudio()
    audio.current = voice
    try {
      await voice.start((pcm, volume) => {
        setLevel(volume)
        const ws = socket.current
        if (ws?.readyState === WebSocket.OPEN && (statusRef.current === 'live' || flushing.current)) {
          if (ws.bufferedAmount > 128000) { fail('The network cannot keep up with your audio. Check the connection and start again.'); return }
          ws.send(pcm)
        }
      })
      if (attempt !== generation.current) return
      const health = await api.health()
      if (!health.ai_ready) throw new Error('Gemini is not configured. Set the API key and model names in backend/.env.')
      const session = await api.create(config)
      if (attempt !== generation.current) return
      setSessionId(session.id)
      update('connecting')
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/training/${session.id}`)
      socket.current = ws
      ws.binaryType = 'arraybuffer'
      timer.current = setTimeout(() => fail('The voice connection timed out. Check your API configuration and try again.'), 20000)
      ws.onmessage = event => {
        if (attempt !== generation.current) return
        try {
          if (event.data instanceof ArrayBuffer) { if (statusRef.current === 'live') voice.play(event.data); return }
          const data = JSON.parse(event.data)
          if (data.type === 'connected') {
            if (timer.current) clearTimeout(timer.current)
            update('live'); setStartedAt(data.started_at)
          } else if (data.type === 'transcript') {
            setMessages(previous => {
              const index = previous.findIndex(m => m.id === data.message.id)
              return index < 0 ? [...previous, data.message] : previous.map(m => m.id === data.message.id ? data.message : m)
            })
          } else if (data.type === 'interrupted') voice.interrupt()
          else if (data.type === 'ending') { update('ending'); voice.stopCapture(); voice.interrupt() }
          else if (data.type === 'error') fail(data.message)
          else if (data.type === 'ended') {
            const hadError = statusRef.current === 'error'
            cleanup(); setLevel(0)
            if (!hadError) { update('ended'); endCallback.current(session.id) }
          }
        } catch (cause) { fail(cause instanceof Error ? cause.message : 'Could not process the voice response.') }
      }
      ws.onerror = () => { if (attempt === generation.current) fail('Could not connect to the voice service. Check that the backend is running.') }
      ws.onclose = () => {
        if (!['ended', 'error'].includes(statusRef.current) && attempt === generation.current) {
          fail('Connection interrupted. Received transcript is saved in training history. Start a new session to reconnect.')
        }
      }
    } catch (cause) {
      if (attempt === generation.current) fail(cause instanceof Error ? cause.message : 'Unable to start training.')
    }
  }

  async function end() {
    if (statusRef.current !== 'live') return
    update('ending'); flushing.current = true
    audio.current?.interrupt()
    await audio.current?.finishCapture()
    flushing.current = false; setLevel(0)
    if ((statusRef.current as VoiceStatus) !== 'ending' || socket.current?.readyState !== WebSocket.OPEN) return
    socket.current.send(JSON.stringify({ type: 'end' }))
    timer.current = setTimeout(() => fail('Saving took too long. Your received transcript is available in training history.'), 15000)
  }
  function toggleMute() {
    const voice = audio.current
    if (!voice) return
    voice.toggleMute()
    setMuted(voice.muted); setLevel(0)
    if (voice.muted && socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'audio_pause' }))
  }
  return { status, error, messages, level, muted, startedAt, sessionId, start, end, toggleMute }
}
