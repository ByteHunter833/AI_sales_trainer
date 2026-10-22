import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowUpRight, AudioLines, ChevronRight, LoaderCircle, Mic, Plus } from 'lucide-react'
import type { Message, Session } from '../types'
import { dateLabel, duration, scenarioName } from '../types'

export function go(path: string) { location.hash = path }
export function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/')
  useEffect(() => { const handle = () => setRoute(location.hash.slice(1) || '/'); window.addEventListener('hashchange', handle); return () => window.removeEventListener('hashchange', handle) }, [])
  return route
}
export function Button({ children, onClick, disabled, secondary = false, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} className={`button ${secondary ? 'secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice error" role="alert"><AlertCircle size={19} /><div>{message}{retry && <button className="text-button" onClick={retry}>Try again <ChevronRight size={14} /></button>}</div></div>
}
export function Loading({ text = 'Loading your workspace…' }: { text?: string }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={24} /><p>{text}</p></div>
}
export function Empty({ title, text, action = false }: { title: string; text: string; action?: boolean }) {
  return <div className="empty"><div className="empty-icon"><AudioLines size={27} /></div><h3>{title}</h3><p>{text}</p>{action && <Button onClick={() => go('/training')}><Plus size={16} /> Start your first session</Button>}</div>
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { evaluated: 'Evaluated', insufficient_data: 'Too short / incomplete', evaluation_error: 'Evaluation failed', connecting: 'Connecting', created: 'Not started', completed: 'Saved', interrupted: 'Interrupted', active: 'In progress', evaluating: 'Evaluating', error: 'Connection failed' }
  return <span className={`status status-${value}`}><i />{labels[value] ?? value}</span>
}
export function SessionTable({ sessions }: { sessions: Session[] }) {
  return <div className="table-scroll"><table><thead><tr><th>Training session</th><th>Date</th><th>Duration</th><th>Score</th><th>Status</th><th><span className="sr-only">Open report</span></th></tr></thead><tbody>{sessions.map(s => <tr key={s.id}>
    <td><button className="session-link" onClick={() => go(`/results/${s.id}`)}><span className="session-icon"><Mic size={17} /></span><span><strong>{scenarioName(s.scenario)}</strong><small className="capitalize">{s.personality} customer · {s.difficulty}</small></span></button></td>
    <td>{dateLabel(s.created_at)}</td><td>{s.started_at ? duration(s.duration_seconds) : '—'}</td><td><strong className="table-score">{s.overall_score ?? '—'}</strong>{s.overall_score !== null && <small>/100</small>}</td><td><Status value={s.status} /></td><td><button className="icon-button" aria-label={`Open ${scenarioName(s.scenario)} report`} onClick={() => go(`/results/${s.id}`)}><ArrowUpRight size={18} /></button></td>
  </tr>)}</tbody></table></div>
}
export function Transcript({ messages, live = false }: { messages: Message[]; live?: boolean }) {
  useEffect(() => { if (live) document.getElementById('transcript-bottom')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages, live])
  return <div className={`transcript ${live ? 'live-transcript' : ''}`}>{messages.length ? messages.map(m => <article className={`message ${m.speaker}`} key={m.id} id={`turn-${m.id}`}>
    <div className="message-avatar">{m.speaker === 'customer' ? 'AI' : 'Y'}</div><div><div className="message-meta"><strong>{m.speaker === 'customer' ? 'AI customer' : 'You'}</strong><time>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.content}</p></div>
  </article>) : <div className="transcript-empty"><AudioLines size={24} /><p>{live ? 'Your conversation will appear here.' : 'No transcript was received.'}</p><small>{live ? 'Transcribed from your actual voice conversation.' : 'No conversation text has been generated or substituted.'}</small></div>}<div id="transcript-bottom" /></div>
}
