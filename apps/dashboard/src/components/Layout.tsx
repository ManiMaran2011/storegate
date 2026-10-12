import { Activity, KeyRound, LogOut, MessageSquare, Moon, Plug, ScrollText, Server, Sun, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cx } from "./ui";

const nav: { to: string; label: string; icon: LucideIcon; admin?: boolean }[] = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/chat", label: "Assistant", icon: MessageSquare },
  { to: "/servers", label: "Servers", icon: Server },
  { to: "/keys", label: "API keys", icon: KeyRound },
  { to: "/connect", label: "Connect a client", icon: Plug },
  { to: "/audit", label: "Audit log", icon: ScrollText },
  { to: "/team", label: "Team", icon: Users, admin: true },
];

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const set = document.documentElement.dataset.theme;
    return set === "dark" || (!set && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  });
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sg-theme", next);
    } catch {
      /* storage can be unavailable; the choice then lasts for this tab only */
    }
    setTheme(next);
  };
  return { theme, toggle };
}

export function Layout() {
  const { me, logout } = useAuth();
  const { theme, toggle } = useTheme();
  if (!me) return null;
  const items = nav.filter((n) => !n.admin || me.user.role === "admin");
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="flex flex-col gap-1 border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r md:p-4">
        <div className="mb-2 flex items-center gap-2 px-2 py-1 md:mb-6">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-accent-ink" aria-hidden>
            <svg viewBox="0 0 16 16" className="size-4" fill="currentColor"><path d="M2 11V3h2v8zm4-8h2v8H6zm4 3h2v5h-2z" /></svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">Storegate</span>
          <span className="ml-auto flex md:hidden">
            <button onClick={toggle} className="rounded-md p-2 text-muted hover:text-ink" aria-label="Switch theme">{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
            <button onClick={() => void logout()} className="rounded-md p-2 text-muted hover:text-ink" aria-label="Sign out"><LogOut className="size-4" /></button>
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Main">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cx("flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition", isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-raised hover:text-ink")
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-2 border-t border-line pt-3 md:block">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{me.user.name}</p>
            <p className="truncate text-xs text-muted">{me.user.email} · {me.user.role}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={toggle} className="flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              Theme
            </button>
            <button onClick={() => void logout()} className="flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
