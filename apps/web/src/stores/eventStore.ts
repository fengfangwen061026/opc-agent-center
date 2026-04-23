import type { OpcEvent } from "@opc/core";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { mockEvents } from "../data/mock";

const MAX_EVENTS = 2000;

type EventStoreState = {
  events: OpcEvent[];
  pushEvent: (event: OpcEvent) => void;
  pushEvents: (events: OpcEvent[]) => void;
  clearEvents: () => void;
};

function trimEvents(events: OpcEvent[]): OpcEvent[] {
  return events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
}

export const useEventStore = create<EventStoreState>()(
  subscribeWithSelector((set) => ({
    events: trimEvents([...mockEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp))),
    pushEvent: (event) => set((state) => ({ events: trimEvents([...state.events, event]) })),
    pushEvents: (events) => set((state) => ({ events: trimEvents([...state.events, ...events]) })),
    clearEvents: () => set({ events: [] }),
  })),
);

export function subscribeToOpcEvents(
  type: string,
  handler: (events: OpcEvent[], previousEvents: OpcEvent[]) => void,
) {
  return useEventStore.subscribe(
    (state) => state.events.filter((event) => event.type === type),
    handler,
  );
}

export const opcEventStore = {
  subscribe: subscribeToOpcEvents,
  getSnapshot: () => useEventStore.getState().events,
};

export const eventStoreLimits = {
  maxEvents: MAX_EVENTS,
};
