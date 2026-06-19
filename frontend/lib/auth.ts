'use client'
import type { AuthSession } from './types'

const SESSION_KEY = 'popolo_loyalty_session'

export function saveSession(session: AuthSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session: AuthSession = JSON.parse(raw)
    if (new Date(session.expires_at) < new Date()) {
      clearSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null
}
