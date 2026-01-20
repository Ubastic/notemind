import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api";
import { clearToken, getToken, setToken } from "../auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async (currentToken) => {
    if (!currentToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch("/auth/me");
      setUser(me);
    } catch (error) {
      clearToken();
      setTokenState(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser(token);
  }, [token]);

  const login = async (username, password) => {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: { username, password },
      skipAuth: true,
    });
    setToken(data.access_token);
    setTokenState(data.access_token);
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
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      register,
      logout,
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
