import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions";
import { formatDateFr } from "@/domain/calendar";
import { app } from "@/server/app";
import { Button, Card, EmptyState, PageHeader } from "@/ui/primitives";
import { cn } from "@/ui/cn";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  const ctx = app();
  const items = ctx.system.notifications(100);
  const unread = items.some((n) => !n.readAt);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Notifications"
        back="/"
        action={
          unread ? (
            <form action={markNotificationsReadAction}>
              <Button variant="ghost" className="min-h-10 px-3 text-sm">
                Tout marquer lu
              </Button>
            </form>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Rien pour l'instant">
          Tu seras prévenu ici (et par notification push si activée dans les réglages) quand les primes sortent et avant chaque échéance.
        </EmptyState>
      ) : (
        <Card className="p-0">
          <ul>
            {items.map((n) => {
              const content = (
                <div className="flex gap-3 px-4 py-3">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.readAt && "font-semibold")}>
                      {n.title}
                      {!n.readAt && <span className="sr-only"> (non lue)</span>}
                    </p>
                    <p className="text-sm text-muted">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDateFr(n.createdAt.slice(0, 10))}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-border last:border-b-0">
                  {n.url ? (
                    <Link href={n.url} className="block hover:bg-surface-2/50">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
