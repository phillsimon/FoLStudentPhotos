import { Link } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";

export default function NotFound() {
  const { t } = usePrefs();
  return (
    <p className="status">
      {t("notFound")} <Link to="/">{t("home")}</Link>
    </p>
  );
}
