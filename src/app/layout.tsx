import Link from "next/link";
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
      <body>
        <div className="min-h-screen bg-gray-50">
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/dashboard" className="text-xl font-semibold text-black">
                SplitLens
              </Link>
              <nav className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
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
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
