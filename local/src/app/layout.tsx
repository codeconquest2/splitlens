import AppHeader from "@/components/AppHeader";
import UnlockGate from "@/components/UnlockGate";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SplitLens",
  description: "Expense tracker for personal and shared spending"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="theme-light">
        <div className="min-h-screen bg-gray-50">
          <AppHeader />
          <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
          <UnlockGate />
        </div>
      </body>
    </html>
  );
}
