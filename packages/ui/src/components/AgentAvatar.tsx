import type { CSSProperties, HTMLAttributes } from 'react'
import { BookOpen, Brain, Code2, Cpu, Sparkles, Terminal, Zap } from 'lucide-react'
import { cx } from './utils'

export type AgentAvatarType =
  | 'conductor'
  | 'evolver'
  | 'codex'
  | 'claude-code'
  | 'knowledge'
  | 'skill'
  | 'memory'

export interface AgentAvatarProps extends HTMLAttributes<HTMLDivElement> {
  type: AgentAvatarType
  label?: string
  accentColor?: string
  size?: 'sm' | 'md' | 'lg'
}

const icons = {
  conductor: Cpu,
  evolver: Sparkles,
  codex: Code2,
  'claude-code': Terminal,
  knowledge: BookOpen,
  skill: Zap,
  memory: Brain,
} satisfies Record<AgentAvatarType, typeof Cpu>

export function AgentAvatar({
  className,
  type,
  label,
  accentColor = 'var(--opc-sky)',
  size = 'md',
  style,
  ...props
}: AgentAvatarProps) {
  const Icon = icons[type]

  return (
    <div
      className={cx('opc-agent-avatar', `opc-agent-avatar--${size}`, className)}
      style={{ '--opc-agent-accent': accentColor, ...style } as CSSProperties}
      aria-label={label ?? type}
      {...props}
    >
      <Icon aria-hidden="true" />
    </div>
  )
}
