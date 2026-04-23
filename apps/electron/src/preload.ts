// preload 脚本在 renderer 进程隔离环境中运行。
// 当前不暴露业务 API，后续如需原生能力再通过 contextBridge 增量加入。
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('opc', {
  version: process.env.npm_package_version ?? '0.1.0',
})
