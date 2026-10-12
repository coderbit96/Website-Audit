"use client";

import { useSyncExternalStore } from "react";

const THEME_CHANGE_EVENT = "sitesignal-theme-change";

function subscribeToTheme(callback: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

function getThemeSnapshot(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function getServerThemeSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggleTheme(): void {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = nextTheme;
    localStorage.setItem("sitesignal-theme", nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      className="header-icon-button theme-toggle"
      type="button"
      aria-label={isDark ? "Use light color theme" : "Use dark color theme"}
      aria-pressed={isDark}
      data-tooltip={isDark ? "Use light theme" : "Use dark theme"}
      onClick={toggleTheme}
    >
      <svg className="theme-sun" aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className="theme-moon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />
      </svg>
    </button>
  );
}
