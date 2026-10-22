export type Scenario = 'price_objection' | 'difficult_customer' | 'product_comparison' | 'closing_sale'
export interface SessionConfig {
  scenario: Scenario
  personality: 'skeptical' | 'friendly' | 'impatient' | 'analytical'
  difficulty: 'easy' | 'medium' | 'hard'
  language: 'en' | 'ru'
  product_description: string
}
export interface Message { id: string; sequence: number; speaker: 'customer' | 'salesperson'; content: string; timestamp: string }
export interface Session extends SessionConfig {
  id: string; created_at: string; started_at: string | null; ended_at: string | null
  duration_seconds: number; status: string; overall_score: number | null; error: string | null; transcript_warning: string | null
}
export const skillLabels = {
  needs_discovery: 'Needs discovery', communication: 'Communication clarity',
  objection_handling: 'Objection handling', value_proposition: 'Value proposition', closing: 'Closing skills',
}
export type Categories = Record<keyof typeof skillLabels, number>
export interface Evidence { feedback: string; turn_id: string; quote: string }
export interface Evaluation { overall_score: number; categories: Categories; strengths: Evidence[]; weaknesses: Evidence[]; recommendations: string[]; summary: string; created_at: string }
export interface SessionDetail extends Session { messages: Message[]; evaluation: Evaluation | null }
export interface Health { status: string; ai_ready: boolean; missing_configuration: string[]; max_session_seconds: number }
export interface DashboardData {
  total_sessions: number; average_score: number | null; total_duration_seconds: number
  improvement_percentage: number | null; evaluated_sessions: number; skills: Partial<Categories>
  recent_sessions: Session[]; trend: { id: string; date: string; score: number }[]
}
export const scenarios: { id: Scenario; title: string; description: string; skill: string; color: string }[] = [
  { id: 'price_objection', title: 'Price objection', description: 'Turn “it’s too expensive” into a conversation about value.', skill: 'Value & negotiation', color: 'violet' },
  { id: 'difficult_customer', title: 'Difficult customer', description: 'Build trust with a buyer who has heard it all before.', skill: 'Trust & empathy', color: 'amber' },
  { id: 'product_comparison', title: 'Product comparison', description: 'Make your difference clear when alternatives look alike.', skill: 'Positioning & clarity', color: 'blue' },
  { id: 'closing_sale', title: 'Closing a sale', description: 'Resolve the last hesitation and agree on a next step.', skill: 'Confidence & closing', color: 'green' },
]
export const scenarioName = (id: string) => scenarios.find(s => s.id === id)?.title ?? id
export const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
export const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
