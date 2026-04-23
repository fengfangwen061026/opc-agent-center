import type { BridgeEnv } from '../env'
import type { EvolverAdapter } from './EvolverAdapter'
import type { LanceDBAdapter } from './LanceDBAdapter'
import { MockEvolverAdapter } from './MockEvolverAdapter'
import { MockLanceDBAdapter } from './MockLanceDBAdapter'
import type { OpenClawAdapter } from './OpenClawAdapter'
import { MockOpenClawAdapter } from './MockOpenClawAdapter'
import { WsOpenClawAdapter } from './WsOpenClawAdapter'

export function createOpenClawAdapter(env: BridgeEnv): OpenClawAdapter {
  if (env.mode === 'live') {
    return new WsOpenClawAdapter({
      gatewayUrl: env.gatewayUrl,
      deviceName: env.deviceName,
      token: env.token,
    })
  }

  return new MockOpenClawAdapter()
}

export function createLanceDBAdapter(): LanceDBAdapter {
  // TODO: Replace with a real embedded LanceDB adapter when @lancedb/lancedb and nomic-embed-text are available.
  return new MockLanceDBAdapter()
}

export function createEvolverAdapter(): EvolverAdapter {
  // TODO: Replace with an OpenClaw sub-agent backed adapter when the Evolver runtime API is available.
  return new MockEvolverAdapter()
}
