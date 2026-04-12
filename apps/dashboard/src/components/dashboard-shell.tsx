"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Chat" },
  { href: "/tasks", label: "Tasks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/memory", label: "Memory" },
  { href: "/personas", label: "Personas" },
  { href: "/skills", label: "Skills" },
  { href: "/usage", label: "Usage" },
  { href: "/replays", label: "Replays" },
  { href: "/evals", label: "Evals" },
  { href: "/prompts", label: "Prompts" },
  { href: "/improvement", label: "Improvement" },
];

export function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span>Local Control Plane</span>
          <strong>SecretaryOS</strong>
        </div>
        <nav className="dashboard-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-active={pathname === item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
