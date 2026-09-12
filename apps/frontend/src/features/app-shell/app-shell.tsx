import { WebFullscreen } from '@/components/web-fullscreen'
import { DesktopDownload } from '@/components/desktop-download'
import { useEffect, type ReactNode } from "react";
import { desktopBridge } from "@/lib/desktop";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { appBackground, pagePadding } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useDynamicBackdropColor } from "@/hooks/use-dynamic-backdrop-color";
import { profilesQuery } from "@/api/queries";
import { useAppStore } from "@/store/app-store";

import { navItems, type NavPath } from "./nav-items";
import { ProfileAvatar } from "./profile-avatar";

export function AppShell({
  activePath,
  children,
  hideNavigation = false,
  className,
  label,
  onNavigate,
}: {
  activePath: string;
  children: ReactNode;
  hideNavigation?: boolean;
  className?: string;
  label: string;
  onNavigate: (path: NavPath) => void;
}) {
  const location = useLocation();
  const backdrop = useDynamicBackdropColor(location.pathname);
  const token = useAppStore((state) => state.token);
  const activeProfileId = useAppStore((state) => state.activeProfileId);
  const profiles = useQuery({ ...profilesQuery, enabled: Boolean(token) });
  const activeProfile = (profiles.data ?? []).find((value) => value.id === activeProfileId) ?? null;

  return (
    <div
      className={cn(
        "min-h-svh text-foreground",
        backdrop.isMediaDrivenPage ? "media-driven-backdrop" : appBackground,
        backdrop.hasMediaAccent && "has-media-accent",
      )}
      style={backdrop.style}
    >
      {hideNavigation ? null : (
        <aside
          className="fixed inset-y-0 left-0 z-20 grid w-[104px] place-items-center border-r border-sidebar-border bg-sidebar/58 shadow-[16px_0_42px_hsl(0_0%_0%/14%)] backdrop-blur-xl max-[800px]:inset-x-0 max-[800px]:top-auto max-[800px]:bottom-0 max-[800px]:h-[72px] max-[800px]:w-auto max-[800px]:border-t max-[800px]:border-r-0 max-[800px]:shadow-[0_-16px_42px_hsl(0_0%_0%/18%)]"
          aria-label="Primary navigation"
        >
          <nav className="grid gap-3 max-[800px]:flex max-[800px]:gap-2">
            {navItems.map(({ path, label: itemLabel, icon: Icon }) => {
              const isActive = activePath === path;
              const showProfileIcon = path === "/settings" && activeProfile;

              return (
                <Tooltip key={path}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      type="button"
                      className={cn(
                        "size-13 rounded-full text-muted-foreground transition-[color,background-color,transform] duration-200 ease-out hover:bg-muted hover:text-foreground max-[800px]:size-12 [&_svg]:size-6 [&_svg]:transition-[transform,stroke-width] [&_svg]:duration-200 [&_svg]:ease-out",
                        isActive &&
                          "scale-[1.06] bg-muted text-foreground [&_svg]:scale-[1.12] [&_svg]:stroke-[2.35]",
                      )}
                      aria-label={itemLabel}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onNavigate(path)}
                      title={itemLabel}
                    >
                      {showProfileIcon ? (
                        <ProfileAvatar
                          name={activeProfile.name}
                          avatarKey={activeProfile.avatar_key}
                          themeColor={activeProfile.theme_color}
                          className="size-7 text-sm shadow-none"
                        />
                      ) : (
                        <Icon aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-[800px]:hidden">
                    {itemLabel}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
          <WebFullscreen /><DesktopDownload sidebar />
        </aside>
      )}

      <main
        className={cn(
          "app-page ml-[104px] min-h-svh max-[800px]:ml-0 max-[800px]:mb-[72px] max-[800px]:min-h-[calc(100svh-72px)]",
          pagePadding,
          hideNavigation &&
            "p-0 max-[800px]:p-0 ml-0 mb-0 min-h-svh max-[800px]:mb-0",
          className,
        )}
        aria-label={label}
      >
        <div key={location.pathname} className={hideNavigation ? undefined : "route-arrival"}>{children}</div>
      </main>
    </div>
  );
}
