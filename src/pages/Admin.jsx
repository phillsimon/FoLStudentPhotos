import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { usePrefs, useJson, studentPath } from "../prefs.jsx";
import { api, useAuth } from "../auth.jsx";

const when = (iso, lang) => (iso ? new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" }) : "");

function accountStatus(u, t) {
  if (!u.has_password) return t("acct_none");
  if (u.must_change) return t("acct_temp");
  return t("acct_active");
}

function TempPassword({ user, onDone }) {
  const { t } = usePrefs();
  const [shown, setShown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const issue = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setShown((await api(`/api/admin/users/${user.id}/temp-password`, "POST")).password);
      onDone();
    } catch {
      setError(t("err_server_error"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
    } catch {}
  };

  return (
    <div className="temp">
      <button type="button" className="btn small" onClick={issue} disabled={busy}>{t(user.has_password ? "newTempPassword" : "createTempPassword")}</button>
      {shown && (
        <p className="temp-shown">
          <code>{shown}</code>
          <button type="button" className="btn small" onClick={copy}>{copied ? t("copied") : t("copy")}</button>
          <span className="dialog-hint">{t("tempShownOnce")}</span>
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export default function Admin() {
  const { t, lang } = usePrefs();
  const { user, ready } = useAuth();
  const allowed = user?.role === "superadmin";
  const { data, error, reload } = useJson(allowed ? "/api/admin/overview" : null);

  if (!ready) return <p className="status">{t("loading")}</p>;
  if (!allowed) return <Navigate to="/entrar" replace />;
  if (error) return <p className="status">{t("err_server_error")}</p>;
  if (!data) return <p className="status">{t("loading")}</p>;

  const students = data.users.filter((u) => u.role === "student");

  return (
    <section className="page admin">
      <h1>{t("admin")}</h1>

      <h2>{t("reviewQueue")} ({data.pending.length})</h2>
      {data.pending.length === 0 ? (
        <p className="status">{t("nothingToReview")}</p>
      ) : (
        <ul className="admin-list">
          {data.pending.map((p) => (
            <li key={p.slug}>
              <Link to={studentPath(p.slug)}>{p.first_name}</Link>
              <span className="dialog-hint">{when(p.submitted_at, lang)}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>{t("accounts")}</h2>
      <ul className="admin-list accounts">
        {students.map((u) => (
          <li key={u.id}>
            <div>
              <strong>{u.display_name}</strong>
              <span className="dialog-hint"> {t("loginLabel")}: {u.login} · {accountStatus(u, t)}</span>
            </div>
            <TempPassword user={u} onDone={reload} />
          </li>
        ))}
      </ul>

      <h2>{t("recentCaptionEdits")}</h2>
      {data.photo_edits.length === 0 ? (
        <p className="status">{t("noCaptionEdits")}</p>
      ) : (
        <ul className="admin-list">
          {data.photo_edits.map((e) => (
            <li key={e.photo_id}>
              <Link to={`${studentPath(e.student_slug)}?photo=${e.photo_id}`}>{e.display_name}</Link>
              <span>{e.title || e.caption || t("textRemoved")}</span>
              <span className="dialog-hint">{when(e.updated_at, lang)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
