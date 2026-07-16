"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function ResponsiveSidebar({ children, label = "Buka navigasi" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button className="mobile-menu-button" type="button" onClick={() => setOpen(true)} aria-label={label} aria-expanded={open}>
        <span aria-hidden="true">☰</span><span>Menu</span>
      </button>
      {open ? <button className="sidebar-backdrop" type="button" aria-label="Tutup navigasi" onClick={() => setOpen(false)} /> : null}
      <aside className={open ? "admin-sidebar is-open" : "admin-sidebar"}>{children}</aside>
    </>
  );
}
