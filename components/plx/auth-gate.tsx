'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { signIn, signUp } from '@/lib/supabase/auth'
import type { User } from '@supabase/supabase-js'

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
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm rounded-lg border border-border p-8">
        <h1 className="text-xl font-semibold">Pl<span className="text-gain">X</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>
        <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
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
            {mode === 'signin' ? "No account? Sign up" : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
