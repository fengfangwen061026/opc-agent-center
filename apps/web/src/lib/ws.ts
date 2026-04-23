import type { OpcEvent as CoreOpcEvent } from "@opc/core";
import type { OpcEvent as StandardOpcEvent } from "@opc/shared";
import { useEffect } from "react";
import { bridgeBaseUrl } from "./api";
import { useEventStore } from "../stores/eventStore";

export function useBridgeEvents() {
  const pushEvent = useEventStore((state) => state.pushEvent);

  useEffect(() => {
    let closed = false;
    let retryMs = 1000;
    let source: EventSource | null = null;
    let timer: number | undefined;

    const connect = () => {
      source = new EventSource(`${bridgeBaseUrl}/api/events/stream`);
      source.onmessage = (message) => {
        const parsed = JSON.parse(message.data) as StandardOpcEvent;
        pushEvent(standardToCoreEvent(parsed));
      };
      source.onopen = () => {
        retryMs = 1000;
      };
      source.onerror = () => {
        source?.close();
        if (closed) return;
        timer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      source?.close();
    };
  }, [pushEvent]);
}

function standardToCoreEvent(event: StandardOpcEvent): CoreOpcEvent {
  return {
    id: event.id,
    timestamp: event.ts,
    source: event.source === "openclaw" ? "gateway" : event.source === "web" ? "ui" : "bridge",
    type: event.type,
    payload: event.payload,
  };
}
