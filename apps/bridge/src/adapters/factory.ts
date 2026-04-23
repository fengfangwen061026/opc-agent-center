import type { BridgeEnv } from '../env'
import type { EvolverAdapter } from './EvolverAdapter'
import type { LanceDBAdapter, LanceDBConfig } from './LanceDBAdapter'
import { MockEvolverAdapter } from './MockEvolverAdapter'
import { MockLanceDBAdapter } from './MockLanceDBAdapter'
import { MockObsidianAdapter } from './MockObsidianAdapter'
import type { ObsidianAdapter } from './ObsidianAdapter'
import type { OpenClawAdapter } from './OpenClawAdapter'
import { MockOpenClawAdapter } from './MockOpenClawAdapter'
import { RealLanceDBAdapter } from './RealLanceDBAdapter'
import { RealEvolverAdapter } from './RealEvolverAdapter'
import { RealObsidianAdapter } from './RealObsidianAdapter'
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

function lanceConfig(env: BridgeEnv): LanceDBConfig {
  return {
    dbPath: env.lancedbPath,
    ollamaUrl: env.ollamaUrl,
    embeddingModel: env.embeddingModel,
    autoCapture: env.memoryAutoCapture,
    autoRecall: env.memoryAutoRecall,
  }
}

export async function createLanceDBAdapter(env: BridgeEnv): Promise<LanceDBAdapter> {
  const config = lanceConfig(env)

  if (env.lancedbMode === 'real') {
    const adapter = new RealLanceDBAdapter()
    await adapter.connect(config)
    if (adapter.isConnected()) {
      return adapter
    }

    console.warn('[bridge] LanceDB real adapter failed, falling back to mock')
    const mock = new MockLanceDBAdapter()
    await mock.connect(config)
    return mock
  }

  const mock = new MockLanceDBAdapter()
  await mock.connect(config)
  return mock
}

export async function createEvolverAdapter(env: BridgeEnv): Promise<EvolverAdapter> {
  if (env.mode === 'live') {
    const adapter = new RealEvolverAdapter({
      baseUrl: env.evolverApiUrl ?? 'http://127.0.0.1:18789',
      token: env.token,
    })

    try {
      await adapter.connect()
      console.log('[evolver] real adapter connected')
      return adapter
    } catch (error) {
      console.warn('[evolver] real adapter unreachable, falling back to mock', error)
    }
  }

  const mock = new MockEvolverAdapter()
  await mock.connect()
  return mock
}

export async function createObsidianAdapter(env: BridgeEnv): Promise<ObsidianAdapter> {
  const config = {
    apiUrl: env.obsidianApiUrl,
    apiKey: env.obsidianApiKey,
  }

  if (env.obsidianMode === 'real') {
    const adapter = new RealObsidianAdapter()
    await adapter.connect(config)
    if (adapter.isConnected()) {
      return adapter
    }

    console.warn('[bridge] Obsidian real adapter failed, falling back to mock')
    const mock = new MockObsidianAdapter()
    await mock.connect()
    return mock
  }

  const mock = new MockObsidianAdapter()
  await mock.connect()
  return mock
}
