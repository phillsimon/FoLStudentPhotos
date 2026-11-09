import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../prefs.jsx";

// Phillip's uploader. Drop a Lightroom export folder (or pick files). Each photo is resized in the browser
// into a web version (2048 px) and a thumbnail (600 px), so the server never processes images.
// Re-encoding through a canvas drops all EXIF, including GPS, from the public versions.

const CONCURRENCY = 3;
const WARN_BYTES = 50 * 1024 * 1024;
const MAX_BYTES = 95 * 1024 * 1024;
const isImage = (f) => /^image\/(jpeg|png|webp|tiff|heic|heif)$/.test(f.type) || /\.(jpe?g|png|webp|tiff?)$/i.test(f.name);

// Folders dropped from Finder or Explorer arrive as entries; walk them for files.
async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      out.push(await new Promise((res, rej) => entry.file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries returns batches until it returns an empty list.
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

const textOf = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") return textOf(v.value ?? Object.values(v)[0]);
  return String(v);
};

async function readMeta(file) {
  try {
    const exifr = (await import("exifr")).default;
    const m = (await exifr.parse(file, { tiff: true, exif: true, xmp: true, iptc: true })) || {};
    const date = m.DateTimeOriginal || m.CreateDate;
    return {
      title: textOf(m.title || m.ObjectName || m.Headline).trim(),
      caption: textOf(m.description || m.Caption || m.ImageDescription).trim(),
      capture_date: date instanceof Date && !isNaN(date) ? date.toISOString() : null,
    };
  } catch {
    return { title: "", caption: "", capture_date: null };
  }
}

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: decode through an <img>, which also honors orientation.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function resize(source, longEdge, quality) {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, longEdge / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return c.convertToBlob({ type: "image/jpeg", quality });
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
}

async function sendPhoto(slug, file) {
  const [meta, bitmap] = await Promise.all([readMeta(file), loadBitmap(file)]);
  const [web, thumb] = [await resize(bitmap, 2048, 0.82), await resize(bitmap, 600, 0.78)];
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close?.();

  const form = new FormData();
  form.append("meta", JSON.stringify({ ...meta, filename: file.name, width, height }));
  form.append("original", file, file.name);
  form.append("web", web, "web.jpg");
  form.append("thumb", thumb, "thumb.jpg");
  const r = await fetch(`/api/admin/students/${slug}/photos`, { method: "POST", body: form });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "server_error");
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function Uploader({ slug, library, onUploaded }) {
  const { t } = usePrefs();
  const [items, setItems] = useState([]); // { key, file, state, error, warn }
  const [over, setOver] = useState(false);
  const running = useRef(0);
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const update = (key, patch) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const add = (files) => {
    const known = new Set([
      ...library.map((p) => `${p.filename}|${p.bytes}`),
      ...itemsRef.current.filter((i) => i.state !== "error").map((i) => `${i.file.name}|${i.file.size}`),
    ]);
    const fresh = [];
    for (const file of files) {
      if (!isImage(file)) continue;
      const id = `${file.name}|${file.size}`;
      const dupe = known.has(id);
      known.add(id);
      fresh.push({
        key: `${id}|${Math.random()}`,
        file,
        state: dupe ? "dupe" : file.size > MAX_BYTES ? "error" : "waiting",
        error: file.size > MAX_BYTES ? "too_big" : "",
        warn: file.size > WARN_BYTES,
      });
    }
    // Capture date order matches the server's default; filename order is close enough while uploading.
    fresh.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    setItems((cur) => [...cur, ...fresh]);
  };

  // Keep up to three uploads going at once.
  useEffect(() => {
    const waiting = items.filter((i) => i.state === "waiting");
    const free = CONCURRENCY - running.current;
    waiting.slice(0, Math.max(0, free)).forEach((item) => {
      running.current += 1;
      update(item.key, { state: "working" });
      sendPhoto(slug, item.file)
        .then(() => update(item.key, { state: "done" }))
        .catch((e) => update(item.key, e.message === "duplicate" ? { state: "dupe" } : { state: "error", error: e.message }))
        .finally(() => {
          running.current -= 1;
          // Refresh the library once the queue is empty, so new photos appear in the chooser.
          setItems((cur) => {
            if (!cur.some((i) => i.state === "waiting" || i.state === "working")) setTimeout(onUploaded, 0);
            return [...cur];
          });
        });
    });
  }, [items, slug, onUploaded]);

  const retry = () => setItems((cur) => cur.map((i) => (i.state === "error" && i.error !== "too_big" ? { ...i, state: "waiting", error: "" } : i)));

  const count = (s) => items.filter((i) => i.state === s).length;
  const done = count("done");
  const failed = count("error");
  const active = count("waiting") + count("working");

  return (
    <section className="uploader">
      <div
        className={`drop-zone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          add(await filesFromDrop(e.dataTransfer));
        }}
      >
        <p><strong>{t("dropPhotos")}</strong></p>
        <p className="dialog-hint">{t("dropPhotosHint")}</p>
        <button type="button" className="btn small" onClick={() => inputRef.current.click()}>{t("choosePhotoFiles")}</button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add([...e.target.files]);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <p className="upload-summary" aria-live="polite">
            {t("uploadSummary", { done, total: items.length - count("dupe") })}
            {count("dupe") > 0 && ` · ${t("uploadDupes", { n: count("dupe") })}`}
            {failed > 0 && ` · ${t("uploadFailed", { n: failed })}`}
            {failed > 0 && active === 0 && (
              <button type="button" className="btn small" onClick={retry}>{t("retryFailed")}</button>
            )}
          </p>
          <ul className="upload-list">
            {items.map((i) => (
              <li key={i.key} className={`up-${i.state}`}>
                <span className="up-name">{i.file.name}</span>
                <span className="up-size">{mb(i.file.size)}{i.warn && ` · ${t("bigFile")}`}</span>
                <span className="up-state">
                  {i.state === "error" ? t(`err_${i.error}`) === `err_${i.error}` ? t("err_server_error") : t(`err_${i.error}`) : t(`up_${i.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
