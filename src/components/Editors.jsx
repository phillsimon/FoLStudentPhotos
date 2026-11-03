import { useEffect, useState } from "react";
import { usePrefs, imgUrl } from "../prefs.jsx";
import { api } from "../auth.jsx";
import EditDialog, { TextField } from "./EditDialog.jsx";

function useSaver() {
  const { t } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(t(`err_${e.message}`) === `err_${e.message}` ? t("err_server_error") : t(`err_${e.message}`));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const ErrorLine = ({ text }) => (text ? <p className="form-error" role="alert">{text}</p> : null);

// Students write in Spanish and see only Spanish. Saving sends the text for review.
export function StudentStatementEditor({ student, onClose, onSaved }) {
  const { t } = usePrefs();
  const { busy, error, run } = useSaver();
  const [text, setText] = useState(student.edit.draft || student.statement_es || "");
  const note = student.edit.status === "changes_requested" ? student.edit.review_note : "";

  const save = () =>
    run(async () => {
      await api(`/api/students/${student.slug}/statement`, "PUT", { text });
      onSaved();
      onClose();
    });

  return (
    <EditDialog title={t("artistStatement")} onClose={onClose}>
      {note && (
        <div className="review-note">
          <strong>{t("reviewNoteFromPhillip")}</strong>
          <p>{note}</p>
        </div>
      )}
      <TextField label={t("statementInSpanish")} lang="es" rows={10} value={text} onChange={setText} max={1500} hint={t("lineBreakHint")} />
      <p className="dialog-hint">{t("studentReviewHint")}</p>
      <ErrorLine text={error} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !text.trim() || text.length > 1500}>
          {busy ? t("saving") : t("submitForReview")}
        </button>
      </div>
    </EditDialog>
  );
}

// Phillip sees both languages side by side. Saving publishes immediately.
export function AdminStatementEditor({ student, onClose, onSaved }) {
  const { t } = usePrefs();
  const { busy, error, run } = useSaver();
  const pending = student.edit.status === "submitted" || student.edit.status === "changes_requested";
  const [es, setEs] = useState((pending && student.edit.draft) || student.statement_es || "");
  const [en, setEn] = useState(student.statement_en || "");
  const [translating, setTranslating] = useState(false);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");

  const draftEnglish = () => {
    setTranslating(true);
    run(async () => setEn((await api("/api/translate", "POST", { text: es, source: "es" })).text)).finally(() => setTranslating(false));
  };

  // A newly submitted statement opens with an English draft ready to correct.
  useEffect(() => {
    if (student.edit.status === "submitted" && es.trim()) draftEnglish();
  }, []);

  const publish = () =>
    run(async () => {
      await api(`/api/students/${student.slug}/statement`, "PUT", { es, en });
      onSaved();
      onClose();
    });

  const sendNote = () =>
    run(async () => {
      await api(`/api/students/${student.slug}/statement/request-changes`, "POST", { note });
      onSaved();
      onClose();
    });

  const noteToSpanish = () => run(async () => setNote((await api("/api/translate", "POST", { text: note, source: "en" })).text));

  return (
    <EditDialog title={`${t("artistStatement")}: ${student.first_name}`} onClose={onClose} wide>
      {pending && <p className="status-chip">{t(`status_${student.edit.status}`)}</p>}
      <div className="side-by-side">
        <TextField label="Español" lang="es" rows={12} value={es} onChange={setEs} max={3000} hint={t("lineBreakHint")} />
        <TextField label="English" lang="en" rows={12} value={en} onChange={setEn} max={3000} hint={translating ? t("translating") : t("aiDraftHint")} disabled={translating} />
      </div>
      <button type="button" className="btn small" onClick={draftEnglish} disabled={busy || !es.trim()}>{t("draftEnglish")}</button>

      {noting && (
        <div className="note-box">
          <TextField label={t("noteToStudent")} rows={4} value={note} onChange={setNote} max={1000} />
          <button type="button" className="btn small" onClick={noteToSpanish} disabled={busy || !note.trim()}>{t("translateNote")}</button>
        </div>
      )}

      <ErrorLine text={error} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        {pending && !noting && (
          <button type="button" className="btn" onClick={() => setNoting(true)} disabled={busy}>{t("requestChanges")}</button>
        )}
        {noting ? (
          <button type="button" className="btn primary" onClick={sendNote} disabled={busy || !note.trim()}>{t("sendNote")}</button>
        ) : (
          <button type="button" className="btn primary" onClick={publish} disabled={busy || translating}>{busy ? t("saving") : t("publish")}</button>
        )}
      </div>
    </EditDialog>
  );
}

// Titles and captions show exactly as written in both languages, and go live on save.
export function PhotoEditor({ photo, name, onClose, onSaved, onNext }) {
  const { t } = usePrefs();
  const { busy, error, run } = useSaver();
  const [title, setTitle] = useState(photo.title);
  const [caption, setCaption] = useState(photo.caption);
  const invalid = title.length > 100 || caption.length > 500;

  const save = (after) =>
    run(async () => {
      await api(`/api/photos/${photo.id}`, "PATCH", { title, caption });
      onSaved();
      after();
    });

  return (
    <EditDialog title={t("editPhoto")} onClose={onClose}>
      <img className="dialog-thumb" src={imgUrl(photo)} alt={t("photoBy", { name })} />
      <TextField label={t("photoTitle")} value={title} onChange={setTitle} max={100} />
      <TextField label={t("photoCaption")} rows={5} value={caption} onChange={setCaption} max={500} hint={t("lineBreakHint")} />
      <ErrorLine text={error} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        <button type="button" className="btn" onClick={() => save(onNext)} disabled={busy || invalid}>{t("saveAndNext")}</button>
        <button type="button" className="btn primary" onClick={() => save(onClose)} disabled={busy || invalid}>{busy ? t("saving") : t("save")}</button>
      </div>
    </EditDialog>
  );
}

const SITE_ROWS = [
  { key: "eyebrow", label: "siteEyebrow" },
  { key: "title", label: "siteTitle" },
  { key: "meta", label: "siteMeta" },
  { key: "workshop", label: "siteWorkshop", rows: 14 },
];

export function SiteEditor({ data, onClose, onSaved }) {
  const { t } = usePrefs();
  const { busy, error, run } = useSaver();
  const [values, setValues] = useState(() => {
    const v = {};
    for (const { key } of SITE_ROWS) for (const l of ["es", "en"]) v[`${key}_${l}`] = data[`${key}_${l}`] || "";
    return v;
  });
  const set = (k) => (val) => setValues((cur) => ({ ...cur, [k]: val }));

  const save = () =>
    run(async () => {
      await api("/api/site", "PUT", values);
      onSaved();
      onClose();
    });

  return (
    <EditDialog title={t("editWorkshop")} onClose={onClose} wide>
      {SITE_ROWS.map(({ key, label, rows }) => (
        <div className="side-by-side" key={key}>
          <TextField label={`${t(label)} (Español)`} lang="es" rows={rows} value={values[`${key}_es`]} onChange={set(`${key}_es`)} hint={rows && t("lineBreakHint")} />
          <TextField label={`${t(label)} (English)`} lang="en" rows={rows} value={values[`${key}_en`]} onChange={set(`${key}_en`)} hint={rows && t("lineBreakHint")} />
        </div>
      ))}
      <ErrorLine text={error} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t("cancel")}</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? t("saving") : t("publish")}</button>
      </div>
    </EditDialog>
  );
}
