"use client";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { forMe, useApp } from "@/components/DataProvider";
import { nameOf } from "@/components/domain";
import { Button, cx, Empty, PageHeader } from "@/components/ui";
import { relative } from "@/lib/format";
import { markAllRead } from "@/services/actions";

export default function Notifications() {
  const { db, me, run } = useApp();
  const list = db.notifications.filter((n) => forMe(n, me)).sort((a, b) => b.at.localeCompare(a.at));
  const unread = list.filter((n) => !n.readBy.includes(me.id));
  return (
    <>
      <PageHeader title="Notifications" sub={unread.length ? `${unread.length} non lue${unread.length > 1 ? "s" : ""}` : "Tout est lu."}
        actions={unread.length > 0 && <Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => run(() => markAllRead(me, unread.map((n) => n.id)), "Notifications marquées comme lues")}>Tout marquer comme lu</Button>} />
      {list.length === 0 ? <Empty icon={<Bell className="size-5" />} title="Aucune notification" /> : (
        <ul className="card divide-y divide-line overflow-hidden" data-testid="notif-list">
          {list.map((n) => {
            const isUnread = !n.readBy.includes(me.id);
            const body = (
              <div className={cx("flex gap-3.5 px-4 py-4 transition-colors sm:px-5", n.link && "hover:bg-canvas")}>
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", isUnread ? "bg-brand-600" : "bg-line-2")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cx("text-[14px]", isUnread ? "font-bold" : "font-semibold")}>{n.title}</span>
                    <span className="shrink-0 text-[12px] text-subtle">{relative(n.at)}</span>
                  </div>
                  <p className="num mt-0.5 text-[13.5px] leading-relaxed text-muted">{n.body}</p>
                  <p className="mt-1 text-[12px] text-subtle">{n.by === "system" ? "Alerte automatique" : `Par ${nameOf(db, n.by)}`}</p>
                </div>
              </div>
            );
            return <li key={n.id} onClick={() => isUnread && void markAllRead(me, [n.id])}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </>
  );
}
