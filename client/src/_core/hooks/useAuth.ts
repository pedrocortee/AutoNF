import { trpc } from "@/lib/trpc";
import { useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useEffect } from "react";

export function useAuth() {
  const { signOut } = useClerk();
  const { isSignedIn } = useClerkAuth();
  const query = trpc.auth.me.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (isSignedIn !== undefined) {
      query.refetch();
    }
  }, [isSignedIn]);

  const user = query.data ?? null;
  const isAuthenticated = !!user;
  const loading = query.isLoading || isSignedIn === undefined;

  async function logout() {
    await signOut();
    window.location.href = "/";
  }

  return { user, isAuthenticated, loading, logout };
}
