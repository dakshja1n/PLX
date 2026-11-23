'use client'

import { CircleCheck, TriangleAlert, Wallet } from 'lucide-react'
import { FEE_RATE, type Player, type TradeSide, formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'

type OrderTicketProps = {
  player: Player
  side: TradeSide
  onSideChange: (side: TradeSide) => void
  sharesInput: string
  onSharesChange: (value: string) => void
  cash: number
  ownedShares: number
  onExecute: () => void
  notice: string | null
}

const PRESETS = [
  { label: '25%', ratio: 0.25 },
  { label: '50%', ratio: 0.5 },
  { label: '75%', ratio: 0.75 },
  { label: 'MAX', ratio: 1 },
]

export function OrderTicket({
  player,
  side,
  onSideChange,
  sharesInput,
  onSharesChange,
  cash,
  ownedShares,
  onExecute,
  notice,
}: OrderTicketProps) {
  const isBuy = side === 'BUY'
  const isSell = side === 'SELL'
  const locked = player.status === 'injured' || player.status === 'suspended'
  const shares = Number.parseInt(sharesInput, 10)
  const validShares = Number.isFinite(shares) && shares > 0 ? shares : 0

  const notional = validShares * player.price
  const fee = notional * FEE_RATE
  const cashNeeded = isBuy ? notional + fee : 0
  const netProceeds = isSell ? notional - fee : 0

  const maxBuyable = Math.floor(cash / (player.price * (1 + FEE_RATE)))
  const capacity = isBuy ? maxBuyable : ownedShares

  let error: string | null = null
  if (validShares > 0) {
    if (isBuy && cashNeeded > cash) error = 'Insufficient cash for this order.'
    if (isSell && validShares > ownedShares) error = `You only own ${ownedShares} share${ownedShares === 1 ? '' : 's'}.`
  }

  const canExecute = !locked && validShares > 0 && !error

  const sideTabs: { id: TradeSide; label: string }[] = [
    { id: 'BUY', label: 'Buy' },
    { id: 'SELL', label: 'Sell' },
  ]

  return (
    <section className="flex flex-col rounded-lg border border-border bg-card" aria-labelledby="order-ticket-title">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="order-ticket-title" className="font-mono text-xs font-semibold tracking-widest text-foreground">
          ORDER TICKET
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">MARKET · {player.tickerName.toUpperCase()}</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div
          className="grid grid-cols-2 rounded-md border border-border bg-background p-1"
          role="tablist"
          aria-label="Order side"
        >
          {sideTabs.map(({ id, label }) => {
            const active = side === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSideChange(id)}
                className={cn(
                  'rounded-sm py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && id === 'BUY' && 'bg-gain text-primary-foreground',
                  active && id === 'SELL' && 'bg-loss text-white',
                  !active && 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="size-4" aria-hidden="true" />
            {isSell ? 'Shares Owned' : 'Available Cash'}
          </span>
          <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
            {isSell ? (
              `${ownedShares} ${ownedShares === 1 ? 'share' : 'shares'}`
            ) : (
              <>
                {formatUSD(cash)} <span className="text-[10px] text-muted-foreground">USD</span>
              </>
            )}
          </span>
        </div>

        <div>
          <label htmlFor="share-qty" className="mb-1.5 block font-mono text-[10px] tracking-widest text-muted-foreground">
            NUMBER OF SHARES
          </label>
          <input
            id="share-qty"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={sharesInput}
            onChange={(e) => onSharesChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-lg text-foreground tabular-nums placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-describedby="share-capacity"
          />
          <p id="share-capacity" className="mt-1 font-mono text-[10px] text-muted-foreground">
            Max {isSell ? 'sellable' : 'buyable'}: {capacity}
          </p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {PRESETS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                onClick={() => onSharesChange(String(Math.floor(capacity * ratio)))}
                className="rounded-sm border border-border bg-secondary py-1.5 font-mono text-[11px] font-medium text-muted-foreground transition-colors hover:border-input hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <dl className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 font-mono text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Share Price</dt>
            <dd className="text-foreground tabular-nums">{formatUSD(player.price)} / share</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Est. Platform Fee (0.50%)</dt>
            <dd className="text-foreground tabular-nums">{formatUSD(fee)}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
            <dt className="font-semibold text-foreground">
              {isBuy ? 'You Pay' : 'Net Proceeds'}
            </dt>
            <dd className={cn('text-base font-bold tabular-nums', isBuy ? 'text-gain' : 'text-loss')}>
              {formatUSD(isBuy ? cashNeeded : netProceeds)}
            </dd>
          </div>
        </dl>

        {locked && (
          <div role="alert" className="flex gap-2 rounded-md border border-lock/40 bg-lock/10 px-3 py-2.5 text-xs text-lock">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Trading is paused — player is {player.status}.</p>
          </div>
        )}

        {!locked && error && (
          <p role="alert" className="text-xs text-loss">{error}</p>
        )}

        <button
          type="button"
          onClick={onExecute}
          disabled={!canExecute}
          className={cn(
            'h-11 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40',
            isBuy ? 'bg-gain text-primary-foreground hover:bg-gain/90' : 'bg-loss text-white hover:bg-loss/90',
          )}
        >
          {isBuy ? 'Execute Buy Order' : 'Execute Sell Order'}
        </button>

        <div aria-live="polite" className="min-h-4">
          {notice && (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-gain">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
