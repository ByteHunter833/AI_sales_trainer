import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { api } from '../services/api'
import type { Session } from '../types'
import { Button, Empty, ErrorBox, go, Loading, SessionTable } from '../components/ui'

export default function History() {
  const [data, setData] = useState<{ items: Session[]; total: number } | null>(null)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let disposed = false
    setError(''); setData(null)
    api.sessions(offset).then(d => { if (!disposed) setData(d) }).catch(e => { if (!disposed) setError(e.message) })
    return () => { disposed = true }
  }, [offset, revision])
  return <><div className="page-heading"><div><div className="eyebrow">YOUR PROGRESS, ONE CONVERSATION AT A TIME</div><h1>Every session has something to teach.</h1><p>Revisit your conversations. Reflect on feedback. Keep moving forward.</p></div><Button onClick={() => go('/training')}><Plus size={17} /> New training</Button></div>{error ? <ErrorBox message={error} retry={() => setRevision(n => n + 1)} /> : !data ? <Loading /> : <section className="panel"><div className="panel-heading"><div><h3>Training history <span className="count">{data.total}</span></h3><p>All your saved practice sessions and coaching reports.</p></div></div>{data.items.length ? <><SessionTable sessions={data.items} /><div className="pagination"><span>Showing {offset + 1}–{Math.min(offset + 10, data.total)} of {data.total}</span><div><Button secondary disabled={offset === 0} onClick={() => setOffset(o => o - 10)}><ArrowLeft size={14} /> Previous</Button><Button secondary disabled={offset + 10 >= data.total} onClick={() => setOffset(o => o + 10)}>Next <ArrowRight size={14} /></Button></div></div></> : <Empty title="Your journey starts here" text="Complete your first conversation to build a history of progress." action />}</section>}</>
}
