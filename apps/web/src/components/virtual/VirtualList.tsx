import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function VirtualList<T>({
  estimateSize = 72,
  items,
  renderItem,
}: {
  estimateSize?: number;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  if (items.length <= 100) {
    return (
      <div className="opc-virtual-list opc-virtual-list--static">
        {items.map((item) => renderItem(item))}
      </div>
    );
  }

  return (
    <div className="opc-virtual-list" ref={parentRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              left: 0,
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualItem.start}px)`,
              width: "100%",
            }}
          >
            {renderItem(items[virtualItem.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
