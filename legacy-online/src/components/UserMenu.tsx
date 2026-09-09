"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

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
        setLabel(user.email);
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
        className="flex max-w-52 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        <span className="truncate">{label}</span>
        <span className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 hover:text-black"
          >
            {isLoading ? "Logging out..." : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
