"use client"

import { formatDateTime } from "@/lib/format"
import { CheckCircle2, Clock, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface TimelineEvent {
  label: string
  timestamp?: Date | null
  userName?: string | null
  isCompleted: boolean
  isCurrent: boolean
}

export function CollectionLifecycleTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="space-y-4">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border shadow-sm",
              event.isCompleted ? "bg-primary border-primary text-primary-foreground" :
              event.isCurrent ? "bg-background border-primary text-primary" : "bg-muted border-muted text-muted-foreground"
            )}>
              {event.isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : event.isCurrent ? (
                <Clock className="h-4 w-4" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
            </div>
            {i < events.length - 1 && (
              <div className={cn(
                "w-px grow mt-1",
                event.isCompleted ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
          <div className="pb-4">
            <p className={cn(
              "text-sm font-semibold",
              event.isCurrent ? "text-primary" : event.isCompleted ? "text-foreground" : "text-muted-foreground"
            )}>
              {event.label}
            </p>
            {event.timestamp && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDateTime(event.timestamp)}
                {event.userName && ` by ${event.userName}`}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
