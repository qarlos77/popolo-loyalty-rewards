export interface Partner {
  id: number
  name: string
  phone: string | null
  vat: string | null
  image_url: string
}

export interface LoyaltyCard {
  id: number
  code: string
  points: number
  points_display: string
  program: { id: number; name: string }
  expiration_date: string | null
}

export interface Reward {
  id: number
  program_id: number
  name: string
  required_points: number
  reward_type: string
  affordable: boolean
  discount: number | null
}

export interface HistoryItem {
  id: string
  type: 'earned' | 'redeemed'
  description: string
  points: number
  date: string
  state: string
  code?: string
  amount?: number
}

export interface MeResponse {
  partner: Partner
  total_points: number
  cards: LoyaltyCard[]
}

export interface AuthSession {
  token: string
  expires_at: string
  partner: Partner
}
