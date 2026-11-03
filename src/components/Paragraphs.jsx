// Every line break typed in an editor becomes a paragraph break.
export default function Paragraphs({ text }) {
  return (text || "")
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line, i) => <p key={i}>{line}</p>);
}
