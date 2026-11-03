import { useEffect, useRef } from "react";

// The pop-up shell. Esc and clicks outside don't close it, so nobody loses what they typed by accident.
export default function EditDialog({ title, onClose, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`edit-dialog${wide ? " wide" : ""}`} onCancel={(e) => e.preventDefault()} onClose={onClose}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export function TextField({ label, value, onChange, max, rows, lang, hint, disabled }) {
  const over = max && value.length > max;
  const props = { value, lang, disabled, onChange: (e) => onChange(e.target.value) };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {rows ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />}
      {(hint || max) && (
        <span className="field-foot">
          <span>{hint}</span>
          {max && <span className={over ? "over" : ""}>{value.length} / {max}</span>}
        </span>
      )}
    </label>
  );
}
