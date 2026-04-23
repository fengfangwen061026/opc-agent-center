import type { SystemHealth } from "@opc/core";
import { create } from "zustand";
import { mockSystemHealth } from "../data/mock";

type SystemHealthStoreState = {
  health: SystemHealth;
  setHealth: (health: SystemHealth) => void;
};

export const useSystemHealthStore = create<SystemHealthStoreState>((set) => ({
  health: mockSystemHealth,
  setHealth: (health) => set({ health }),
}));
