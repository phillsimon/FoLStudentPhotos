import { Link } from "react-router-dom";
import { usePrefs, useJson, imgUrl, studentPath } from "../prefs.jsx";

export default function Home() {
  const { t, pick } = usePrefs();
  const { data, error } = useJson("/api/site");

  return (
    <>
      <div className="intro">
        <section className="about">
          {data ? (
            <>
              <p className="eyebrow">{pick(data, "eyebrow")}</p>
              <h1>{pick(data, "title")}</h1>
              <p className="meta">{pick(data, "meta")}</p>
              {pick(data, "workshop").split(/\n\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
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
    </>
  );
}
