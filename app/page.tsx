import { AuthGate } from '@/components/plx/auth-gate'
import { TradingDesk } from '@/components/plx/trading-desk'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <AuthGate>
      <TradingDesk />
    </AuthGate>
  )
}
