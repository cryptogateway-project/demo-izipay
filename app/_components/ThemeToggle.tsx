"use client";

import { useEffect, useState } from "react";

const KEY = "izishop.theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  // Lit le thème réellement appliqué (posé par le script anti-flash) après montage.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lit le thème appliqué par le script anti-flash, au montage
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      title={isDark ? "Thème clair" : "Thème sombre"}
      className="grid size-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] dark:hover:bg-white/10"
    >
      {/* Évite tout mismatch d'hydratation : rien tant que le thème n'est pas connu. */}
      <span className="text-base leading-none" suppressHydrationWarning>
        {theme === null ? "" : isDark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
