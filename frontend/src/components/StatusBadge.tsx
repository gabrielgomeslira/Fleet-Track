import { Tag } from '@carbon/react'
import { getStatusConfig } from '../status'

interface StatusBadgeProps {
  status?: string | null
  className?: string
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status)
  const combinedClassName = [config.className, className].filter(Boolean).join(' ') || undefined
  const Icon = config.icon

  return (
    <Tag type={config.tagType} size="sm" className={combinedClassName}>
      {Icon && (
        <Icon
          size={12}
          className="cds--tag__custom-icon"
          aria-hidden={true}
          style={{ marginRight: '0.25rem' }}
        />
      )}
      {config.label}
    </Tag>
  )
}
