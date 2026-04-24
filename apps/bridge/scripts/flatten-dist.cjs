/* eslint-disable @typescript-eslint/no-require-imports */

const { cpSync, existsSync, rmSync } = require('node:fs')
const path = require('node:path')

const distRoot = path.resolve(__dirname, '..', 'dist')
const compiledSrc = path.join(distRoot, 'apps', 'bridge', 'src')

if (!existsSync(compiledSrc)) {
  process.exit(0)
}

cpSync(compiledSrc, distRoot, {
  recursive: true,
  force: true,
  filter: (source) => !source.includes(`${path.sep}__tests__${path.sep}`),
})

rmSync(path.join(distRoot, 'apps'), { recursive: true, force: true })
rmSync(path.join(distRoot, 'packages'), { recursive: true, force: true })
