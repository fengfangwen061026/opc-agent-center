import type {
  Agent,
  Conversation,
  Notification,
  NotificationFilter,
  SendMessageInput,
  Skill,
  SkillDetail,
  SkillEvalResult,
  SkillUpdateInput,
  SystemEvent,
  SystemHealth,
  Task,
} from '@opc/core'

export interface OpenClawAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<SystemHealth>
  listAgents(): Promise<Agent[]>
  listTasks(limit?: number): Promise<Task[]>
  listSkills(): Promise<Skill[]>
  getSkill(nameOrId: string): Promise<SkillDetail | undefined>
  updateSkill(nameOrId: string, input: SkillUpdateInput): Promise<SkillDetail>
  evalSkill(nameOrId: string): Promise<SkillEvalResult>
  approveSkillPatch(nameOrId: string): Promise<void>
  rejectSkillPatch(nameOrId: string): Promise<void>
  rollbackSkill(nameOrId: string, patchId?: string): Promise<void>
  listNotifications(filter?: NotificationFilter): Promise<Notification[]>
  actionNotification(id: string, action: string): Promise<void>
  listConversations(): Promise<Conversation[]>
  sendMessage(input: SendMessageInput): Promise<void>
  subscribe(handler: (event: SystemEvent) => void): () => void
}
