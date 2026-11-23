import type { PlayerStatus } from '@/lib/market-data'
import { cn } from '@/lib/utils'
import { AlertTriangle, Ban } from 'lucide-react'

export function StatusBadge({ status, compact = false }: { status: PlayerStatus; compact?: boolean }) {
  if (status === 'injured') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm border border-lock/30 bg-lock/10 px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap text-lock"
        title="Injured"
      >
        <AlertTriangle className="size-3" aria-hidden="true" />
        {compact ? 'Injured' : 'Injured'}
      </span>
    )
  }
  if (status === 'suspended') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm border border-loss/30 bg-loss/10 px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap text-loss"
        title="Suspended"
      >
        <Ban className="size-3" aria-hidden="true" />
        {compact ? 'Susp.' : 'Suspended'}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-gain/30 bg-gain/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gain',
      )}
    >
      <span className="size-1.5 rounded-full bg-gain" aria-hidden="true" />
      Active
    </span>
  )
}
