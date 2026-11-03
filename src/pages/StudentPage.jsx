import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePrefs, useJson, imgUrl, studentPath } from "../prefs.jsx";
import Lightbox from "../components/Lightbox.jsx";

export default function StudentPage() {
  const { slug } = useParams();
  const { t, pick } = usePrefs();
  const { data: s, error } = useJson(`/api/students/${slug}`);
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

  return (
    <article className="student page">
      <header className="student-head">
        <h1>{s.first_name}</h1>
        {pick(s, "statement") && (
          <section className="statement" aria-label={t("artistStatement")}>
            <h2 className="eyebrow">{t("artistStatement")}</h2>
            <p>{pick(s, "statement")}</p>
          </section>
        )}
      </header>

      {/* Justified grid: each tile's width follows its aspect ratio, so nothing is cropped. */}
      <ul className="photo-grid">
        {s.photos.map((p) => {
          const ratio = p.width / p.height;
          return (
            <li key={p.id} style={{ flexGrow: ratio, "--r": ratio }}>
              <button className="tile" onClick={() => open(p.id)}>
                <span className="tile-inner" style={{ paddingBottom: `${100 / ratio}%` }}>
                  <img
                    src={imgUrl(p)}
                    alt={p.title || p.caption || t("photoBy", { name: s.first_name })}
                    loading="lazy"
                  />
                </span>
              </button>
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
        <Lightbox photos={s.photos} index={openIndex} name={s.first_name} onGo={go} onClose={close} />
      )}
    </article>
  );
}
