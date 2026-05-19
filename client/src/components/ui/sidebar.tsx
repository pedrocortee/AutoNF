import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useMobile";

type SidebarState = "expanded" | "collapsed";

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const [openState, setOpenState] = React.useState(defaultOpen);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = React.useCallback(
    (value: boolean) => {
      setOpenState(value);
      onOpenChange?.(value);
    },
    [onOpenChange]
  );

  const toggleSidebar = React.useCallback(() => setOpen(!open), [open, setOpen]);
  const state: SidebarState = open ? "expanded" : "collapsed";

  return (
    <SidebarContext.Provider value={{ state, open, setOpen, toggleSidebar }}>
      <div
        style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "3rem", ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar", className)}
        data-state={state}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
}

export function Sidebar({ children, className, side = "left", collapsible = "offcanvas" }: SidebarProps) {
  const { state } = useSidebar();
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "group peer hidden md:block text-sidebar-foreground",
        className
      )}
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant="sidebar"
      data-side={side}
    >
      <div
        className={cn(
          "duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          collapsible === "icon" && "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
        )}
      />
      <div
        className={cn(
          "duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          collapsible === "icon" && "group-data-[collapsible=icon]:w-[--sidebar-width-icon] overflow-hidden",
          className
        )}
      >
        <div data-sidebar="sidebar" className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow">
          {children}
        </div>
      </div>
    </div>
  );
}

export function SidebarTrigger({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      data-sidebar="trigger"
      className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    />
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <main
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-sidebar="footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />;
}

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, asChild = false, isActive = false, tooltip, children, ...props }, ref) => {
    const Comp = asChild ? React.Fragment : "button";
    const content = (
      <button
        ref={ref}
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(
          "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
    return content;
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";
