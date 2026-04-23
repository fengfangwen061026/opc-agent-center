import type { BridgeEnv } from '../env'
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
