import {
  conversationSchema,
  opcAgentSchema,
  opcEventSchema,
  opcMessageSchema,
  opcNotificationSchema,
  opcSkillSchema,
  systemHealthSchema,
  taskCapsuleSchema,
} from "@opc/core";
import agentsJson from "../../../../data/mock/agents.json";
import conversationsJson from "../../../../data/mock/conversations.json";
import eventsJson from "../../../../data/mock/events.json";
import notificationsJson from "../../../../data/mock/notifications.json";
import skillsJson from "../../../../data/mock/skills.json";
import systemHealthJson from "../../../../data/mock/system-health.json";
import tasksJson from "../../../../data/mock/tasks.json";

export const mockAgents = opcAgentSchema.array().parse(agentsJson);
export const mockSkills = opcSkillSchema.array().parse(skillsJson);
export const mockTasks = taskCapsuleSchema.array().parse(tasksJson);
export const mockNotifications = opcNotificationSchema.array().parse(notificationsJson);
export const mockEvents = opcEventSchema.array().parse(eventsJson);
export const mockSystemHealth = systemHealthSchema.parse(systemHealthJson);

export const mockConversationPayload = {
  conversations: conversationSchema.array().parse(conversationsJson.conversations),
  messages: opcMessageSchema.array().parse(conversationsJson.messages),
};
