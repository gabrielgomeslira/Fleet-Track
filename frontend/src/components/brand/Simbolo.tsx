import type { SVGProps } from 'react'

export interface SimboloProps extends SVGProps<SVGSVGElement> {
  compact?: boolean
}

export function Simbolo({
  role = 'img',
  'aria-label': ariaLabel = 'FleetTrack',
  width = 32,
  height = 32,
  ...props
}: SimboloProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={width}
      height={height}
      fill="none"
      role={role}
      aria-label={ariaLabel}
      {...props}
    >
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
    </svg>
  )
}

export default Simbolo
