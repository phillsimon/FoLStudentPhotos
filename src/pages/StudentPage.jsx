import { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePrefs, useJson, imgUrl, studentPath } from "../prefs.jsx";
import { useAuth } from "../auth.jsx";
import Lightbox from "../components/Lightbox.jsx";
import Paragraphs from "../components/Paragraphs.jsx";
import Pencil from "../components/Pencil.jsx";
import { AdminStatementEditor, PhotoEditor, StudentStatementEditor } from "../components/Editors.jsx";

export default function StudentPage() {
  const { slug } = useParams();
  const { t, pick } = usePrefs();
  const { data: s, error, reload } = useJson(`/api/students/${slug}`);
  const { user } = useAuth();
  const [editing, setEditing] = useState(null); // "statement", or a photo id
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  if (error) return <p className="status">{t("notFound")}</p>;
  if (!s) return <p className="status">{t("loading")}</p>;

  const openId = params.get("photo");
  const openIndex = s.photos.findIndex((p) => p.id === openId);

  // Opening pushes a history entry so the browser Back button closes the lightbox.
  // Closing steps back through that entry (or just clears it if the page was opened from a shared link).
  const open = (id) => setParams({ photo: id }, { state: { lb: true } });
  const go = (id) => setParams({ photo: id }, { replace: true, state: location.state });
  const close = () => (location.state?.lb ? navigate(-1) : setParams({}, { replace: true }));

  const canEdit = !!s.edit;
  const isOwner = canEdit && user?.role === "student";
  // A student sees their statement in the language they wrote it in, whichever language the site is showing.
  const shown = isOwner ? s.statement_es : pick(s, "statement");
  const pendingView = canEdit && s.edit.draft && s.edit.status !== "approved";
  const editingIndex = s.photos.findIndex((p) => p.id === editing);

  return (
    <article className="student page">
      <header className="student-head">
        <h1>{s.first_name}</h1>
        {(shown || canEdit) && (
          <section className="statement" aria-label={t("artistStatement")}>
            {canEdit && <Pencil className="pencil-corner" label={t("editStatement")} onClick={() => setEditing("statement")} />}
            <h2 className="eyebrow">{t("artistStatement")}</h2>
            {shown ? <Paragraphs text={shown} /> : <p className="status">{t("noStatementYet")}</p>}
            {pendingView && (
              <div className="pending">
                <p className="status-chip">{t(`status_${s.edit.status}`)}</p>
                {s.edit.status === "changes_requested" && s.edit.review_note && (
                  <div className="review-note">
                    <strong>{t("reviewNoteFromPhillip")}</strong>
                    <p>{s.edit.review_note}</p>
                  </div>
                )}
                <div lang="es"><Paragraphs text={s.edit.draft} /></div>
              </div>
            )}
          </section>
        )}
      </header>

      {/* Justified grid: each tile's width follows its aspect ratio, so nothing is cropped. */}
      <ul className="photo-grid">
        {s.photos.map((p) => {
          const ratio = p.width / p.height;
          return (
            <li key={p.id} className="photo-item" style={{ flexGrow: ratio, "--r": ratio }}>
              <button className="tile" onClick={() => open(p.id)}>
                <span className="tile-inner" style={{ paddingBottom: `${100 / ratio}%` }}>
                  <img
                    src={imgUrl(p)}
                    alt={p.title || p.caption || t("photoBy", { name: s.first_name })}
                    loading="lazy"
                  />
                </span>
              </button>
              {canEdit && <Pencil className="pencil-photo" label={t("editPhoto")} onClick={() => setEditing(p.id)} />}
            </li>
          );
        })}
        <li className="grid-filler" aria-hidden="true" />
      </ul>

      <nav className="student-nav">
        <Link to={studentPath(s.prev.slug)}>← {s.prev.first_name}</Link>
        <Link to="/">{t("allStudents")}</Link>
        <Link to={studentPath(s.next.slug)}>{s.next.first_name} →</Link>
      </nav>

      {openIndex !== -1 && (
        <Lightbox photos={s.photos} index={openIndex} name={s.first_name} onGo={go} onClose={close} onEdit={canEdit ? setEditing : null} />
      )}

      {editing === "statement" &&
        (isOwner ? (
          <StudentStatementEditor student={s} onClose={() => setEditing(null)} onSaved={reload} />
        ) : (
          <AdminStatementEditor student={s} onClose={() => setEditing(null)} onSaved={reload} />
        ))}
      {editingIndex !== -1 && (
        <PhotoEditor
          key={editing}
          photo={s.photos[editingIndex]}
          name={s.first_name}
          onClose={() => setEditing(null)}
          onSaved={reload}
          onNext={() => setEditing(s.photos[(editingIndex + 1) % s.photos.length].id)}
        />
      )}
    </article>
  );
}
