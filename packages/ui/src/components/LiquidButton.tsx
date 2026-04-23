import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

type LiquidButtonVariant = "primary" | "secondary" | "ghost";

export type LiquidButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: LiquidButtonVariant;
};

export function LiquidButton({
  children,
  className,
  icon,
  type = "button",
  variant = "primary",
  ...props
}: LiquidButtonProps) {
  return (
    <button
      className={cn("opc-liquid-button", `opc-liquid-button--${variant}`, className)}
      type={type}
      {...props}
    >
      {icon ? <span className="opc-liquid-button__icon">{icon}</span> : null}
      <span className="opc-liquid-button__label">{children}</span>
    </button>
  );
}
