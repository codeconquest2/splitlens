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
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black transition hover:border-indigo-600"
    >
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
