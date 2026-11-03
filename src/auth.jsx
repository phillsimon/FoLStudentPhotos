import { createContext, useCallback, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

// Sends JSON and throws an Error whose message is the server's error code.
export async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "server_error");
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/api/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", "POST").catch(() => {});
    window.location.assign("/"); // Full reload so no drafts stay on screen.
  }, []);

  return <AuthContext.Provider value={{ user, setUser, ready, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const homeFor = (user) => (user?.role === "superadmin" ? "/admin" : user?.student_slug ? `/estudiantes/${user.student_slug}` : "/");
