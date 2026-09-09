"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/UserMenu";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/personal", label: "Personal" },
  { href: "/budgeting", label: "Budgeting" },
  { href: "/shared", label: "Shared" },
  { href: "/reconcile", label: "Reconcile" },
  { href: "/statements", label: "Statements" },
  { href: "/contacts", label: "People" },
  { href: "/groups", label: "Groups" },
  { href: "/settings", label: "Settings" }
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black/95 text-white backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 shadow-sm">
            <span className="relative block h-4 w-4">
              <span className="absolute left-0 top-0 h-4 w-1.5 rounded-full bg-white" />
              <span className="absolute right-0 top-0 h-4 w-1.5 rounded-full bg-zinc-500" />
            </span>
          </span>
          <span>SplitLens</span>
        </Link>

        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm text-zinc-400">
          {navLinks.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 leading-none transition ${
                  active
                    ? "bg-zinc-800 font-medium text-white"
                    : "hover:bg-zinc-900 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <UserMenu />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
