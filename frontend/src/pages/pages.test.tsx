import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import Training from './Training'
import History from './History'
import Results from './Results'
import { api } from '../services/api'

const emptyDashboard = { total_sessions: 0, average_score: null, total_duration_seconds: 0, improvement_percentage: null, evaluated_sessions: 0, skills: {}, recent_sessions: [], trend: [] }
const health = { status: 'ok', ai_ready: true, missing_configuration: [], max_session_seconds: 600 }

describe('real-data pages', () => {
  it('renders honest empty dashboard without invented scores', async () => {
    vi.spyOn(api, 'dashboard').mockResolvedValue(emptyDashboard)
    render(<Dashboard />)
    expect(await screen.findByText('Your progress starts with one conversation')).toBeInTheDocument()
    expect(screen.getByText('0 evaluated sessions')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Start your first session'))
    expect(location.hash).toBe('#/training')
  })

  it('displays API errors and retries', async () => {
    const fetch = vi.spyOn(api, 'dashboard').mockRejectedValueOnce(new Error('Backend unavailable')).mockResolvedValueOnce(emptyDashboard)
    render(<Dashboard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable')
    fireEvent.click(screen.getByText('Try again'))
    await screen.findByText('Your progress starts with one conversation')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('configures scenario, personality, difficulty, language and product', () => {
    render(<Training health={health} />)
    fireEvent.click(screen.getByRole('button', { name: /product comparison/i }))
    expect(screen.getByRole('button', { name: /product comparison/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /analytical/i }))
    fireEvent.click(screen.getByRole('button', { name: 'hard' }))
    fireEvent.change(screen.getByLabelText('Conversation language'), { target: { value: 'ru' } })
    expect(screen.getByLabelText('Conversation language')).toHaveValue('ru')
    fireEvent.change(screen.getByLabelText('What are you selling?'), { target: { value: 'A custom product for small businesses.' } })
    expect(screen.getByRole('button', { name: 'Start training' })).toBeEnabled()
  })

  it('prevents live training when Gemini is unconfigured', () => {
    render(<Training health={{ ...health, ai_ready: false }} />)
    expect(screen.getByRole('button', { name: 'Start training' })).toBeDisabled()
  })

  it('shows microphone permission errors without creating a session', async () => {
    const create = vi.spyOn(api, 'create')
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } })
    vi.stubGlobal('AudioContext', class { state = 'running'; resume = vi.fn().mockResolvedValue(undefined); close = vi.fn().mockResolvedValue(undefined) })
    render(<Training health={health} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start training' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone permission was denied')
    expect(create).not.toHaveBeenCalled()
  })

  it('renders empty history', async () => {
    vi.spyOn(api, 'sessions').mockResolvedValue({ items: [], total: 0 })
    render(<History />)
    expect(await screen.findByText('Your journey starts here')).toBeInTheDocument()
  })

  it('renders insufficient-data report without a numeric score', async () => {
    vi.spyOn(api, 'session').mockResolvedValue({ id: 'test', created_at: '2026-01-01T00:00:00Z', started_at: null, ended_at: null, duration_seconds: 0, status: 'insufficient_data', scenario: 'price_objection', personality: 'skeptical', difficulty: 'medium', language: 'en', product_description: 'CRM for businesses', overall_score: null, error: null, transcript_warning: null, messages: [], evaluation: null })
    vi.spyOn(api, 'dashboard').mockResolvedValue(emptyDashboard)
    render(<Results id="test" />)
    expect(await screen.findByText('A little more conversation will help.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('YOUR OVERALL SCORE')).not.toBeInTheDocument())
  })
})
