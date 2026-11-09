import { useState } from "react";
import { usePrefs, imgUrl } from "../prefs.jsx";
import { api } from "../auth.jsx";
import EditDialog from "./EditDialog.jsx";
import Uploader from "./Uploader.jsx";
import { useColumns, splitColumns } from "../columns.js";

// 3 columns, 2 on phones.
const chooserCols = (w) => (w <= 600 ? 2 : 3);

// One pop-up for choosing which uploaded photos show on a student's page, and their homepage card photo.
// Students: ticks go to Phillip for review. Phillip: ticks publish now, and he can upload and delete here.

function Star({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />
    </svg>
  );
}

export default function PhotoManager({ student, admin, onClose, onSaved }) {
  const { t } = usePrefs();
  const library = student.library;
  const cols = useColumns(chooserCols);
  const { approved, requested } = student.cover;
  // Only what the person changes is kept here, so new uploads appear without losing their ticks.
  const [changes, setChanges] = useState({});
  const [coverPick, setCoverPick] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startsShown = (p) => (admin ? p.status === "live" : p.status === "live" || p.status === "requested");
  const shown = (p) => (p.id in changes ? changes[p.id] : startsShown(p));
  const startCover = admin ? approved : requested || approved;
  const cover = coverPick === undefined ? startCover : coverPick;

  const toggle = (p) => {
    const next = !shown(p);
    setChanges((c) => ({ ...c, [p.id]: next }));
    if (!next && cover === p.id) setCoverPick(null);
  };
  const pickCover = (p) => {
    if (!shown(p)) setChanges((c) => ({ ...c, [p.id]: true }));
    setCoverPick(p.id);
  };

  const fail = (e) => setError(t(`err_${e.message}`) === `err_${e.message}` ? t("err_server_error") : t(`err_${e.message}`));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/students/${student.slug}/selection`, "PUT", { show: library.filter(shown).map((p) => p.id), cover: cover || null });
      onSaved();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(t("deletePhotoConfirm", { name: p.filename }))) return;
    try {
      await api(`/api/photos/${p.id}`, "DELETE");
      onSaved();
    } catch (e) {
      fail(e);
    }
  };

  // What the badge on each photo says.
  const badge = (p) => {
    const on = shown(p);
    if (p.id in changes && on !== startsShown(p)) return on ? (admin ? "pm_willPublish" : "pm_willSubmit") : "pm_willRemove";
    if (p.status === "live") return "pm_live";
    if (p.status === "requested") return admin ? "pm_studentPicked" : "pm_waiting";
    if (p.status === "declined") return "pm_declined";
    return null;
  };

  const chosen = library.filter(shown).length;
  const coverWaiting = !admin && requested && cover === requested;

  return (
    <EditDialog title={admin ? t("pm_titleAdmin", { name: student.first_name }) : t("pm_title")} onClose={onClose} wide>
      {admin && <Uploader slug={student.slug} library={library} onUploaded={onSaved} />}

      {library.length === 0 ? (
        <p className="status">{t(admin ? "pm_emptyAdmin" : "pm_empty")}</p>
      ) : (
        <>
          <p className="dialog-hint">{t(admin ? "pm_hintAdmin" : "pm_hint")}</p>
          <p className="pm-count" aria-live="polite">
            {t("pm_chosen", { n: chosen, total: library.length })}
            {coverWaiting && <span className="status-chip">{t("pm_coverWaiting")}</span>}
          </p>
          <div className="pm-masonry" style={{ "--cols": cols }}>
            {splitColumns(library, cols).map((col, ci) => (
              <ul key={ci} className="pm-col">
            {col.map((p) => {
              const on = shown(p);
              const b = badge(p);
              const isCover = cover === p.id;
              return (
                <li key={p.id} className={`pm-tile${on ? " on" : ""}`}>
                  <button type="button" className="pm-pick" style={{ aspectRatio: `${p.width} / ${p.height}` }} aria-pressed={on} onClick={() => toggle(p)}
                    aria-label={`${p.title || p.filename}: ${t(on ? "pm_shown" : "pm_hidden")}`}>
                    <img src={imgUrl(p)} alt="" loading="lazy" />
                    <span className="pm-check" aria-hidden="true">{on ? "✓" : ""}</span>
                  </button>
                  <button type="button" className={`pm-star${isCover ? " on" : ""}`} aria-pressed={isCover} onClick={() => pickCover(p)}
                    title={t("pm_cover")} aria-label={t("pm_cover")}>
                    <Star filled={isCover} />
                  </button>
                  {admin && (
                    <button type="button" className="pm-delete" onClick={() => remove(p)} title={t("deletePhoto")} aria-label={t("deletePhoto")}>×</button>
                  )}
                  {b && <span className={`pm-badge ${b}`}>{t(b)}</span>}
                </li>
              );
            })}
              </ul>
            ))}
          </div>
        </>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t(library.length ? "cancel" : "close")}</button>
        {library.length > 0 && (
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            {busy ? t("saving") : t(admin ? "publish" : "pm_submit")}
          </button>
        )}
      </div>
    </EditDialog>
  );
}
