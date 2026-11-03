import { useState } from "react";
import { Link } from "react-router-dom";
import { usePrefs, useJson, imgUrl, studentPath } from "../prefs.jsx";
import { useAuth } from "../auth.jsx";
import Paragraphs from "../components/Paragraphs.jsx";
import Pencil from "../components/Pencil.jsx";
import { SiteEditor } from "../components/Editors.jsx";

export default function Home() {
  const { t, pick } = usePrefs();
  const { data, error, reload } = useJson("/api/site");
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="intro">
        <section className="about">
          {data && user?.role === "superadmin" && (
            <Pencil className="pencil-corner" label={t("editWorkshop")} onClick={() => setEditing(true)} />
          )}
          {data ? (
            <>
              <p className="eyebrow">{pick(data, "eyebrow")}</p>
              <h1>{pick(data, "title")}</h1>
              <p className="meta">{pick(data, "meta")}</p>
              <Paragraphs text={pick(data, "workshop")} />
              <p className="sig">
                Phillip Simon<span>Instructor</span>
              </p>
            </>
          ) : (
            <p className="status">{error ? t("notFound") : t("loading")}</p>
          )}
        </section>

        <figure className="hero">
          <img
            src="/img/workshop-group.jpg"
            srcSet="/img/workshop-group-1000.jpg 1000w, /img/workshop-group.jpg 2000w"
            sizes="(max-width: 860px) 100vw, 560px"
            width="2000"
            height="1204"
            alt={t("groupPhotoAlt")}
          />
          <figcaption>{t("groupPhotoCaption")}</figcaption>
        </figure>
      </div>

      <section className="students" aria-labelledby="studentsHeading">
        <h2 id="studentsHeading">{t("students")}</h2>
        <ul className="student-grid">
          {data?.students.map((s) => (
            <li key={s.slug}>
              <Link className="card" to={studentPath(s.slug)}>
                <div className="cover">
                  <img src={imgUrl(s.cover)} alt="" loading="lazy" />
                </div>
                <p className="card-name">{s.first_name}</p>
                <p className="card-link">{t("viewGallery")}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {editing && <SiteEditor data={data} onClose={() => setEditing(false)} onSaved={reload} />}
    </>
  );
}
