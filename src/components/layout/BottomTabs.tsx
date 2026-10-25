import { Link, useLocation } from "react-router-dom";
import { tabForPath, tabsFor } from "@/lib/nav";
import { useT } from "@/i18n";
import { haptic } from "@/native";
import { useNotifications, useSession } from "@/store";
import { cn } from "@/lib/utils";

/**
 * The app's primary navigation (spec §4). Always visible, thumb-reachable,
 * and padded for the iOS home indicator / Android gesture bar.
 */
export function BottomTabs() {
  const { pathname } = useLocation();
  const tabs = tabsFor(useSession().user);
  const activeTab = tabForPath(pathname, tabs);
  const { unread } = useNotifications();
  const t = useT();

  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 border-t border-border bg-surface pb-safe"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = tab.id === activeTab.id;
          const showBadge = tab.id === "comunidad" && unread > 0;
          return (
            <li key={tab.id}>
              <Link
                to={tab.href}
                onClick={() => haptic("light")}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 pb-1 pt-2 transition-colors",
                  active ? "text-primary" : "text-muted-foreground active:text-foreground",
                )}
              >
                <span className="relative">
                  <tab.icon
                    className={cn("size-[1.35rem] transition-transform", active && "scale-105")}
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                  {showBadge && (
                    <span
                      className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-surface"
                      aria-hidden
                    />
                  )}
                </span>
                <span className={cn("text-[0.64rem] leading-none", active && "font-semibold")}>
                  {tab.labelKey ? t(tab.labelKey) : tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
