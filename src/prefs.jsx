import { createContext, useCallback, useContext, useEffect, useState } from "react";
import en from "./i18n/en.json";
import es from "./i18n/es.json";

const STRINGS = { en, es };
const PrefsContext = createContext(null);
const root = document.documentElement;

function readStoredTheme() {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function PrefsProvider({ children }) {
  // The Worker has already set <html lang> from the saved choice or the visitor's country.
  const [lang, setLang] = useState(root.lang === "en" ? "en" : "es");
  // null = follow the system setting until the visitor picks one.
  const [theme, setTheme] = useState(readStoredTheme());

  useEffect(() => {
    root.lang = lang;
    document.title = STRINGS[lang].pageTitle;
  }, [lang]);

  useEffect(() => {
    if (theme) root.dataset.theme = theme;
  }, [theme]);

  const toggleLang = useCallback(() => {
    setLang((cur) => {
      const next = cur === "en" ? "es" : "en";
      document.cookie = `lang=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((cur) => {
      const dark = cur ? cur === "dark" : systemDark();
      const next = dark ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch {}
      return next;
    });
  }, []);

  const t = useCallback(
    (key, vars = {}) =>
      (STRINGS[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""),
    [lang]
  );

  // Pick the right language from a record that has field_en / field_es (falls back to English).
  const pick = useCallback(
    (obj, field) => (lang === "es" && obj?.[`${field}_es`]) || obj?.[`${field}_en`] || "",
    [lang]
  );

  return (
    <PrefsContext.Provider value={{ lang, t, pick, toggleLang, toggleTheme }}>
      {children}
    </PrefsContext.Provider>
  );
}

export const usePrefs = () => useContext(PrefsContext);

export function useJson(url) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null });
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => live && setState({ data, error: null }))
      .catch((error) => live && setState({ data: null, error }));
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}

export const imgUrl = (photo) => `/api/img/${photo.id}.svg`;
export const studentPath = (slug) => `/estudiantes/${slug}`;
