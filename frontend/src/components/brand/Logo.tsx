import type { SVGProps } from 'react'
import Simbolo from './Simbolo'

export interface LogoProps extends SVGProps<SVGSVGElement> {
  compact?: boolean
}

export function Logo({
  compact = false,
  role = 'img',
  'aria-label': ariaLabel = 'FleetTrack',
  width,
  height,
  style,
  ...props
}: LogoProps) {
  if (compact) {
    return (
      <Simbolo
        role={role}
        aria-label={ariaLabel}
        width={width ?? 32}
        height={height ?? 32}
        style={style}
        {...props}
      />
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 32"
      width={width ?? 180}
      height={height ?? 32}
      fill="none"
      role={role}
      aria-label={ariaLabel}
      style={{ color: 'var(--cds-text-primary)', ...style }}
      {...props}
    >
      <g transform="translate(0, 0)">
        <rect width="32" height="32" fill="var(--ft-brand-mark)" />
        <path
          d="M16 6 L25 15 L20.5 15 L16 10.5 L11.5 15 L7 15 L16 6 Z"
          fill="var(--cds-text-on-color, white)"
        />
        <path
          d="M16 14 L23 21 L19.5 21 L16 17.5 L12.5 21 L9 21 L16 14 Z"
          fill="var(--cds-text-on-color, white)"
          fillOpacity={0.75}
        />
        <rect x="14" y="23" width="4" height="4" fill="var(--cds-text-on-color, white)" />
      </g>

      <g transform="translate(42, 22)">
        <text
          fontFamily="'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontSize="19"
          fontWeight="600"
          letterSpacing="-0.02em"
          fill="currentColor"
          className="cds-logo-text-fleet"
        >
          Fleet
        </text>
        <text
          x="46"
          fontFamily="'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontSize="19"
          fontWeight="400"
          letterSpacing="-0.01em"
          fill="var(--cds-link-primary)"
          className="cds-logo-text-track"
        >
          Track
        </text>
      </g>
    </svg>
  )
}

export default Logo
