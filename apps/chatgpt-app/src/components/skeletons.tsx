import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders shaped like the real cards. Shown inside the widget
 * while a tool runs and the host hasn't delivered `toolOutput` yet — so users
 * see a faithful skeleton, never stale mock data.
 */

/** Skeleton for a single contact (get/create/update_contact). */
export function ContactCardSkeleton() {
  return (
    <Card className="w-full max-w-md overflow-hidden" aria-busy="true">
      <CardHeader>
        <Skeleton className="size-11 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </CardContent>
      <CardFooter className="gap-2">
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </CardFooter>
    </Card>
  );
}

function Row() {
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Skeleton className="size-9 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-8 rounded-md" />
    </li>
  );
}

/** Skeleton for a paginated list (search_contacts, search_leads). */
export function ListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="w-full max-w-lg overflow-hidden" aria-busy="true">
      <CardHeader className="flex-col items-stretch gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </CardHeader>
      <ul className="divide-y border-t">
        {Array.from({ length: rows }).map((_, i) => (
          <Row key={i} />
        ))}
      </ul>
    </Card>
  );
}

/** Generic compact card skeleton (call session, callback, meeting, outcome). */
export function GenericCardSkeleton() {
  return (
    <Card className="w-full max-w-md overflow-hidden" aria-busy="true">
      <CardHeader>
        <Skeleton className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </CardContent>
    </Card>
  );
}
