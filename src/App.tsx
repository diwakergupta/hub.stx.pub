import * as React from "react";
import "./index.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MinersPage } from "./pages/miners";
import { BlocksPage } from "./pages/blocks";
import { UtilitiesPage } from "./pages/utilities";
import { useTelemetrySocket } from "./hooks/use-telemetry-socket";
import { Layers, Activity, Wrench, Radio } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Miners", icon: Layers },
  { href: "/blocks", label: "Blocks", icon: Activity },
  { href: "/utilities", label: "Utilities", icon: Wrench },
] as const;

function Header({
  currentPath,
  connectionStatus,
}: {
  currentPath: string;
  connectionStatus: "connected" | "connecting" | "disconnected";
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="w-full max-w-[1760px] mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="flex items-center gap-2 font-bold text-base tracking-tight text-foreground hover:opacity-90 transition-opacity shrink-0"
          >
            <span className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-mono font-bold text-xs shadow-xs shrink-0">
              S
            </span>
            <span className="whitespace-nowrap">Stacks Hub</span>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentPath === item.href ||
                (item.href !== "/" && currentPath.startsWith(item.href));
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-secondary text-secondary-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live Telemetry Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
              connectionStatus === "connected"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : connectionStatus === "connecting"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
            title={`Realtime WebSocket: ${connectionStatus}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-500 animate-pulse"
                  : connectionStatus === "connecting"
                    ? "bg-amber-500 animate-ping"
                    : "bg-destructive"
              }`}
            />
            <span className="capitalize">{connectionStatus}</span>
          </div>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function MobileBottomNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md px-3 py-2 flex items-center justify-around shadow-lg">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          currentPath === item.href ||
          (item.href !== "/" && currentPath.startsWith(item.href));
        return (
          <a
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-lg text-[11px] font-medium transition-colors ${
              isActive
                ? "text-primary font-bold bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 py-6 mt-8 sm:mt-12 text-xs text-muted-foreground mb-16 sm:mb-0">
      <div className="w-full max-w-[1760px] mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          80% vibe-coded, 20% hand-crafted, 100% with ❤️ by{" "}
          <a
            href="https://diwaker.io"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline font-medium"
          >
            Diwaker
          </a>
          .
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-muted-foreground">
          <a
            href="https://stacks.co"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Stacks Ecosystem
          </a>
          <span>·</span>
          <a
            href="https://explorer.stacks.co"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Hiro Explorer
          </a>
          <span>·</span>
          <a
            href="https://mempool.space"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Mempool.space
          </a>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isBlocksPage = path === "/blocks" || path.startsWith("/blocks/");
  const isUtilitiesPage = path === "/utilities" || path.startsWith("/utilities/");

  const { status, eventCount } = useTelemetrySocket();

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary overflow-x-hidden">
        <Header currentPath={path} connectionStatus={status} />
        <main className="flex-1 w-full max-w-[1760px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          {isUtilitiesPage ? (
            <UtilitiesPage />
          ) : isBlocksPage ? (
            <BlocksPage />
          ) : (
            <MinersPage realtimeEventCounter={eventCount} />
          )}
        </main>
        <Footer />
        <MobileBottomNav currentPath={path} />
      </div>
    </ThemeProvider>
  );
}

export default App;
