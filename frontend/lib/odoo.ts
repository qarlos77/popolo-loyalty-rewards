const BASE = '/api/loyalty'   // Proxied through Next.js → Odoo

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data as T
}

export const odoo = {
  auth: (identifier: string, deviceHint?: string) =>
    apiFetch<{ token: string; expires_at: string; partner: import('./types').Partner }>(
      '/auth',
      { method: 'POST', body: JSON.stringify({ identifier, device_hint: deviceHint }) },
    ),

  otpRequest: (email: string) =>
    apiFetch<{ ok: boolean; resend_wait?: number }>(
      '/otp/request',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),

  otpVerify: (email: string, code: string, deviceHint?: string) =>
    apiFetch<{ token: string; expires_at: string; partner: import('./types').Partner }>(
      '/otp/verify',
      { method: 'POST', body: JSON.stringify({ email, code, device_hint: deviceHint }) },
    ),

  me: (token: string) =>
    apiFetch<import('./types').MeResponse>('/me', {}, token),

  balance: (token: string) =>
    apiFetch<{ total_points: number; cards: import('./types').LoyaltyCard[]; timestamp: string }>(
      '/balance', {}, token,
    ),

  rewards: (token: string) =>
    apiFetch<{ total_points: number; rewards: import('./types').Reward[] }>(
      '/rewards', {}, token,
    ),

  history: (token: string, limit = 20) =>
    apiFetch<{ history: import('./types').HistoryItem[] }>(
      `/history?limit=${limit}`, {}, token,
    ),

  coupons: (token: string) =>
    apiFetch<{ coupons: import('./types').Coupon[] }>('/coupons', {}, token),

  selfRegister: (data: {
    name: string
    last_name: string
    email: string
    phone?: string
    birth_date?: string
    doc_type?: string
    doc_number?: string
  }) =>
    apiFetch<{
      success: boolean
      token: string
      expires_at: string
      partner: import('./types').Partner
      welcome_points: number
      total_points: number
    }>(
      '/self-register',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  redeem: (token: string, cardId: number, rewardId: number) =>
    apiFetch<{
      success: boolean
      transaction_id: number
      confirmation_code: string
      points_remaining: number
      reward: { name: string; required_points: number }
      expires_at: string
      qr_payload: string
    }>(
      '/redeem',
      { method: 'POST', body: JSON.stringify({ card_id: cardId, reward_id: rewardId }) },
      token,
    ),
}
