import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, AudioLines, ChevronRight, CircleHelp, History as HistoryIcon, LayoutDashboard, Menu, Plus, Radio, Sparkles, X, Zap } from 'lucide-react'
import { api } from './services/api'
import type { Health } from './types'
import { Button, ErrorBox, go, Loading, useRoute } from './components/ui'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Training = lazy(() => import('./pages/Training'))
const Results = lazy(() => import('./pages/Results'))
const History = lazy(() => import('./pages/History'))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="panel fatal-error"><ErrorBox message="This page could not be displayed. Reload to try again; your saved sessions are still in training history." /><Button onClick={() => location.reload()}>Reload application</Button></div> : this.props.children }
}

export default function App() {
  const route = useRoute()
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const isTraining = route.startsWith('/training')
  const isResults = route.startsWith('/results/')
  const current = isTraining ? 'New training' : isResults ? 'Coaching report' : route === '/history' ? 'Training history' : 'Overview'
  function checkHealth() { setHealthError(''); api.health().then(setHealth).catch(() => setHealthError('Cannot reach the backend. Start FastAPI on port 8000, then retry.')) }
  useEffect(checkHealth, [])
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); document.title = `${current} · SalesPilot AI` }, [route, current])
  useEffect(() => {
    if (!helpOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelpOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [helpOpen])
  return <ErrorBoundary><div className="app-shell">
    {mobileOpen && <button aria-label="Close navigation" className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}><a className="brand" href="#/"><span className="brand-icon"><Zap size={22} fill="white" /></span><span>SalesPilot<span className="brand-ai">AI</span></span></a><div className="workspace-label"><div className="workspace-avatar">S</div><div>Personal workspace<small>Single-user demo</small></div><ChevronRight size={14} /></div><div className="nav-label">WORKSPACE</div><nav>{[{ path: '/', label: 'Overview', icon: LayoutDashboard }, { path: '/training', label: 'New training', icon: AudioLines }, { path: '/history', label: 'Training history', icon: HistoryIcon }].map(item => <a key={item.path} className={`nav-item ${(item.path === '/' ? route === '/' : route.startsWith(item.path)) || (isResults && item.path === '/history') ? 'active' : ''}`} href={`#${item.path}`}><item.icon size={19} /><span>{item.label}</span>{item.path === '/training' && <Plus size={14} />}</a>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><span><Sparkles size={19} /> A little better, every day.</span><p>Confidence comes from the conversations you practice.</p><button onClick={() => go('/training')}>Make time to practice <ArrowUpRight size={15} /></button></div><button className="help-link" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /> Getting started <ArrowUpRight size={14} /></button><div className="user-profile"><div className="user-avatar">Y</div><div>Your workspace<small>Sales professional</small></div><span className="demo-badge">DEMO</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><span className="breadcrumb">Workspace <ChevronRight size={13} /> <strong>{current}</strong></span></div><div className="topbar-right"><span className={`service-status ${health?.ai_ready ? 'ready' : ''}`}><i />{health?.ai_ready ? 'AI configured' : 'Setup required'}</span><span className="topbar-divider" /><span className="top-avatar">Y</span></div></header>
      <main>{healthError && <ErrorBox message={healthError} retry={checkHealth} />}{health && !health.ai_ready && <div className="configuration-banner"><Radio size={18} /><div><strong>Connect your AI customer</strong><span>Add your Gemini API key and model names in <code>backend/.env</code>, then restart the backend.</span></div><button className="text-button" onClick={checkHealth}>Check connection <ArrowUpRight size={14} /></button></div>}
        <Suspense fallback={<Loading />}>{isTraining ? <Training key={route} health={health} selected={new URLSearchParams(route.split('?')[1]).get('scenario') ?? undefined} /> : isResults ? <Results key={route} id={route.split('/')[2]} /> : route === '/history' ? <History /> : route === '/' ? <Dashboard /> : <div className="empty"><h1>Page not found</h1><Button onClick={() => go('/')}>Back to overview</Button></div>}</Suspense>
      </main>
    </div>
    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><section className="panel help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label="Close help" onClick={() => setHelpOpen(false)}><X size={20} /></button><span className="eyebrow">WELCOME TO SALESPILOT</span><h2 id="help-title">A better conversation starts here.</h2><ol><li><strong>Connect Gemini.</strong> Configure the API key and live/evaluation model names in the backend environment file.</li><li><strong>Set the scene.</strong> Choose a scenario, customer, language and product.</li><li><strong>Speak naturally.</strong> Allow microphone access. Headphones help reduce echo.</li><li><strong>Reflect and repeat.</strong> End the session to receive feedback based on your actual transcript.</li></ol><p>This is a local, single-user demo. Your audio is sent to Google Gemini. Transcripts and reports are stored locally; raw audio is not saved.</p><Button onClick={() => { setHelpOpen(false); go('/training') }}>Let’s practice <ArrowUpRight size={16} /></Button></section></div>}
  </div></ErrorBoundary>
}
