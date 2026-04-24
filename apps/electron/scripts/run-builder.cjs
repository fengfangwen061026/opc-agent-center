/* eslint-disable @typescript-eslint/no-require-imports */

const { spawnSync } = require('node:child_process')
const { existsSync, realpathSync, renameSync } = require('node:fs')
const { homedir } = require('node:os')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const nodeModules = path.join(appRoot, 'node_modules')
const hiddenNodeModules = path.join(appRoot, '.node_modules-electron-pack')
const builderCli = path.join(realpathSync(path.join(
  appRoot,
  'node_modules',
  'electron-builder',
)), 'cli.js')

let moved = false

function electronVersionArgs(args) {
  if (args.some((arg) => arg.includes('electronVersion'))) {
    return args
  }

  const fallbackVersion = '40.8.3'
  const fallbackZip = path.join(
    homedir(),
    '.cache',
    'electron',
    `electron-v${fallbackVersion}-linux-x64.zip`,
  )

  if (process.platform === 'linux' && process.arch === 'x64' && existsSync(fallbackZip)) {
    return [...args, `-c.electronVersion=${fallbackVersion}`]
  }

  return args
}

try {
  if (existsSync(nodeModules)) {
    renameSync(nodeModules, hiddenNodeModules)
    moved = true
  }

  const result = spawnSync(process.execPath, [builderCli, ...electronVersionArgs(process.argv.slice(2))], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
    },
    stdio: 'inherit',
  })

  process.exitCode = result.status ?? 1
} finally {
  if (moved) {
    renameSync(hiddenNodeModules, nodeModules)
  }
}
