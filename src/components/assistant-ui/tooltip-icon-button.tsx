import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip?: string;
  size?: "default" | "icon";
  variant?: "default" | "ghost" | "outline";
};

export function TooltipIconButton({
  className,
  tooltip,
  size = "icon",
  variant = "ghost",
  type = "button",
  ...props
}: TooltipIconButtonProps) {
  return (
    <button
      type={type}
      title={tooltip}
      aria-label={props["aria-label"] ?? tooltip}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        size === "icon" ? "size-8" : "h-8 px-2",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "outline" && "border border-border bg-background hover:bg-accent",
        variant === "ghost" && "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
