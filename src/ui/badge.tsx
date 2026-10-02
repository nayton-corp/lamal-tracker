import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const badge = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted",
      primary: "bg-primary-soft text-primary",
      saving: "bg-saving-soft text-saving",
      increase: "bg-increase-soft text-increase",
      lca: "bg-lca-soft text-lca",
      info: "bg-info-soft text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
