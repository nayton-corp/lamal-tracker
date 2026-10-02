import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  info: { box: "bg-info-soft text-info border-info/20", Icon: Info },
  danger: { box: "bg-increase-soft text-increase border-increase/30", Icon: AlertTriangle },
  lca: { box: "bg-lca-soft text-lca border-lca-strong/50", Icon: ShieldAlert },
  success: { box: "bg-saving-soft text-saving border-saving/30", Icon: CheckCircle2 },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "danger" || tone === "lca" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/90 [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}
