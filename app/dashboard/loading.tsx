import { LoadingState } from "@/components/ui/empty-state"

/**
 * Fallback loading UI for any /dashboard/* route that doesn't define its
 * own more specific loading.tsx. Next.js only shows a route's own loading
 * state, or the nearest ancestor's if none exists — before this, every
 * dashboard page except /dashboard/customers had neither, so clicking a
 * nav link into a page with server-side data fetching (which is most of
 * them) showed nothing at all until the page was fully ready. With
 * multiple Promise.all-backed queries on some pages, that gap was easily
 * long enough to look frozen rather than "in progress."
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <LoadingState variant="cards" />
    </div>
  )
}
