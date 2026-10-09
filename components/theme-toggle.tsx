"use client";

import { useState } from "react";

export default function ThemeToggle({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [theme, setTheme] = useState(initialTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = nextTheme;
    document.cookie = `arcus-theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setTheme(nextTheme);
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.7 8.7 0 1 0 10.7 10.7Z" />}
    </svg>
  </button>;
}
