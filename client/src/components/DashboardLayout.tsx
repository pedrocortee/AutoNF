import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, LogOut, PanelLeft, Settings,
  CreditCard, Receipt, ChevronRight,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: CreditCard,      label: "Planos",     path: "/plans" },
  { icon: Receipt,         label: "Faturas",    path: "/billing" },
  { icon: Settings,        label: "Configurações", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 248;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center">
            <span className="text-white text-sm font-bold">NF</span>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-foreground">Faça login para continuar</h1>
            <p className="text-sm text-muted-foreground">O acesso ao painel requer autenticação.</p>
          </div>
          <Button onClick={() => { window.location.href = getLoginUrl(); }} className="w-full gap-2">
            Entrar <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const initials = user?.name
    ?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase() ?? "?";

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
          {/* Header / Logo */}
          <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-3">
              <button
                onClick={toggleSidebar}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors shrink-0 focus:outline-none"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-3.5 w-3.5 text-white" />
              </button>
              {!isCollapsed && (
                <span className="text-[15px] font-semibold text-sidebar-accent-foreground tracking-tight">
                  AutoNF
                </span>
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="px-3 py-3 gap-0.5 flex flex-col">
            <SidebarMenu className="gap-0.5 flex-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <button
                      onClick={() => setLocation(item.path)}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] transition-all duration-150",
                        isCollapsed ? "justify-center" : "",
                        isActive
                          ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                          : "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent font-normal"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "shrink-0",
                          isCollapsed ? "w-5 h-5" : "w-4 h-4",
                          isActive ? "text-sidebar-primary" : "text-sidebar-foreground"
                        )}
                      />
                      {!isCollapsed && <span>{item.label}</span>}
                    </button>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

          </SidebarContent>

          {/* Footer / User */}
          <SidebarFooter className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg p-2 hover:bg-sidebar-accent transition-colors focus:outline-none",
                    isCollapsed ? "justify-center" : ""
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[11px] font-semibold bg-indigo-600 text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-medium text-sidebar-accent-foreground truncate leading-none">
                        {user?.name || "Usuário"}
                      </p>
                      <p className="text-[11px] text-sidebar-foreground truncate mt-1">
                        {user?.email || ""}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52 mb-1">
                <div className="px-3 py-2">
                  <p className="text-[13px] font-medium text-foreground truncate">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30 text-[13px] gap-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        <div
          className={cn(
            "absolute top-0 right-0 w-px h-full cursor-col-resize hover:bg-indigo-400/40 transition-colors",
            isCollapsed ? "hidden" : ""
          )}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {/* Mobile topbar */}
        {isMobile && (
          <div className="flex border-b border-border h-14 items-center gap-3 bg-card px-4 sticky top-0 z-40 shadow-sm">
            <SidebarTrigger className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-medium text-foreground">
              {activeMenuItem?.label ?? "Menu"}
            </span>
          </div>
        )}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
      </SidebarInset>
    </>
  );
}
