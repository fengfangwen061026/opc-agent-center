import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { RotateCcw, Save, Sparkles } from 'lucide-react'
import { GlassCard, LiquidButton, StatusPill } from '@opc/ui'
import { useSkillStore } from '@/stores/skillStore'

const tabs = ['overview', 'config', 'history', 'evolution', 'eval'] as const
type SkillTab = (typeof tabs)[number]

function PatchDiff({ before, after }: { before?: string; after?: string }) {
  return (
    <div className="opc-diff-preview is-open">
      <div className="opc-diff-line is-remove">- {before ?? 'Previous content'}</div>
      <div className="opc-diff-line is-add">+ {after ?? 'Updated content'}</div>
    </div>
  )
}

export function SkillDetailPage() {
  const { name = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { selectedSkill, evalResult, evalRunning, fetchSkill, updateSkill, runEval, rollbackSkill } = useSkillStore()
  const initialTab = (searchParams.get('tab') as SkillTab | null) ?? 'overview'
  const [tab, setTab] = useState<SkillTab>(tabs.includes(initialTab) ? initialTab : 'overview')
  const configRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void fetchSkill(name)
  }, [fetchSkill, name])

  const successRate = useMemo(() => {
    if (!selectedSkill || selectedSkill.executionHistory.length === 0) return 0
    return selectedSkill.executionHistory.filter((record) => record.status === 'success').length / selectedSkill.executionHistory.length
  }, [selectedSkill])

  if (!selectedSkill) {
    return (
      <div className="opc-page">
        <GlassCard variant="strong">Loading skill...</GlassCard>
      </div>
    )
  }

  const editable = selectedSkill.status !== 'stable'

  return (
    <div className="opc-page opc-skill-detail-page">
      <GlassCard className="opc-skill-detail-header" variant="strong">
        <div>
          <p className="opc-eyebrow">Skill Center</p>
          <h1 className="opc-page-title">{selectedSkill.name}</h1>
          <p className="opc-page-copy">v{selectedSkill.version} · {selectedSkill.description}</p>
        </div>
        <StatusPill
          status={selectedSkill.status === 'stable' ? 'connected' : selectedSkill.status === 'experimental' ? 'running' : 'idle'}
          label={selectedSkill.status}
        />
      </GlassCard>

      <GlassCard className="opc-tab-row" variant="strong">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </GlassCard>

      <GlassCard className="opc-skill-detail-panel" variant="strong">
        {tab === 'overview' ? (
          <div className="opc-detail-stack">
            <div className="opc-detail-grid">
              <div>
                <span className="opc-detail-label">Author</span>
                <p className="opc-detail-value">{selectedSkill.author}</p>
              </div>
              <div>
                <span className="opc-detail-label">Risk</span>
                <p className="opc-detail-value">{selectedSkill.riskLevel}</p>
              </div>
              <div>
                <span className="opc-detail-label">Created</span>
                <p className="opc-detail-value">{new Date(selectedSkill.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="opc-detail-label">Updated</span>
                <p className="opc-detail-value">{new Date(selectedSkill.updatedAt).toLocaleString()}</p>
              </div>
            </div>
            <p className="opc-detail-copy">{selectedSkill.description}</p>
            <div className="opc-tag-list">
              {selectedSkill.tags.map((tag) => (
                <span key={tag} className="opc-inline-tag">
                  {tag}
                </span>
              ))}
            </div>
            <div>
              <span className="opc-detail-label">Dependencies</span>
              <div className="opc-tag-list">
                {selectedSkill.dependencies.map((dependency) => (
                  <span key={dependency} className="opc-inline-tag">
                    {dependency}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'config' ? (
          <div className="opc-detail-stack">
            {!editable ? <p className="opc-warning-copy">只读，需降级为 experimental 才能编辑。</p> : null}
            <textarea
              key={selectedSkill.id}
              ref={configRef}
              className="opc-config-editor"
              defaultValue={selectedSkill.configYaml}
              readOnly={!editable}
            />
            <LiquidButton
              icon={<Save />}
              disabled={!editable}
              onClick={() => void updateSkill(selectedSkill.id, configRef.current?.value ?? selectedSkill.configYaml)}
            >
              Save
            </LiquidButton>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="opc-detail-stack">
            <div>
              <span className="opc-detail-label">Success rate</span>
              <div className="opc-task-progress">
                <div className="opc-task-progress__bar" style={{ width: `${successRate * 100}%` }} />
              </div>
            </div>
            <div className="opc-detail-list">
              {selectedSkill.executionHistory.slice(0, 20).map((record) => (
                <details key={record.id} className="opc-history-record">
                  <summary>
                    {new Date(record.timestamp).toLocaleString()} · {record.source} · {record.durationMs}ms
                    <StatusPill status={record.status === 'success' ? 'connected' : 'error'} label={record.status} />
                  </summary>
                  <p>{record.error ?? 'Execution completed without error.'}</p>
                </details>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'evolution' ? (
          <div className="opc-detail-list">
            {selectedSkill.evolver.patches.map((patch) => (
              <GlassCard key={patch.id} className="opc-patch-record">
                <div className="opc-patch-record__header">
                  <div>
                    <strong>{patch.summary}</strong>
                    <small>{new Date(patch.createdAt).toLocaleString()} · {patch.type} · {patch.status}</small>
                  </div>
                  <StatusPill status={patch.status === 'pending' ? 'running' : patch.status === 'applied' ? 'connected' : 'disconnected'} label={patch.version ?? selectedSkill.version} />
                </div>
                <p>{patch.reason}</p>
                <p className="opc-detail-copy">Eval {patch.scoreBefore ?? '--'} → {patch.scoreAfter ?? '--'}</p>
                <PatchDiff before={patch.diff?.before} after={patch.diff?.after} />
                <LiquidButton
                  variant="ghost"
                  icon={<RotateCcw />}
                  onClick={() => {
                    if (window.confirm(`Rollback to ${patch.id}?`)) {
                      void rollbackSkill(selectedSkill.id, patch.id)
                    }
                  }}
                >
                  回滚
                </LiquidButton>
              </GlassCard>
            ))}
            {selectedSkill.evolver.patches.length === 0 ? <p className="opc-empty-copy">No Evolver patches yet.</p> : null}
          </div>
        ) : null}

        {tab === 'eval' ? (
          <div className="opc-detail-stack">
            <LiquidButton icon={<Sparkles />} onClick={() => void runEval(selectedSkill.id)} disabled={evalRunning}>
              {evalRunning ? 'Eval running...' : 'Run eval'}
            </LiquidButton>
            {evalRunning ? <div className="opc-eval-progress" /> : null}
            {evalResult ? (
              <div className="opc-detail-stack">
                <p className="opc-detail-value">Score {Math.round(evalResult.score * 100)}%</p>
                <p className="opc-detail-copy">{evalResult.judgeSummary}</p>
                <div className="opc-detail-list">
                  {evalResult.cases.map((testCase) => (
                    <div key={testCase.id} className="opc-detail-list-item">
                      <strong>{testCase.input}</strong>
                      <p>{testCase.judgeComment}</p>
                      <StatusPill status={testCase.passed ? 'connected' : 'error'} label={testCase.passed ? 'pass' : 'fail'} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>
    </div>
  )
}
