import { trpc } from "@/lib/trpc";

export function useAuth() {
  const query = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const user = query.data ?? null;
  const isAuthenticated = !!user;
  const loading = query.isLoading;

  function logout() {
    logoutMutation.mutate();
  }

  return { user, isAuthenticated, loading, logout };
}
