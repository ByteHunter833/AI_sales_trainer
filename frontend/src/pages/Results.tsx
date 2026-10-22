import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Lightbulb, LoaderCircle, MessageSquareText, RefreshCw, Sparkles, Target, TrendingUp } from 'lucide-react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { api } from '../services/api'
import { dateLabel, duration, scenarioName, skillLabels, type DashboardData, type Evidence, type SessionDetail } from '../types'
import { Button, ErrorBox, go, Loading, Status, Transcript } from '../components/ui'

export default function Results({ id }: { id: string }) {
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let disposed = false
    let timeout: ReturnType<typeof setTimeout>
    setError('')
    async function load() {
      try {
        const data = await api.session(id)
        if (disposed) return
        setSession(data)
        if (['completed', 'evaluating', 'active', 'connecting'].includes(data.status)) timeout = setTimeout(load, 1200)
        else api.dashboard().then(d => { if (!disposed) setDashboard(d) }).catch(() => {})
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Unable to load session.') }
    }
    void load()
    return () => { disposed = true; clearTimeout(timeout) }
  }, [id, revision])
  async function retry() {
    setError(''); setRetrying(true)
    try { await api.evaluate(id); setRevision(n => n + 1) } catch (e) { setError(e instanceof Error ? e.message : 'Evaluation failed.') } finally { setRetrying(false) }
  }
  if (!session) return error ? <ErrorBox message={error} retry={() => setRevision(n => n + 1)} /> : <Loading text="Opening your coaching report…" />
  const report = session.evaluation
  const previous = dashboard?.trend.filter(s => s.id !== session.id && new Date(s.date) < new Date(session.started_at ?? session.created_at)).at(-1)
  const difference = report && previous ? report.overall_score - previous.score : null
  const working = ['completed', 'evaluating'].includes(session.status)
  return <>
    <button className="back-link" onClick={() => go('/history')}><ArrowLeft size={15} /> Training history</button>
    <div className="page-heading"><div><div className="eyebrow">EVERY CONVERSATION IS A STEP FORWARD</div><h1>{report ? 'Your conversation. Your next level.' : 'Your training session'}</h1><p>{scenarioName(session.scenario)} <span className="heading-separator">/</span> {dateLabel(session.created_at)} <span className="heading-separator">/</span> {duration(session.duration_seconds)} minutes</p></div><Button onClick={() => go(`/training?scenario=${session.scenario}`)}><RefreshCw size={16} /> Practice again</Button></div>
    {error && <ErrorBox message={error} retry={() => setRevision(n => n + 1)} />}
    {session.transcript_warning && <div className="notice warning">{session.transcript_warning}</div>}
    {session.error && <ErrorBox message={session.error} />}
    {!report && <section className="panel evaluation-state">{working ? <><div className="evaluating-icon"><Sparkles size={32} /></div><h2>Your conversation is becoming a plan.</h2><p>Reviewing the real transcript, checking the evidence, and finding your next steps.</p><div className="evaluating-steps"><span><CheckCircle2 size={16} /> Conversation saved</span><span><LoaderCircle className="spin" size={16} /> Preparing coaching report</span></div></> : <><Status value={session.status} /><h2>{session.status === 'insufficient_data' ? 'A little more conversation will help.' : session.status === 'created' ? 'This session hasn’t started yet.' : 'Your conversation is saved.'}</h2><p>{session.status === 'insufficient_data' ? 'A meaningful report needs at least two turns from each speaker and 30 salesperson words, with a complete transcript. Try a longer conversation.' : session.status === 'created' ? 'Start a new practice session when you’re ready.' : 'You can review the transcript below. A coaching report is available when there is enough complete conversation data.'}</p>{['evaluation_error', 'error', 'interrupted'].includes(session.status) && !session.transcript_warning && <Button onClick={() => void retry()} disabled={retrying}>{retrying ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Retry evaluation</Button>}</>}</section>}
    {report && <><div className="results-top"><section className="panel score-panel"><span className="eyebrow">YOUR OVERALL SCORE</span><div className="score-ring" style={{ background: `conic-gradient(#818cf8 ${report.overall_score * 3.6}deg, #292934 0deg)` }}><div><strong>{report.overall_score}</strong><span>out of 100</span></div></div><span className="score-caption">A snapshot of this conversation</span>{difference !== null && <div className={`comparison ${difference >= 0 ? 'positive' : ''}`}><TrendingUp size={16} />{difference > 0 ? '+' : ''}{difference} points from your previous session</div>}<p>Coaching feedback, not an objective measure of your sales ability.</p></section>
      <section className="panel radar-panel"><div className="panel-heading"><div><h3>Your skills, in focus</h3><p>See where you shine and where to grow.</p></div><Target size={18} className="muted" /></div><div className="radar-chart"><ResponsiveContainer width="100%" height="100%"><RadarChart data={Object.entries(report.categories).map(([k, v]) => ({ skill: skillLabels[k as keyof typeof skillLabels].replace('Communication clarity', 'Communication').replace('Value proposition', 'Value'), score: v }))} outerRadius="68%"><PolarGrid stroke="#34343f" /><PolarAngleAxis dataKey="skill" tick={{ fill: '#b3b3c1', fontSize: 11 }} /><PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} /><Radar dataKey="score" stroke="#818cf8" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} /></RadarChart></ResponsiveContainer></div></section>
      <section className="panel category-panel"><div className="panel-heading"><div><h3>The breakdown</h3><p>Five equally weighted skills.</p></div></div><div className="skill-list">{Object.entries(report.categories).map(([key, value]) => <div className="skill-item" key={key}><div><span>{skillLabels[key as keyof typeof skillLabels]}</span><strong>{value}<small>/10</small></strong></div><div className="progress-track"><span style={{ width: `${value * 10}%` }} /></div></div>)}</div></section></div>
      <section className="coach-summary"><span><Sparkles size={22} /></span><div><h3>A note from your AI coach</h3><p>{report.summary}</p></div></section>
      <div className="feedback-grid"><Feedback title="What you did well" icon={<CheckCircle2 size={20} />} items={report.strengths} positive /><Feedback title="Room to grow" icon={<TrendingUp size={20} />} items={report.weaknesses} /></div>
      <section className="panel recommendations"><div className="panel-heading"><div><h3><Lightbulb size={19} /> Make your next conversation better</h3><p>Specific steps from your AI coach.</p></div></div><div className="recommendation-grid">{report.recommendations.map((text, i) => <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{text}</p></div>)}</div></section>
    </>}
    <section className="panel report-transcript"><div className="panel-heading"><div><h3><MessageSquareText size={18} /> Conversation transcript</h3><p>Your actual conversation, preserved for reflection.</p></div><span className="subtle-tag"><Clock3 size={13} />{duration(session.duration_seconds)}</span></div><Transcript messages={session.messages} /></section>
    <div className="report-cta"><div><h3>Put your next step into practice.</h3><p>Progress happens one conversation at a time.</p></div><Button onClick={() => go(`/training?scenario=${session.scenario}`)}>Practice again <ArrowRight size={17} /></Button></div>
  </>
}
function Feedback({ title, icon, items, positive = false }: { title: string; icon: React.ReactNode; items: Evidence[]; positive?: boolean }) {
  return <section className={`panel feedback ${positive ? 'positive' : ''}`}><h3>{icon}{title}</h3>{items.map((item, i) => <article key={i}><p>{item.feedback}</p><button className="evidence" onClick={() => document.getElementById(`turn-${item.turn_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span>FROM YOUR CONVERSATION <ArrowRight size={12} /></span><q>{item.quote}</q></button></article>)}</section>
}
