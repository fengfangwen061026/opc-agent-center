import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { GlassCard, StatusPill } from '@opc/ui'
import { useNotificationStore } from '@/stores/notificationStore'
import { useSkillStore } from '@/stores/skillStore'

type StatusFilter = 'all' | 'stable' | 'experimental' | 'draft'
type SortKey = 'name' | 'quality' | 'recent'

function scoreColor(score: number) {
  if (score > 0.8) return 'var(--opc-success)'
  if (score >= 0.5) return 'var(--opc-warning)'
  return 'var(--opc-danger)'
}

export function SkillCenterPage() {
  const { skills } = useSkillStore()
  const { notifications } = useNotificationStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('quality')
  const [tag, setTag] = useState('all')

  const tags = useMemo(() => Array.from(new Set(skills.flatMap((skill) => skill.tags))).sort(), [skills])
  const pendingBySkill = useMemo(
    () =>
      Object.fromEntries(
        skills.map((skill) => [
          skill.id,
          notifications.filter((item) => item.type === 'skill_patch_pending' && item.skillId === skill.id).length,
        ]),
      ),
    [notifications, skills],
  )

  const filtered = useMemo(() => {
    return skills
      .filter((skill) => skill.name.toLowerCase().includes(query.toLowerCase()))
      .filter((skill) => status === 'all' || skill.status === status)
      .filter((skill) => tag === 'all' || skill.tags.includes(tag))
      .sort((left, right) => {
        if (sort === 'name') return left.name.localeCompare(right.name)
        if (sort === 'recent') return (right.lastRunAt ?? '').localeCompare(left.lastRunAt ?? '')
        return right.evolver.score - left.evolver.score
      })
  }, [query, skills, sort, status, tag])

  return (
    <div className="opc-page opc-skills-page">
      <GlassCard className="opc-skill-toolbar" variant="strong">
        <div className="opc-toolbar-search">
          <Search />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" />
        </div>
        <label>
          状态
          <select className="opc-field" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="all">all</option>
            <option value="stable">stable</option>
            <option value="experimental">experimental</option>
            <option value="draft">draft</option>
          </select>
        </label>
        <label>
          标签
          <select className="opc-field" value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">all</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          排序
          <select className="opc-field" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="quality">质量分</option>
            <option value="name">名称</option>
            <option value="recent">最近更新</option>
          </select>
        </label>
        <SlidersHorizontal />
      </GlassCard>

      <section className="opc-skill-grid">
        {filtered.map((skill) => {
          const pending = pendingBySkill[skill.id] ?? 0
          const circumference = 2 * Math.PI * 24

          return (
            <Link key={skill.id} to={`/skills/${encodeURIComponent(skill.id)}`} className="opc-skill-card-link">
              <GlassCard className="opc-skill-card" variant="strong" interactive>
                <div className="opc-skill-card__header">
                  <div>
                    <h2>{skill.name}</h2>
                    <StatusPill
                      status={skill.status === 'stable' ? 'connected' : skill.status === 'experimental' ? 'running' : 'idle'}
                      label={skill.status}
                    />
                  </div>
                  <div className="opc-score-ring" style={{ '--score-color': scoreColor(skill.evolver.score) } as CSSProperties}>
                    <svg viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="24" />
                      <circle
                        cx="32"
                        cy="32"
                        r="24"
                        style={{
                          strokeDasharray: circumference,
                          strokeDashoffset: circumference * (1 - skill.evolver.score),
                        }}
                      />
                    </svg>
                    <span>{Math.round(skill.evolver.score * 100)}</span>
                  </div>
                </div>
                <p>{skill.description}</p>
                <div className="opc-tag-list">
                  {skill.tags.slice(0, 4).map((item) => (
                    <span key={item} className="opc-inline-tag">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="opc-skill-card__footer">
                  <span>{skill.lastRunAt ? new Date(skill.lastRunAt).toLocaleString() : 'No recent run'}</span>
                  {pending > 0 ? <span className="opc-patch-badge">{pending} patch</span> : null}
                </div>
              </GlassCard>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
