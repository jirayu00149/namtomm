"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Drone,
  Menu,
  Radio,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { type DashboardView, FloodDashboard } from "@/components/flood-dashboard";

const navItems: Array<{
  label: string;
  view: DashboardView;
  icon: LucideIcon;
}> = [
  { label: "Overview", view: "overview", icon: Activity },
  { label: "Reports", view: "reports", icon: Users },
  { label: "Drones", view: "drones", icon: Drone },
  { label: "AI", view: "ai", icon: Radio },
  { label: "Settings", view: "settings", icon: Settings },
];

export default function DashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadStats() {
      try {
        const response = await fetch("/api/dashboard/stats", { cache: "no-store" });
        const payload = (await response.json()) as { ok?: boolean; stats?: { userCount?: number | null; reportCount?: number | null } };
        if (alive && response.ok && payload.ok) {
          setUserCount(payload.stats?.userCount ?? null);
          setReportCount(payload.stats?.reportCount ?? null);
        }
      } catch {
        if (alive) {
          setUserCount(null);
          setReportCount(null);
        }
      }
    }

    loadStats();
    const timer = window.setInterval(loadStats, 30000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  function selectView(view: DashboardView) {
    setActiveView(view);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f4f7f6] font-sans">
      <header className="sticky top-0 z-30 border-b border-[#102a46] bg-[#1a365d] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => selectView("overview")}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/20 bg-white shadow-sm"><img src="/rodnam-logo.svg" alt="Rodnam" className="h-full w-full object-contain p-0.5" /></span><span className="min-w-0"><span className="block truncate text-lg font-bold leading-tight sm:text-xl">rodnam</span><span className="block text-xs text-blue-100">Admin Dashboard</span></span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Dashboard sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.view;

              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => selectView(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-white text-[#1a365d]" : "text-blue-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 text-sm md:flex">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 font-medium text-blue-50">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Online users: {userCount ?? "-"}
            </span>
            <button
              className="relative rounded-lg bg-white/10 p-2 text-blue-50 transition-colors hover:bg-white/15"
              type="button"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {reportCount ?? 0}
              </span>
            </button>
          </div>

          <button
            className="rounded-lg bg-white/10 p-2 text-white lg:hidden"
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/10 px-4 pb-4 lg:hidden">
            <nav className="mx-auto grid max-w-7xl grid-cols-1 gap-2 pt-3" aria-label="Mobile dashboard sections">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.view;

                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => selectView(item.view)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      active ? "bg-white text-[#1a365d]" : "text-blue-100 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : null}
      </header>

      <FloodDashboard activeView={activeView} />
    </div>
  );
}
