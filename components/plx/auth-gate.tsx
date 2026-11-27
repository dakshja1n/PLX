'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { signIn, signUp } from '@/lib/supabase/auth'
import type { User } from '@supabase/supabase-js'

const PITCH = [
  { ticker: 'SLAH', name: 'Mohamed Salah',  change: '+4.2%',  positive: true  },
  { ticker: 'HAAL', name: 'Erling Haaland', change: '+2.8%',  positive: true  },
  { ticker: 'SAKA', name: 'Bukayo Saka',    change: '-1.1%',  positive: false },
  { ticker: 'PALM', name: 'Cole Palmer',    change: '+6.5%',  positive: true  },
  { ticker: 'ISAK', name: 'Alexander Isak', change: '+3.3%',  positive: true  },
]

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div
      className="flex h-screen items-center justify-center bg-background text-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="font-mono text-sm text-muted-foreground">Loading...</span>
    </div>
  )

  if (user) return <>{children}</>

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setSubmitting(true)
    setError(null)
    const fn = mode === 'signin' ? signIn : signUp
    const { error } = await fn(email, password)
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <div className="flex h-screen bg-background text-foreground">

      {/* Left — identity and pitch */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 border-r border-border bg-panel px-14 py-12">
        <div>
          <p className="font-mono text-xs tracking-widest text-muted-foreground mb-8">PREMIER LEAGUE EXCHANGE</p>
          <h1 className="text-5xl font-bold tracking-tight text-foreground leading-tight">
            Pl<span className="text-gain">X</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-xs">
            Trade Premier League players like equities. Prices move with real match performance.
          </p>
        </div>

        {/* Live-ish sample ticker rows */}
        <div className="flex flex-col gap-px border border-border rounded-sm overflow-hidden">
          <div className="flex items-center justify-between bg-card px-4 py-2 border-b border-border">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">PLAYER</span>
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">24H</span>
          </div>
          {PITCH.map((p) => (
            <div key={p.ticker} className="flex items-center justify-between bg-card px-4 py-2.5 border-b border-border/50 last:border-0">
              <div>
                <span className="font-mono text-xs text-foreground font-medium">{p.ticker}</span>
                <span className="ml-2 text-xs text-muted-foreground">{p.name}</span>
              </div>
              <span className={`font-mono text-xs font-semibold tabular-nums ${p.positive ? 'text-gain' : 'text-loss'}`}>
                {p.change}
              </span>
            </div>
          ))}
        </div>

        <p className="font-mono text-[10px] text-muted-foreground/50">
          Starting balance $10,000 · 0.5% fee · 2×/3×/5× leverage
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {/* Mobile wordmark */}
        <p className="lg:hidden font-mono text-2xl font-bold mb-8">
          Pl<span className="text-gain">X</span>
        </p>

        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-foreground">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'signin' ? 'Welcome back.' : 'Start with $10,000 in virtual cash.'}
          </p>

          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-xs font-medium text-muted-foreground">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-loss">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
