// Draft translations with Workers AI. Each paragraph goes through separately so line breaks survive.
const MODEL = "@cf/meta/m2m100-1.2b";

export async function translate(env, text, source, target) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const r = await env.AI.run(MODEL, { text: line, source_lang: source, target_lang: target });
    out.push((r.translated_text || "").trim());
  }
  return out.join("\n");
}
