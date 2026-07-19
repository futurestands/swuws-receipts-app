import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CollectionStatus = 'draft' | 'validated' | 'active' | 'closed' | 'archived'

const STATUS_CONFIG: Record<CollectionStatus, { label: string, className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  validated: { label: 'Validated', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  active: { label: 'Open', className: 'bg-green-50 text-green-700 border-green-200' },
  closed: { label: 'Closed', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export function CollectionStatusBadge({ status, className }: { status: string, className?: string }) {
  const config = STATUS_CONFIG[status as CollectionStatus] || { label: status, className: '' }

  return (
    <Badge variant="outline" className={cn("capitalize px-2 py-0.5 font-medium", config.className, className)}>
      {config.label}
    </Badge>
  )
}
