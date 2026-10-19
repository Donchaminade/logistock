"use client";
import Link from "next/link";
import { Bell, ChevronRight, User } from "lucide-react";
import { useApp } from "@/components/DataProvider";
import { BOTTOM, SIDEBAR } from "@/components/nav";
import { PageHeader } from "@/components/ui";

export default function Plus() {
  const { me } = useApp();
  const inBottom = new Set(BOTTOM[me.role].map((i) => i.href));
  const all = [...SIDEBAR[me.role].flatMap((g) => g.items), { href: "/notifications/", label: "Notifications", icon: Bell }, { href: "/profil/", label: "Profil, code PIN et démo", icon: User }];
  const items = all.filter((i, k) => !inBottom.has(i.href) && all.findIndex((x) => x.href === i.href) === k);
  return (
    <>
      <PageHeader title="Plus" />
      <ul className="card divide-y divide-line overflow-hidden">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex items-center gap-3.5 px-4 py-4 hover:bg-canvas">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><i.icon className="size-5" /></span>
              <span className="flex-1 text-[15px] font-semibold">{i.label}</span>
              <ChevronRight className="size-4 text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
