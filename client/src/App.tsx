import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Settings from "@/pages/Settings";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import InvoiceDetail from "./pages/InvoiceDetail";
import Documentation from "./pages/Documentation";
import Plans from "./pages/Plans";
import Billing from "./pages/Billing";
import Privacy from "./pages/Privacy";
import { PrivacyConsentModal } from "./components/PrivacyConsentModal";
import { trpc } from "@/lib/trpc";

function Router() {
  const meQuery = trpc.auth.me.useQuery();
  const needsConsent =
    meQuery.data &&
    !(meQuery.data as any).privacyConsentedAt;

  return (
    <>
      {needsConsent && (
        <PrivacyConsentModal
          open={true}
          onAccepted={() => meQuery.refetch()}
        />
      )}
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/dashboard"} component={Dashboard} />
        <Route path={"/invoices/:id"} component={InvoiceDetail} />
        <Route path={"/docs"} component={Documentation} />
        <Route path={"/settings"} component={Settings} />
        <Route path={"/plans"} component={Plans} />
        <Route path={"/billing"} component={Billing} />
        <Route path={"/privacy"} component={Privacy} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
