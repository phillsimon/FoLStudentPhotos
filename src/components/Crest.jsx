// Manantial de Vida crest (from the school's logo). The crest text stays in Spanish in both languages.
export default function Crest({ className }) {
  return (
    <svg className={className} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <path id="crestTop" d="M 50,200 A 150,150 0 0,1 350,200" />
        <path id="crestBot" d="M 28,200 A 172,172 0 0,0 372,200" />
      </defs>
      <circle cx="200" cy="200" r="192" fill="#FFFFFF" />
      <circle cx="200" cy="200" r="186" fill="#2B8BD2" />
      <circle cx="200" cy="200" r="133" fill="#FFFFFF" />
      <circle cx="200" cy="200" r="122" fill="#23317A" />
      <circle cx="200" cy="200" r="118" fill="#3A78C2" />
      <polygon points="270,200 235,260.6 165,260.6 130,200 165,139.4 235,139.4" fill="#A9D4F2" />
      <g stroke="#23317A" strokeWidth="3.5" strokeLinecap="round">
        <line x1="270" y1="200" x2="202.1" y2="318" />
        <line x1="235" y1="260.6" x2="98.9" y2="260.8" />
        <line x1="165" y1="260.6" x2="96.8" y2="142.8" />
        <line x1="130" y1="200" x2="197.9" y2="82" />
        <line x1="165" y1="139.4" x2="301.1" y2="139.2" />
        <line x1="235" y1="139.4" x2="303.2" y2="257.2" />
      </g>
      <polygon points="92,214 200,240 308,214 308,226 200,254 92,226" fill="#23317A" />
      <polygon points="200,240 92,214 122,160 200,184" fill="#FFFFFF" stroke="#23317A" strokeWidth="3" strokeLinejoin="round" />
      <polygon points="200,240 308,214 278,160 200,184" fill="#FFFFFF" stroke="#23317A" strokeWidth="3" strokeLinejoin="round" />
      <g stroke="#8EC0E6" strokeWidth="3" strokeLinecap="round">
        <line x1="118" y1="175" x2="194" y2="198" />
        <line x1="111" y1="189" x2="194" y2="212" />
        <line x1="282" y1="175" x2="206" y2="198" />
        <line x1="289" y1="189" x2="206" y2="212" />
      </g>
      <text fontFamily="Nunito, system-ui, sans-serif" fontWeight="900" fontSize="31" letterSpacing="2" fill="#FFFFFF">
        <textPath href="#crestTop" startOffset="50%" textAnchor="middle">MANANTIAL DE VIDA</textPath>
      </text>
      <text fontFamily="Nunito, system-ui, sans-serif" fontWeight="900" fontSize="26" letterSpacing="2.5" fill="#FFFFFF">
        <textPath href="#crestBot" startOffset="50%" textAnchor="middle">GALERÍA DE FOTOS</textPath>
      </text>
      <circle cx="35" cy="200" r="7" fill="#D9332B" />
      <circle cx="365" cy="200" r="7" fill="#D9332B" />
    </svg>
  );
}
