'use client'

import { TriangleAlert, Wallet } from 'lucide-react'
import { FEE_RATE, type Player, type ShortPosition, type TradeSide, formatUSD } from '@/lib/market-data'
import { cn } from '@/lib/utils'

type OrderTicketProps = {
  player: Player
  side: TradeSide
  onSideChange: (side: TradeSide) => void
  sharesInput: string
  onSharesChange: (value: string) => void
  leverage: number
  onLeverageChange: (lev: number) => void
  cash: number
  ownedShares: number
  shortPositions: ShortPosition[]
  onExecute: () => void
  notice: string | null
}

const PRESETS = [
  { label: '25%', ratio: 0.25 },
  { label: '50%', ratio: 0.5 },
  { label: '75%', ratio: 0.75 },
  { label: 'MAX', ratio: 1 },
]

const LEVERAGE_OPTIONS = [1, 2, 3, 5]

type SideConfig = { id: TradeSide; label: string; tabActive: string; execBtn: string }
const SIDE_TABS: SideConfig[] = [
  { id: 'BUY',   label: 'Buy',   tabActive: 'text-gain border-b-2 border-gain',          execBtn: 'bg-gain text-black hover:bg-gain/90' },
  { id: 'SELL',  label: 'Sell',  tabActive: 'text-loss border-b-2 border-loss',          execBtn: 'bg-loss text-white hover:bg-loss/90' },
  { id: 'SHORT', label: 'Short', tabActive: 'text-amber-400 border-b-2 border-amber-400', execBtn: 'bg-amber-500 text-black hover:bg-amber-500/90' },
  { id: 'COVER', label: 'Cover', tabActive: 'text-sky-400 border-b-2 border-sky-400',    execBtn: 'bg-sky-500 text-white hover:bg-sky-500/90' },
]

export function OrderTicket({
  player, side, onSideChange,
  sharesInput, onSharesChange,
  leverage, onLeverageChange,
  cash, ownedShares, shortPositions,
  onExecute, notice,
}: OrderTicketProps) {
  const isBuy   = side === 'BUY'
  const isSell  = side === 'SELL'
  const isShort = side === 'SHORT'
  const isCover = side === 'COVER'
  const locked  = player.status === 'injured' || player.status === 'suspended'

  const shares     = Number.parseInt(sharesInput, 10)
  const validShares = Number.isFinite(shares) && shares > 0 ? shares : 0
  const notional   = validShares * player.price
  const equity     = notional / leverage
  const borrowed   = notional - equity
  const fee        = notional * FEE_RATE
  const liqPrice   = leverage > 1 ? player.price * (1 - 1 / leverage) * 0.95 : 0
  const shortCollateral = isShort ? notional + fee : 0
  const coverCost       = isCover ? notional + fee : 0

  const maxBuyable   = Math.floor(cash / (player.price / leverage * (1 + FEE_RATE)))
  const maxShortable = Math.floor(cash / (player.price * (1 + FEE_RATE)))
  const coverable    = shortPositions.reduce((sum, sp) => sum + sp.shares, 0)

  let capacity = 0
  if (isBuy)   capacity = maxBuyable
  if (isSell)  capacity = ownedShares
  if (isShort) capacity = maxShortable
  if (isCover) capacity = coverable

  let error: string | null = null
  if (validShares > 0) {
    if (isBuy   && cash < equity + fee)       error = 'Insufficient cash.'
    if (isSell  && validShares > ownedShares) error = `You own ${ownedShares} share${ownedShares === 1 ? '' : 's'}.`
    if (isShort && cash < shortCollateral)    error = 'Insufficient cash for collateral.'
    if (isCover && validShares > coverable)   error = `You have ${coverable} shorted share${coverable === 1 ? '' : 's'}.`
  }

  const canExecute  = !locked && validShares > 0 && !error
  const activeTab   = SIDE_TABS.find(t => t.id === side)!

  return (
    <section className="flex flex-col rounded-lg border border-border bg-card" aria-labelledby="order-ticket-title">

      {/* Title row */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 id="order-ticket-title" className="font-mono text-[9px] font-semibold tracking-widest text-muted-foreground">
          ORDER TICKET
        </h2>
        <span className="font-mono text-[9px] text-muted-foreground">{player.tickerName}</span>
      </div>

      {/* Side tabs — underline style, not pill grid */}
      <div className="flex border-b border-border" role="tablist" aria-label="Order side">
        {SIDE_TABS.map(({ id, label, tabActive }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={side === id}
            onClick={() => onSideChange(id)}
            className={cn(
              'flex-1 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring',
              side === id ? tabActive : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 p-4">

        {/* Leverage — only BUY, segmented control style */}
        {isBuy && (
          <div>
            <p className="mb-1.5 font-mono text-[9px] tracking-widest text-muted-foreground">LEVERAGE</p>
            <div className="flex rounded-sm border border-border overflow-hidden">
              {LEVERAGE_OPTIONS.map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => onLeverageChange(lev)}
                  className={cn(
                    'flex-1 py-1.5 font-mono text-xs font-semibold border-r border-border last:border-r-0 transition-colors focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring',
                    leverage === lev
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground bg-transparent',
                  )}
                >
                  {lev === 1 ? '1×' : `${lev}×`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Available balance */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="size-3" aria-hidden="true" />
            {isSell ? 'Shares owned' : isCover ? 'Shorted' : 'Available'}
          </span>
          <span className="font-mono text-xs font-medium text-foreground tabular-nums">
            {isSell ? `${ownedShares} shares` : isCover ? `${coverable} shares` : formatUSD(cash)}
          </span>
        </div>

        {/* Shares input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="share-qty" className="font-mono text-[9px] tracking-widest text-muted-foreground">
              SHARES
            </label>
            <span id="share-capacity" className="font-mono text-[9px] text-muted-foreground">max {capacity}</span>
          </div>
          <input
            id="share-qty"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={sharesInput}
            onChange={(e) => onSharesChange(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            className="h-9 w-full rounded-sm border border-input bg-background px-3 font-mono text-sm text-foreground tabular-nums placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-describedby="share-capacity"
          />
          {/* Quick-fill — text buttons, no border boxes */}
          <div className="mt-1.5 flex gap-2">
            {PRESETS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                onClick={() => onSharesChange(String(Math.floor(capacity * ratio)))}
                className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary — clean key/value, no box */}
        <dl className="flex flex-col gap-1 font-mono text-xs border-t border-border pt-3">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Price</dt>
            <dd className="tabular-nums text-foreground">{formatUSD(player.price)}</dd>
          </div>
          {isBuy && leverage > 1 && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Notional</dt>
                <dd className="tabular-nums text-foreground">{formatUSD(notional)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Equity ({Math.round(100 / leverage)}%)</dt>
                <dd className="tabular-nums text-foreground">{formatUSD(equity)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Borrowed</dt>
                <dd className="tabular-nums text-amber-400">{formatUSD(borrowed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Liq. price</dt>
                <dd className="tabular-nums text-loss">{formatUSD(liqPrice)}</dd>
              </div>
            </>
          )}
          {isShort && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Liq. price</dt>
              <dd className="tabular-nums text-loss">{formatUSD(player.price * 1.5)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Fee (0.5%)</dt>
            <dd className="tabular-nums text-muted-foreground">{formatUSD(fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border mt-1 pt-2">
            <dt className="text-foreground font-medium text-[11px]">
              {isBuy && 'You pay'}{isSell && 'You receive'}{isShort && 'Collateral'}{isCover && 'You pay'}
            </dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">
              {isBuy   && formatUSD(equity + fee)}
              {isSell  && formatUSD(notional - fee)}
              {isShort && formatUSD(shortCollateral)}
              {isCover && formatUSD(coverCost)}
            </dd>
          </div>
        </dl>

        {locked && (
          <div role="alert" className="flex gap-2 rounded-sm border border-lock/20 bg-lock/5 px-3 py-2 text-xs text-lock">
            <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
            Player is {player.status} — trading paused.
          </div>
        )}

        {!locked && error && (
          <p role="alert" className="text-xs text-loss">{error}</p>
        )}

        {/* Execute — full width, solid, only colour that matters */}
        <button
          type="button"
          onClick={onExecute}
          disabled={!canExecute}
          className={cn(
            'h-9 w-full rounded-sm text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30',
            activeTab.execBtn,
          )}
        >
          {isBuy   && `Buy${leverage > 1 ? ` ${leverage}×` : ''}`}
          {isSell  && 'Sell'}
          {isShort && 'Open short'}
          {isCover && 'Cover short'}
        </button>

        <div aria-live="polite" className="min-h-4">
          {notice && (
            <p className={cn(
              'font-mono text-[10px]',
              notice.startsWith('Error') ? 'text-loss' : 'text-gain',
            )}>
              {notice}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

