import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../utils";

type GlassCardProps<T extends ElementType> = {
  as?: T;
  interactive?: boolean;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children">;

export function GlassCard<T extends ElementType = "section">({
  as,
  className,
  interactive = false,
  children,
  ...props
}: GlassCardProps<T>) {
  const Component = as ?? "section";

  return (
    <Component
      className={cn("opc-glass-card opc-card", interactive && "opc-card--interactive", className)}
      {...props}
    >
      <div className="opc-card__content">{children}</div>
    </Component>
  );
}
