import { useMemo, useState } from 'react'
import type { Task } from '@opc/core'
import { Copy, Download } from 'lucide-react'
import { LiquidButton, StatusPill } from '@opc/ui'
import { DetailDrawer } from '@/components/DetailDrawer'

interface TaskCapsuleDrawerProps {
  task?: Task
  onClose: () => void
}

const tabs = ['overview', 'logs', 'skills', 'evolver'] as const
type CapsuleTab = (typeof tabs)[number]

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function capsuleMarkdown(task: Task) {
  return `# ${task.title}

- Agent: ${task.agentId}
- Status: ${task.status}
- Priority: ${task.priority}

## Goal
${task.capsule.goal}

## Plan
${task.capsule.plan.map((step) => `- ${step}`).join('\n')}

## Outputs
${task.capsule.outputs.map((output) => `- ${output}`).join('\n') || '- No outputs yet'}
`
}

export function TaskCapsuleDrawer({ task, onClose }: TaskCapsuleDrawerProps) {
  const [tab, setTab] = useState<CapsuleTab>('overview')
  const json = useMemo(() => (task ? JSON.stringify(task, null, 2) : ''), [task])

  return (
    <DetailDrawer open={Boolean(task)} title={task?.title ?? ''} subtitle="Task Capsule" onClose={onClose} wide>
      {task ? (
        <div className="opc-detail-stack">
          <div className="opc-tab-row">
            {tabs.map((item) => (
              <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>
                {item}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div className="opc-detail-stack">
              <div className="opc-detail-grid">
                <div>
                  <span className="opc-detail-label">Agent</span>
                  <p className="opc-detail-value">{task.agentId}</p>
                </div>
                <div>
                  <span className="opc-detail-label">Status</span>
                  <StatusPill status={task.status === 'running' ? 'running' : task.status === 'completed' ? 'connected' : task.status === 'failed' ? 'error' : task.status === 'blocked' ? 'disconnected' : 'idle'} label={task.status} />
                </div>
                <div>
                  <span className="opc-detail-label">Created</span>
                  <p className="opc-detail-value">{new Date(task.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="opc-detail-label">Progress</span>
                  <p className="opc-detail-value">{task.progress}%</p>
                </div>
              </div>
              <div>
                <span className="opc-detail-label">Goal</span>
                <p className="opc-detail-copy">{task.capsule.goal}</p>
              </div>
              <div>
                <span className="opc-detail-label">Inputs / Outputs</span>
                <pre className="opc-code-preview">{JSON.stringify({ inputs: task.capsule.inputs, outputs: task.capsule.outputs }, null, 2)}</pre>
              </div>
            </div>
          ) : null}

          {tab === 'logs' ? (
            <div className="opc-detail-list">
              {task.capsule.executionLog.map((log) => (
                <div key={log.id} className="opc-detail-list-item">
                  <div className="opc-detail-list-title">{log.step}</div>
                  <div className="opc-detail-list-copy">{log.result}</div>
                  <small>{log.tool ?? 'agent'} · {log.durationMs}ms</small>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'skills' ? (
            <div className="opc-detail-list">
              {task.capsule.skillCalls.map((skillCall) => (
                <div key={`${skillCall.skillId}-${skillCall.durationMs}`} className="opc-detail-list-item">
                  <div className="opc-detail-list-title">{skillCall.skillId}</div>
                  <div className="opc-detail-list-copy">{skillCall.summary}</div>
                  <StatusPill status={skillCall.status === 'success' ? 'connected' : 'error'} label={skillCall.status} />
                </div>
              ))}
              {task.capsule.skillCalls.length === 0 ? <p className="opc-empty-copy">No skill calls recorded.</p> : null}
            </div>
          ) : null}

          {tab === 'evolver' ? (
            <div>
              {task.capsule.evolverAnalysis ? (
                <div className="opc-detail-stack">
                  <p className="opc-detail-value">Quality score {Math.round(task.capsule.evolverAnalysis.score * 100)}%</p>
                  <div className="opc-detail-list">
                    {task.capsule.evolverAnalysis.suggestions.map((suggestion) => (
                      <div key={suggestion} className="opc-detail-list-item">
                        {suggestion}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="opc-empty-copy">No Evolver analysis for this task.</p>
              )}
            </div>
          ) : null}

          <div className="opc-drawer-actions">
            <LiquidButton
              variant="ghost"
              icon={<Copy />}
              onClick={() => void navigator.clipboard.writeText(json)}
            >
              复制 JSON
            </LiquidButton>
            <LiquidButton
              variant="ghost"
              icon={<Download />}
              onClick={() => downloadText(`${task.id}.json`, json, 'application/json')}
            >
              导出 JSON
            </LiquidButton>
            <LiquidButton
              icon={<Download />}
              onClick={() => downloadText(`${task.id}.md`, capsuleMarkdown(task), 'text/markdown')}
            >
              导出 Markdown
            </LiquidButton>
          </div>
        </div>
      ) : null}
    </DetailDrawer>
  )
}
