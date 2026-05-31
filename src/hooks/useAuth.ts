import { useMemo } from "react";

const LOCAL_USER = {
  id: 1,
  unionId: "local-user",
  name: "本地用户",
  email: "local@example.com",
  avatar: null,
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignInAt: new Date(),
};

export function useAuth() {
  return useMemo(
    () => ({
      user: LOCAL_USER,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      logout: () => {},
      refresh: () => {},
    }),
    [],
  );
}
