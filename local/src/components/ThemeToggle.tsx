"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedTheme = (window.localStorage.getItem("splitlens-theme") as ThemeMode | null) ?? "light";
    setTheme(savedTheme);
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(savedTheme === "dark" ? "theme-dark" : "theme-light");
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    window.localStorage.setItem("splitlens-theme", nextTheme);
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(nextTheme === "dark" ? "theme-dark" : "theme-light");
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
    >
      {theme === "light" ? "D" : "L"}
    </button>
  );
}
