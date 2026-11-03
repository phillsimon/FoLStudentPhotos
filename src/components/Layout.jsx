import { Link, Outlet, useLocation } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";
import Crest from "./Crest.jsx";

function Toolbar() {
  const { t, toggleLang, toggleTheme } = usePrefs();
  return (
    <div className="toolbar-actions">
      <button className="tbtn" type="button" onClick={toggleLang} aria-label={t("switchLangLabel")}>
        {t("switchLang")}
      </button>
      <button className="tbtn" type="button" onClick={toggleTheme} aria-label={t("themeLabel")}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        {t("theme")}
      </button>
    </div>
  );
}

function BannerText() {
  const { t, lang } = usePrefs();
  return (
    <div className="banner-text">
      {lang === "es" && <div className="kicker">CENTRO EDUCATIVO</div>}
      <p className="school">{t("schoolName")}</p>
      <div className="gallery">{t("galleryName")}</div>
      <div className="gallery-sub">{t("place")}</div>
    </div>
  );
}

export default function Layout() {
  const { t } = usePrefs();
  const isHome = useLocation().pathname === "/";

  return (
    <>
      {isHome ? (
        <header className="banner">
          <div className="toolbar">
            <Toolbar />
          </div>
          <div className="banner-inner">
            <Crest className="crest" />
            <BannerText />
          </div>
        </header>
      ) : (
        <header className="banner banner-compact">
          <div className="compact-inner">
            <Link to="/" className="compact-brand">
              <Crest className="crest-sm" />
              <span>
                <span className="compact-school">{t("schoolName")}</span>
                <span className="compact-gallery">{t("galleryName")}</span>
              </span>
            </Link>
            <Toolbar />
          </div>
        </header>
      )}
      <main>
        <Outlet />
      </main>
      <footer>
        Centro Educativo Manantial de Vida <span className="dot">●</span> {t("place")}
      </footer>
    </>
  );
}
