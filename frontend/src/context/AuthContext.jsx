import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = Boolean(user);

  const fetchUser = async () => {
    try {
      const me = await apiFetch("/auth/me");
      setUser(me);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const login = async (username, password) => {
    await apiFetch("/auth/login", {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });
    await fetchUser();
  };

  const register = async (username, password) => {
    await apiFetch("/auth/register", {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });
    await login(username, password);
  };

  const logout = () => {
    apiFetch("/auth/logout", { method: "POST", skipAuth: true }).catch(() => {});
    setUser(null);
  };

  const value = useMemo(
    () => ({
      isAuthenticated,
      user,
      loading,
      login,
      register,
      logout,
    }),
    [isAuthenticated, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
