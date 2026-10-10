-- Working a contact list from the Call page (LIST-005).
--
-- "Call next" walks a list in `sequence` order once nothing in today's queue is
-- due. Two nullable columns record how far it got, per entry:
--
-- - `calledAt`: a call to the contact was found after it joined the list. The
--   list fills it in from the workspace's own calls, so the next lookup starts
--   past it.
-- - `skippedAt`: the person working the list skipped the contact; it goes to
--   the back of the list.
--
-- Additive only: two nullable columns with no default, a catalog-only change
-- that rewrites no row and holds its lock for a moment.

-- AlterTable
ALTER TABLE "ContactListEntry" ADD COLUMN     "calledAt" TIMESTAMP(3),
ADD COLUMN     "skippedAt" TIMESTAMP(3);
