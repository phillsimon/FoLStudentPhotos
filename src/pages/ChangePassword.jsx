import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";
import { api, useAuth, homeFor } from "../auth.jsx";

const MIN = 8;

export default function ChangePassword() {
  const { t } = usePrefs();
  const { user, setUser, ready } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return <p className="status">{t("loading")}</p>;
  if (!user) return <Navigate to="/entrar" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < MIN) return setError(t("err_password_short"));
    if (next !== repeat) return setError(t("err_password_mismatch"));
    setBusy(true);
    setError("");
    try {
      const { user: u } = await api("/api/auth/password", "POST", { current_password: current, new_password: next });
      setUser(u);
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      const key = `err_${err.message}`;
      setError(t(key) === key ? t("err_server_error") : t(key));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow">
      <h1>{t("changePassword")}</h1>
      {user.must_change && <p>{t("mustChangeIntro")}</p>}
      <form className="stack" onSubmit={submit}>
        {/* Keeps the username with the new password for phone password managers. */}
        <input type="text" name="username" autoComplete="username" value={user.login} readOnly hidden />
        {!user.must_change && (
          <label className="field">
            <span className="field-label">{t("currentPassword")}</span>
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field-label">{t("newPassword")}</span>
          <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
          <span className="field-foot"><span>{t("passwordRule")}</span></span>
        </label>
        <label className="field">
          <span className="field-label">{t("repeatPassword")}</span>
          <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? t("saving") : t("save")}</button>
      </form>
    </section>
  );
}
