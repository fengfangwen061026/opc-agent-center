import type { ChildProcess } from 'node:child_process'
import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { app } from 'electron'

const requireFromElectron = createRequire(__filename)

interface BridgeLaunchTarget {
  modulePath: string
  args: string[]
  cwd: string
}

export class BridgeProcess {
  private child: ChildProcess | null = null
  private port = 3001
  private restartCount = 0
  private stopping = false
  private attachedToExternalBridge = false
  private lastEnv: NodeJS.ProcessEnv | undefined

  start(env?: NodeJS.ProcessEnv): void {
    if (this.isRunning()) {
      return
    }

    this.lastEnv = env
    this.stopping = false
    this.restartCount = 0

    void this.bridgeReady().then((ready) => {
      if (this.stopping || this.isRunning()) {
        return
      }

      if (ready) {
        this.attachedToExternalBridge = true
        console.log('[electron] Bridge already running; using existing process')
        return
      }

      this.spawnBridge(env)
    })
  }

  stop(): void {
    this.stopping = true
    this.attachedToExternalBridge = false
    this.restartCount = 0

    const child = this.child
    this.child = null

    if (child && child.exitCode === null && !child.killed) {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      }, 3000)
      child.once('exit', () => clearTimeout(killTimer))
    }
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  isRunning(): boolean {
    return this.attachedToExternalBridge || Boolean(this.child && !this.child.killed)
  }

  private spawnBridge(env?: NodeJS.ProcessEnv): void {
    const target = this.resolveLaunchTarget()
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      OPENCLAW_MODE: env?.OPENCLAW_MODE ?? process.env.OPENCLAW_MODE ?? 'live',
      LANCEDB_MODE: env?.LANCEDB_MODE ?? process.env.LANCEDB_MODE ?? 'real',
      BRIDGE_PORT: String(this.port),
    }

    if (app.isPackaged) {
      childEnv.OPC_MOCK_ROOT = path.join(process.resourcesPath, 'data', 'mock')
    }

    console.log('[electron] starting Bridge', {
      modulePath: target.modulePath,
      cwd: target.cwd,
      packaged: app.isPackaged,
    })

    const child = fork(target.modulePath, target.args, {
      cwd: target.cwd,
      env: childEnv,
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })

    this.child = child

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(`[bridge] ${chunk}`)
    })
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(`[bridge] ${chunk}`)
    })
    child.on('exit', (code, signal) => {
      this.child = null
      if (this.stopping) {
        return
      }

      console.warn('[electron] Bridge exited', { code, signal })
      if (this.restartCount >= 3) {
        console.error('[electron] Bridge restart limit reached')
        return
      }

      this.restartCount += 1
      setTimeout(() => {
        if (!this.stopping) {
          this.spawnBridge(this.lastEnv)
        }
      }, 5000)
    })
  }

  private resolveLaunchTarget(): BridgeLaunchTarget {
    if (app.isPackaged) {
      const bridgeDir = path.join(process.resourcesPath, 'bridge')
      return {
        modulePath: path.join(bridgeDir, 'index.js'),
        args: [],
        cwd: bridgeDir,
      }
    }

    const repoRoot = path.resolve(__dirname, '../../..')
    const bridgeDir = path.join(repoRoot, 'apps', 'bridge')
    return {
      modulePath: requireFromElectron.resolve('tsx/cli', { paths: [bridgeDir] }),
      args: [path.join(bridgeDir, 'src', 'index.ts')],
      cwd: bridgeDir,
    }
  }

  private async bridgeReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getUrl()}/api/health`, {
        signal: AbortSignal.timeout(600),
      })
      return response.ok
    } catch {
      return false
    }
  }
}
