import { X } from 'lucide-react'
import { useState } from 'react'
import { useSystemHealthStore } from '@/stores/systemHealthStore'

export function OfflineBanner() {
  const { bridgeOnline } = useSystemHealthStore()
  const [dismissed, setDismissed] = useState(false)

  if (bridgeOnline || dismissed) {
    return null
  }

  return (
    <div className="opc-offline-banner">
      <span>Bridge 连接丢失，正在重连... (mock 模式)</span>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss offline banner">
        <X />
      </button>
    </div>
  )
}
