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
  /** قيادة الفريق: المديرون ثم المشرفون، بترتيب إدخالهم. */
  leads?: TeamLeadRow[] | null
}

export interface TeamLeadRow {
  id: string
  role: 'manager' | 'supervisor'
  name: string
  name_ar: string | null
  photo_url: string | null
}

/** صف من public.lb_team_contributions — مساهمة مستشار في فريق بعينه. */
export interface TeamContribution {
  team_id: string
  team: string
  team_ar: string | null
  agent_id: string
  name: string
  name_ar: string | null
  photo_url: string | null
  year: number
  quarter: number
  deals: number
  target: number
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

/** صف من public.lb_sale_events */
export interface SaleEventRow {
  id: number
  agent_id: string
  year: number
  quarter: number
  /** sale: زيادة مكتشفة تلقائياً · manual: تهنئة أطلقها مسؤول */
  kind: 'sale' | 'manual'
  amount_egp: number
  total_egp: number
  note: string | null
  created_at: string
  name: string
  name_ar: string | null
  photo_url: string | null
  team: string | null
  team_ar: string | null
  /** أغنية مختارة للتهنئة اليدوية؛ null = الأغنية الافتراضية. */
  song_id: string | null
  mute: boolean
  /** مدة خاصة بالثواني؛ null = مدة الإعدادات. */
  duration_s: number | null
}

/** صف من public.lb_devices — شاشة أو متصفح فاتح البرنامج */
export interface DeviceRow {
  id: string
  label: string | null
  user_email: string | null
  user_agent: string | null
  screen: string | null
  view: string | null
  kiosk: boolean
  first_seen: string
  last_seen: string
  revoked_at: string | null
}

/** صف من public.lb_deals — صفقة واحدة بتاريخها ومبلغها */
export interface DealRow {
  id: string
  agent_id: string
  team_id: string | null
  /** YYYY-MM-DD */
  deal_date: string
  amount_egp: number
  year: number
  quarter: number
  created_at: string
  name: string
  name_ar: string | null
  photo_url: string | null
  team: string | null
  team_ar: string | null
}

/** صف من public.lb_media_files */
export interface MediaFile {
  id: string
  /** song: أغنية احتفال · clip: مقطع قصير للرسائل */
  kind: 'song' | 'clip'
  name: string
  path: string
  duration_s: number | null
  size_bytes: number
  created_at: string
}

/** صف من public.lb_board_settings */
export interface BoardSettings {
  celebration_seconds: number
  celebration_song_id: string | null
  volume: number
}

/** صف من public.lb_announcements */
export interface Announcement {
  id: string
  style: 'welcome' | 'motivation'
  title: string
  body: string | null
  duration_s: number
  clip_id: string | null
  schedule: 'once' | 'daily'
  starts_at: string | null
  /** HH:MM بتوقيت القاهرة */
  daily_time: string | null
  /** 0 = الأحد … 6 = السبت */
  weekdays: number[]
  active: boolean
  created_at: string
  updated_at: string
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

/** خبر من مدونة إيفرست، بعد ما السيرفر ينضّفه في /api/news. */
export interface NewsItem {
  id: number
  title: string
  excerpt: string
  image: string | null
  date: string
  slug: string
  url: string
}
