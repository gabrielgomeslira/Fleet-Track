import type { ComponentType } from 'react'
import {
  Movement,
  PauseOutline,
  Tools,
  Time,
  DeliveryTruck,
  CheckmarkOutline,
  CloseOutline,
  CheckmarkFilled,
  MisuseOutline,
  WarningAlt,
} from '@carbon/icons-react'

export type CarbonTagType =
  | 'red'
  | 'magenta'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'gray'
  | 'cool-gray'
  | 'warm-gray'
  | 'high-contrast'

export interface StatusConfig {
  label: string
  tagType: CarbonTagType
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  className?: string
  chartColor?: string
  mapMarkerColor?: string
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  em_rota: {
    label: 'Em Rota',
    tagType: 'cyan',
    icon: Movement,
    chartColor: 'var(--ft-chart-enroute)',
    mapMarkerColor: 'var(--ft-map-marker-enroute)',
  },
  parado: {
    label: 'Parado',
    tagType: 'gray',
    className: 'ft-tag--parado',
    icon: PauseOutline,
    chartColor: 'var(--ft-chart-stopped)',
    mapMarkerColor: 'var(--ft-map-marker-stopped)',
  },
  manutencao: {
    label: 'Manutenção',
    tagType: 'red',
    icon: Tools,
    chartColor: 'var(--ft-chart-maintenance)',
    mapMarkerColor: 'var(--ft-map-marker-maintenance)',
  },
  pendente: {
    label: 'Pendente',
    tagType: 'purple',
    icon: Time,
  },
  em_transito: {
    label: 'Em Trânsito',
    tagType: 'cyan',
    icon: DeliveryTruck,
  },
  entregue: {
    label: 'Entregue',
    tagType: 'green',
    icon: CheckmarkOutline,
  },
  cancelado: {
    label: 'Cancelado',
    tagType: 'red',
    icon: CloseOutline,
  },
  ativa: {
    label: 'Ativa',
    tagType: 'green',
    icon: CheckmarkFilled,
  },
  revogada: {
    label: 'Revogada',
    tagType: 'red',
    icon: MisuseOutline,
  },
  'cadastro:escrever': {
    label: 'Dado Pessoal',
    tagType: 'magenta',
    icon: WarningAlt,
  },
}

/**
 * Obtém a configuração visual de um status operacional (rótulo, tagType Carbon, ícone e cores).
 * Valor desconhecido retorna rótulo cru, type="gray" e ícone genérico sem lançar erro.
 */
export function getStatusConfig(status?: string | null): StatusConfig {
  if (!status) {
    return {
      label: '',
      tagType: 'gray',
      icon: WarningAlt,
    }
  }

  const normalizado = status.trim().toLowerCase()
  if (normalizado in STATUS_CONFIG) {
    return STATUS_CONFIG[normalizado]
  }

  return {
    label: status,
    tagType: 'gray',
    icon: WarningAlt,
  }
}
