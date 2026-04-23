import { create } from "zustand";

type ChatStoreState = {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string) => void;
};

export const useChatStore = create<ChatStoreState>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
}));
