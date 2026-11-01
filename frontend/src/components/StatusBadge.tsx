import { Tag } from '@carbon/react'
import { getStatusConfig } from '../status'

interface StatusBadgeProps {
  status?: string | null
  className?: string
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = getStatusConfig(status)
  const combinedClassName = [config.className, className].filter(Boolean).join(' ') || undefined

  return (
    <Tag type={config.tagType} renderIcon={config.icon} size="sm" className={combinedClassName}>
      {config.label}
    </Tag>
  )
}
