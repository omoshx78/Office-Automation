// Original illustration — not a photograph, so there's no stock-photo
// licensing question and nothing to hotlink from an external host.
// A duotone skyline (the "office/corporate" half of the brief) with a
// faint connected-node pattern above it (the "team/automation" half),
// tied together by the sky-to-navy gradient.

export default function SkylineArt({ style }) {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMax slice"
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    >
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A2E4D" />
          <stop offset="55%" stopColor="#15507F" />
          <stop offset="100%" stopColor="#2E86C1" />
        </linearGradient>
        <linearGradient id="buildingGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08243B" />
          <stop offset="100%" stopColor="#0A2E4D" />
        </linearGradient>
      </defs>

      <rect width="800" height="600" fill="url(#skyGrad)" />

      {/* Faint collaboration-network nodes, upper half */}
      <g stroke="#7FC1E8" strokeWidth="1" opacity="0.35">
        <line x1="90" y1="120" x2="220" y2="80" />
        <line x1="220" y1="80" x2="340" y2="150" />
        <line x1="340" y1="150" x2="500" y2="70" />
        <line x1="500" y1="70" x2="640" y2="130" />
        <line x1="220" y1="80" x2="120" y2="60" />
        <line x1="500" y1="70" x2="620" y2="40" />
        <line x1="340" y1="150" x2="420" y2="220" />
      </g>
      <g fill="#BEE1F5" opacity="0.8">
        <circle cx="90" cy="120" r="4" />
        <circle cx="220" cy="80" r="5" />
        <circle cx="340" cy="150" r="4" />
        <circle cx="500" cy="70" r="5" />
        <circle cx="640" cy="130" r="4" />
        <circle cx="120" cy="60" r="3" />
        <circle cx="620" cy="40" r="3" />
        <circle cx="420" cy="220" r="3" />
      </g>

      {/* Skyline silhouette */}
      <g fill="url(#buildingGrad)">
        <rect x="40" y="330" width="70" height="270" />
        <rect x="120" y="260" width="55" height="340" />
        <rect x="185" y="380" width="50" height="220" />
        <rect x="245" y="200" width="80" height="400" />
        <rect x="335" y="300" width="60" height="300" />
        <rect x="405" y="250" width="45" height="350" />
        <rect x="460" y="340" width="70" height="260" />
        <rect x="540" y="180" width="85" height="420" />
        <rect x="635" y="290" width="55" height="310" />
        <rect x="700" y="240" width="65" height="360" />
      </g>

      {/* Window lights, sparse and irregular for realism */}
      <g fill="#F4D58D" opacity="0.7">
        {[
          [55, 360], [55, 400], [55, 440], [80, 380], [80, 420],
          [135, 300], [135, 340], [135, 380], [155, 320], [155, 400],
          [260, 240], [260, 280], [285, 260], [285, 340], [300, 400],
          [420, 290], [420, 330], [420, 400],
          [555, 220], [555, 280], [580, 250], [580, 340], [595, 400],
          [650, 330], [650, 380], [715, 280], [715, 340],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="6" height="8" />
        ))}
      </g>

      {/* Beacon light on the tallest tower */}
      <circle cx="582" cy="180" r="4" fill="#F4D58D">
        <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
