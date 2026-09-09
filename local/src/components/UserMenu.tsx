"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/local-data-client";

export default function UserMenu() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [label, setLabel] = useState("Account");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user?.email) {
        setLabel(user.email.split("@")[0] || "Local");
      }
    }

    loadUser();
  }, [supabase]);

  async function handleLogout() {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
    setIsLoading(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-8 max-w-36 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        <span className="truncate">{label}</span>
        <span className="text-xs text-zinc-500">{isOpen ? "^" : "v"}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 min-w-40 rounded-md border border-zinc-700 bg-black p-1.5 shadow-sm">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            {isLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
