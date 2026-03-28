import "../globals.css";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="flex min-h-screen items-center justify-center px-4">{children}</main>;
}
