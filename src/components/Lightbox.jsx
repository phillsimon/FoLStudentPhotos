import { useEffect, useRef, useState } from "react";
import { usePrefs, imgUrl } from "../prefs.jsx";

const SLIDE_MS = 4000;

export default function Lightbox({ photos, index, name, onGo, onClose }) {
  const { t } = usePrefs();
  const [playing, setPlaying] = useState(false);
  const dialogRef = useRef(null);
  const touchX = useRef(null);
  const photo = photos[index];
  const count = photos.length;

  const prev = () => onGo(photos[(index - 1 + count) % count].id);
  const next = () => onGo(photos[(index + 1) % count].id);

  // Keyboard: arrows, Escape, and keep Tab focus inside the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
      else if (e.key === "Tab") {
        const els = dialogRef.current.querySelectorAll("button");
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Lock page scroll and move focus into the dialog; restore both on close.
  useEffect(() => {
    const before = document.activeElement;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector(".lb-close")?.focus();
    return () => {
      document.body.style.overflow = "";
      before?.focus?.();
    };
  }, []);

  // Preload neighbours.
  useEffect(() => {
    [photos[(index + 1) % count], photos[(index - 1 + count) % count]].forEach((p) => {
      const img = new Image();
      img.src = imgUrl(p);
    });
  }, [index, photos, count]);

  // Slideshow.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(next, SLIDE_MS);
    return () => clearTimeout(id);
  }, [playing, index]);

  const onTouchStart = (e) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
    touchX.current = null;
  };

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("photoBy", { name })}
      ref={dialogRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lb-top">
        <span className="lb-count">{index + 1} / {count}</span>
        <div className="lb-top-actions">
          <button className="lb-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t("pause") : t("play")}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="lb-btn lb-close" onClick={onClose} aria-label={t("close")}>✕</button>
        </div>
      </div>

      <button className="lb-arrow lb-prev" onClick={prev} aria-label={t("previous")}>‹</button>
      <figure className="lb-figure" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img key={photo.id} src={imgUrl(photo)} alt={photo.title || photo.caption || t("photoBy", { name })} />
        {(photo.title || photo.caption) && (
          <figcaption>
            {photo.title && <strong>{photo.title}</strong>}
            {photo.caption && <span>{photo.caption}</span>}
          </figcaption>
        )}
      </figure>
      <button className="lb-arrow lb-next" onClick={next} aria-label={t("next")}>›</button>
    </div>
  );
}
