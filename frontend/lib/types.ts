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

export interface BirthdayInfo {
  has_birth_date: boolean
  is_today: boolean
  days_to_birthday: number | null
  is_birthday_period: boolean
  benefit_used_this_year: boolean
  benefit_available: boolean
  birthday_points_awarded: number
  birthday_points_config: number
  gift_product: { name: string; image_url: string } | null
}

export interface MeResponse {
  partner: Partner
  total_points: number
  cards: LoyaltyCard[]
  birthday?: BirthdayInfo
}

export interface Coupon {
  id: number
  code: string
  program_name: string
  points: number
  available: boolean
  expiration_date: string | null
  reward: {
    type: string
    discount: number | null
    discount_mode: string | null
    description: string
  } | null
}

export interface AuthSession {
  token: string
  expires_at: string
  partner: Partner
}
