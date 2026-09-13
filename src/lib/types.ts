export type Scope = 'team' | 'agent'

/** صف من public.lb_team_standings */
export interface TeamStanding {
  team_id: string
  name: string
  name_ar: string | null
  photo_url: string | null
  year: number
  quarter: number
  deals: number
  target: number
  members: number
  pct: number
  rank: number
}

/** صف من public.lb_agent_standings */
export interface AgentStanding {
  agent_id: string
  name: string
  name_ar: string | null
  team: string | null
  team_ar: string | null
  photo_url: string | null
  year: number
  quarter: number
  deals: number
  target: number
  pct: number
  rank: number
}

/** صف من public.lb_rank_history */
export interface RankHistoryPoint {
  taken_on: string
  scope: Scope
  entity_id: string
  entity_name: string
  year: number
  quarter: number
  deals: number
  target: number
  rank: number
}

export type FeedStatus = 'live' | 'connecting' | 'reconnecting' | 'demo'
export type BoardView = 'teams' | 'agents' | 'insights'
/** المظهر المطبَّق فعلياً على الصفحة. */
export type ThemeName = 'daylight' | 'midnight'

/** ما يختاره المستخدم: مظهر ثابت، أو 'auto' ليتبع ساعة اليوم. */
export type ThemePreference = ThemeName | 'auto'
export type LocaleName = 'ar' | 'en'

/** عنصر في وسيلة إيضاح الرسم البياني. */
export interface LegendItem {
  label: string
  color: string
  kind?: 'line' | 'swatch'
}
