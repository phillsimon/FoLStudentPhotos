import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";
import { api, useAuth, homeFor } from "../auth.jsx";

export default function Login() {
  const { t } = usePrefs();
  const { user, setUser, ready } = useAuth();
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={user.must_change ? "/clave" : homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user: u } = await api("/api/auth/login", "POST", { login, password });
      setUser(u);
      navigate(u.must_change ? "/clave" : homeFor(u), { replace: true });
    } catch (err) {
      setError(t(err.message === "too_many_attempts" ? "err_too_many_attempts" : err.message === "bad_login" ? "err_bad_login" : "err_server_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow">
      <h1>{t("signIn")}</h1>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="field-label">{t("loginName")}</span>
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t("password")}</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? t("loading") : t("signIn")}</button>
      </form>
      <p className="dialog-hint">{t("forgotPassword")}</p>
    </section>
  );
}
