import { formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'
import { MODES, type ModeId } from './modes'
import { SettingsSheet } from './settings-sheet'

type HeaderBarProps = {
  mode: ModeId
  onModeChange: (mode: ModeId) => void
  cash: number
  netValue: number
  displayName: string
}

export function HeaderBar({ mode, onModeChange, cash, netValue, displayName }: HeaderBarProps) {
  return (
    <header className="flex shrink-0 items-center border-b border-border bg-panel px-5 h-11">
      {/* Identity */}
      <div className="flex shrink-0 items-center gap-3 w-44">
        <SettingsSheet cash={cash} displayName={displayName} />
        <span className="text-sm font-bold tracking-tight text-foreground select-none">
          Pl<span className="text-gain">X</span>
        </span>
        <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground/60 uppercase hidden lg:block">Exchange</span>
      </div>

      {/* Nav — centred, flat underline active state */}
      <nav aria-label="Modes" className="flex flex-1 items-center justify-center h-full">
        {MODES.map((m) => {
          const active = m.id === mode
          const Icon = m.icon
          const dim = m.status === 'phase'
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              aria-current={active ? 'page' : undefined}
              title={m.title}
              className={cn(
                'relative flex h-full items-center gap-1.5 px-4 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-foreground' : dim ? 'text-muted-foreground/50 hover:text-muted-foreground' : 'text-muted-foreground hover:text-foreground',
                active && 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-gain',
              )}
            >
              <Icon className="size-3" aria-hidden="true" />
              {m.label}
              {m.tag && m.status === 'active' && (
                <span className="font-mono text-[8px] text-gain/70">{m.tag}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Account — right-aligned, net value dominates */}
      <div className="flex shrink-0 items-center gap-3 w-44 justify-end">
        <dl className="flex items-baseline gap-2 font-mono text-right">
          <div className="hidden sm:block">
            <dt className="sr-only">Cash</dt>
            <dd className="text-[10px] text-muted-foreground tabular-nums">{formatUSD(cash)}</dd>
          </div>
          <div className="h-3 w-px bg-border hidden sm:block" aria-hidden="true" />
          <div>
            <dt className="sr-only">Net value</dt>
            <dd className="text-sm font-semibold text-foreground tabular-nums">{formatUSD(netValue)}</dd>
          </div>
        </dl>
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-secondary font-mono text-[9px] font-bold text-foreground ring-1 ring-border/60"
          role="img"
          aria-label={`Account: ${displayName}`}
        >
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
