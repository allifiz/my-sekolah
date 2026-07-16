"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; exact?: boolean };
type Group = { label: string; items: Item[] };

export function SidebarNav({ groups }: { groups: Group[] }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-groups" aria-label="Navigasi utama">
      {groups.map((group) => (
        <section className="sidebar-group" key={group.label}>
          <span className="sidebar-group-label">{group.label}</span>
          <div className="sidebar-group-links">
            {group.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={active ? "sidebar-link is-active" : "sidebar-link"} aria-current={active ? "page" : undefined}>
                  <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
