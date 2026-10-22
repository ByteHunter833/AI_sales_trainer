import type { DashboardData, Health, Session, SessionConfig, SessionDetail } from '../types'

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Request failed (${response.status}). Please try again.`)
  }
  return response.json()
}
export const api = {
  health: () => request<Health>('/health'),
  dashboard: () => request<DashboardData>('/dashboard'),
  sessions: (offset = 0) => request<{ items: Session[]; total: number }>(`/sessions?offset=${offset}&limit=10`),
  session: (id: string) => request<SessionDetail>(`/sessions/${id}`),
  create: (config: SessionConfig) => request<Session>('/sessions', { method: 'POST', body: JSON.stringify(config) }),
  evaluate: (id: string) => request<{ status: string }>(`/sessions/${id}/evaluate`, { method: 'POST' }),
}
