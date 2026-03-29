import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SplitLens",
  description: "Expense tracker for personal and shared spending"
};

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/personal", label: "Personal" },
  { href: "/budgeting", label: "Budgeting" },
  { href: "/shared", label: "Shared" },
  { href: "/contacts", label: "People" },
  { href: "/statements", label: "Statements" },
  { href: "/groups", label: "Groups" }
];

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="theme-light">
        <div className="min-h-screen bg-gray-50">
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
              <Link href="/dashboard" className="flex items-center gap-3 text-xl font-semibold text-black">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
                  <span className="relative block h-5 w-5">
                    <span className="absolute left-0 top-0 h-5 w-2 rounded-full bg-white" />
                    <span className="absolute right-0 top-0 h-5 w-2 rounded-full bg-black/20" />
                  </span>
                </span>
                <span>SplitLens</span>
              </Link>
              <div className="flex flex-wrap items-center gap-3">
                <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-lg px-3 py-2 transition hover:bg-gray-100 hover:text-black"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <UserMenu />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
