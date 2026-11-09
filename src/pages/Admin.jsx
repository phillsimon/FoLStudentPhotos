import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { usePrefs, useJson, studentPath, imgUrl } from "../prefs.jsx";
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

// Photos students picked for their pages. Tick one or many, then approve or decline them together.
function PhotoReview({ photos, onDone }) {
  const { t } = usePrefs();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = photos.filter((p) => picked.has(p.id)).map((p) => p.id); // Ignore ticks on photos that left the queue.
  const groups = [];
  for (const p of photos) {
    const g = groups.find((x) => x.slug === p.student_slug);
    if (g) g.photos.push(p);
    else groups.push({ slug: p.student_slug, name: p.first_name, photos: [p] });
  }

  const flip = (ids, on) =>
    setPicked((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const act = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/photos/review", "POST", { ids: live, action });
      setPicked(new Set());
      onDone();
    } catch {
      setError(t("err_server_error"));
    } finally {
      setBusy(false);
    }
  };

  if (!photos.length) return <p className="status">{t("nothingToReview")}</p>;
  const all = photos.every((p) => picked.has(p.id));

  return (
    <div className="review-photos">
      <div className="review-bar">
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => flip(photos.map((p) => p.id), e.target.checked)} />
          {t("selectAll")}
        </label>
        <span className="dialog-hint">{t("selectedCount", { n: live.length })}</span>
        <button type="button" className="btn small" onClick={() => act("decline")} disabled={busy || !live.length}>{t("declineSelected")}</button>
        <button type="button" className="btn small primary" onClick={() => act("approve")} disabled={busy || !live.length}>{t("approveSelected")}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {groups.map((g) => (
        <div key={g.slug} className="review-group">
          <h3>
            <label className="check">
              <input type="checkbox" checked={g.photos.every((p) => picked.has(p.id))} onChange={(e) => flip(g.photos.map((p) => p.id), e.target.checked)} />
              {g.name} ({g.photos.length})
            </label>
            <Link className="dialog-hint" to={studentPath(g.slug)}>{t("viewPage")}</Link>
          </h3>
          <ul className="pm-grid">
            {g.photos.map((p) => (
              <li key={p.id} className={`pm-tile${picked.has(p.id) ? " on" : ""}`}>
                <button type="button" className="pm-pick" aria-pressed={picked.has(p.id)} onClick={() => flip([p.id], !picked.has(p.id))}
                  aria-label={t("photoBy", { name: g.name })}>
                  <img src={imgUrl(p)} alt="" loading="lazy" />
                  <span className="pm-check" aria-hidden="true">{picked.has(p.id) ? "✓" : ""}</span>
                </button>
                <a className="pm-zoom" href={p.web} target="_blank" rel="noreferrer" title={t("openLarge")} aria-label={t("openLarge")}>⤢</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CoverReview({ covers, onDone }) {
  const { t } = usePrefs();
  const [busy, setBusy] = useState("");
  const act = async (slug, action) => {
    setBusy(slug);
    try {
      await api(`/api/admin/students/${slug}/cover`, "POST", { action });
      onDone();
    } finally {
      setBusy("");
    }
  };
  if (!covers.length) return null;
  return (
    <>
      <h2>{t("coverReviews")} ({covers.length})</h2>
      <ul className="admin-list covers">
        {covers.map((c) => (
          <li key={c.slug}>
            <img className="cover-thumb" src={c.thumb} alt="" />
            <div>
              <strong>{c.first_name}</strong>
              {c.status === "requested" && <span className="dialog-hint"> · {t("coverAlsoApprovesPhoto")}</span>}
            </div>
            <div className="row-actions">
              <button type="button" className="btn small" disabled={busy === c.slug} onClick={() => act(c.slug, "decline")}>{t("decline")}</button>
              <button type="button" className="btn small primary" disabled={busy === c.slug} onClick={() => act(c.slug, "approve")}>{t("approve")}</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// Sends a test email and says what happened, so a missing or wrong key is easy to spot.
function TestEmail() {
  const { t } = usePrefs();
  const [state, setState] = useState(null);
  const run = async () => {
    setState({ busy: true });
    try {
      setState(await api("/api/admin/test-email", "POST", {}));
    } catch {
      setState({ ok: false, reason: "server" });
    }
  };
  return (
    <p className="dialog-hint test-email">
      <button type="button" className="btn small" onClick={run} disabled={state?.busy}>{t("sendTestEmail")}</button>{" "}
      {state && !state.busy && (state.ok ? t("testEmailSent", { to: state.to }) : `${t(`testEmail_${state.reason}`)}${state.detail ? ` (${state.status ?? ""} ${state.detail})` : ""}`)}
    </p>
  );
}

const gb = (n) => (n / 1024 ** 3).toFixed(2);

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

      <h2>{t("photoReviews")} ({data.photo_reviews.length})</h2>
      <PhotoReview photos={data.photo_reviews} onDone={reload} />

      <CoverReview covers={data.cover_reviews} onDone={reload} />

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

      <p className="dialog-hint storage">{t("storageUsed", { used: gb(data.storage_bytes) })}</p>
      <TestEmail />

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
