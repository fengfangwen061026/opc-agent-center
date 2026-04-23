import { useState } from 'react'
import { Cable, KeyRound, TestTube2 } from 'lucide-react'
import { ConnectionBadge, GlassCard, LiquidButton } from '@opc/ui'
import {
  fetchBridge,
  getBridgeBaseUrl,
  getSessionToken,
  setBridgeBaseUrl,
  setSessionToken,
} from '@/lib/bridgeClient'
import { useSystemHealthStore } from '@/stores/systemHealthStore'

export function SettingsPage() {
  const { health, bridgeOnline, fetchHealth } = useSystemHealthStore()
  const [bridgeUrl, setBridgeUrl] = useState(getBridgeBaseUrl())
  const [mode, setMode] = useState(sessionStorage.getItem('opc.openclawMode') ?? 'mock')
  const [gatewayUrl, setGatewayUrl] = useState(sessionStorage.getItem('opc.gatewayUrl') ?? 'ws://127.0.0.1:18789')
  const [token, setToken] = useState(getSessionToken())
  const [testResult, setTestResult] = useState<string>('Not tested')

  const saveSessionSettings = () => {
    setBridgeBaseUrl(bridgeUrl)
    setSessionToken(token)
    sessionStorage.setItem('opc.openclawMode', mode)
    sessionStorage.setItem('opc.gatewayUrl', gatewayUrl)
  }

  const testConnection = async () => {
    saveSessionSettings()
    try {
      await fetchBridge('/api/health')
      await fetchHealth()
      setTestResult('Bridge reachable')
    } catch {
      setTestResult('Bridge offline, local mock fallback active')
    }
  }

  return (
    <div className="opc-page opc-settings-page">
      <GlassCard className="opc-settings-panel" variant="strong">
        <div>
          <p className="opc-eyebrow">Bridge</p>
          <h1 className="opc-page-title">Connection Settings</h1>
          <p className="opc-page-copy">Token is used for this browser session only and is not written to localStorage.</p>
        </div>
        <label>
          Bridge URL
          <input className="opc-field" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} />
        </label>
        <label>
          OpenClaw mode
          <select className="opc-field" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="mock">mock</option>
            <option value="live">live</option>
          </select>
        </label>
        {mode === 'live' ? (
          <label>
            Gateway URL
            <input className="opc-field" value={gatewayUrl} onChange={(event) => setGatewayUrl(event.target.value)} />
          </label>
        ) : null}
        <label>
          Session token
          <input
            className="opc-field"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Only for current session"
          />
        </label>
        <div className="opc-settings-actions">
          <LiquidButton icon={<KeyRound />} variant="ghost" onClick={saveSessionSettings}>
            Save Session
          </LiquidButton>
          <LiquidButton icon={<TestTube2 />} onClick={() => void testConnection()}>
            Test Connection
          </LiquidButton>
        </div>
        <p className="opc-page-copy">{testResult}</p>
      </GlassCard>

      <GlassCard className="opc-settings-panel" variant="strong">
        <div className="opc-rail-panel__header">
          <div>
            <p className="opc-eyebrow">Status</p>
            <h2 className="opc-section-title">Components</h2>
          </div>
          <Cable />
        </div>
        <div className="opc-status-grid">
          <ConnectionBadge label="Bridge" status={bridgeOnline ? 'connected' : 'disconnected'} />
          <ConnectionBadge label="Gateway" status={health.gateway.status} />
          <ConnectionBadge label="LanceDB" status={health.lancedb.status} />
          <ConnectionBadge label="Ollama" status={health.ollama.status} />
          <ConnectionBadge label="Obsidian" status={health.obsidian.status} />
          <ConnectionBadge label="Evolver" status={health.evolver.status} />
        </div>
      </GlassCard>
    </div>
  )
}
