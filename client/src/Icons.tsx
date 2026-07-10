/**
 * Vector Icon Set — minimal inline SVGs.
 * Stroke-based, 16×16 viewBox, strokeWidth 1.75.
 * Zero runtime dependencies.
 */

interface IconProps {
  size?: number;
}

const svgStyle = (size: number): React.CSSProperties => ({
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
  width: size,
  height: size,
});

const SVG = ({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={svgStyle(size)}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Copy = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <rect x="5" y="5" width="8" height="8" rx="1" />
    <path d="M3 11V3h8" />
  </SVG>
);

export const Check = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <polyline points="2.5,8.5 6,12 13.5,4" />
  </SVG>
);

export const Users = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <circle cx="5.5" cy="5" r="2.25" />
    <path d="M1 13c0-2.5 2-4 4.5-4" />
    <circle cx="10.5" cy="5" r="2.25" />
    <path d="M15 13c0-2.5-2-4-4.5-4" />
  </SVG>
);

export const Zap = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <polygon points="9,2 2,9 8,9 7,14 14,7 8,7" />
  </SVG>
);

export const WifiOff = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <line x1="2" y1="2" x2="14" y2="14" />
    <path d="M8 13h.01" />
    <path d="M5.5 10.5A5 5 0 0 1 11 9" />
    <path d="M2.5 7.5A9 9 0 0 1 8 6" />
  </SVG>
);

export const Wifi = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <path d="M5.5 10.5a3.5 3.5 0 0 1 5 0" />
    <path d="M2.5 7.5a7 7 0 0 1 11 0" />
    <circle cx="8" cy="13" r="0.75" fill="currentColor" />
  </SVG>
);

export const Plus = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <line x1="8" y1="3" x2="8" y2="13" />
    <line x1="3" y1="8" x2="13" y2="8" />
  </SVG>
);

export const X = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </SVG>
);

export const RefreshCw = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <polyline points="14,2 14,6 10,6" />
    <path d="M14 6A6 6 0 1 0 9.5 13.5" />
  </SVG>
);

export const Monitor = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <rect x="1" y="2" width="14" height="10" rx="1" />
    <line x1="5.5" y1="14" x2="10.5" y2="14" />
    <line x1="8" y1="12" x2="8" y2="14" />
  </SVG>
);

export const EyeOff = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <line x1="2" y1="2" x2="14" y2="14" />
    <path d="M6.5 6.5A3 3 0 0 0 9.5 9.5" />
    <path d="M4 4C2.8 5 2 6.4 2 8c1.5 3 3.5 5 6 5 1.2 0 2.3-.4 3.2-1" />
    <path d="M10 4.4C11.5 5.3 13 6.6 14 8c-.8 1.9-2 3.4-3.5 4.2" />
  </SVG>
);

export const LogOut = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <path d="M10 8H3" />
    <polyline points="6,5 3,8 6,11" />
    <path d="M6 3h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6" />
  </SVG>
);

export const MapIcon = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <polygon points="1,3 6,1 10,3 15,1 15,13 10,15 6,13 1,15" />
    <line x1="6" y1="1" x2="6" y2="13" />
    <line x1="10" y1="3" x2="10" y2="15" />
  </SVG>
);

export const Share = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <path d="M2.5 8v5.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8" />
    <line x1="8" y1="1.5" x2="8" y2="11.5" />
    <polyline points="4.5,5 8,1.5 11.5,5" />
  </SVG>
);

export const Download = ({ size = 16 }: IconProps) => (
  <SVG size={size}>
    <path d="M2.5 8v5.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8" />
    <line x1="8" y1="11.5" x2="8" y2="1.5" />
    <polyline points="4.5,8 8,11.5 11.5,8" />
  </SVG>
);
