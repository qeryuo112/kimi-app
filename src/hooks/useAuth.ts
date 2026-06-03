import { useMemo } from "react";
import { trpc } from "@/providers/trpc";

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

export function useAuth() {
  const utils = trpc.useUtils();
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      deleteCookie("kimiokc_session");
      utils.invalidate();
      window.location.href = "/login";
    },
  });

  return useMemo(
    () => ({
      user: user || null,
      isAuthenticated: !!user,
      isLoading,
      error: null,
      logout: () => logoutMutation.mutate(),
      refresh: () => utils.auth.me.invalidate(),
    }),
    [user, isLoading, logoutMutation, utils]
  );
}
