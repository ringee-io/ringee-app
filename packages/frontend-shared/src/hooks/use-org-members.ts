"use client";

import * as React from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { useApi } from "./use.api";

export interface OrgMember {
  /** The Ringee (DB) user id — what the API takes. */
  id: string;
  /** Full name, else the Clerk identifier (an email), else `null`. */
  name: string | null;
  imageUrl: string | null;
  /** The signed-in user. */
  isCurrentUser: boolean;
}

/**
 * The active organization's members with their Ringee user ids: Clerk lists
 * the memberships, `/user/by-clerk-ids` maps them to DB ids. Members whose DB
 * user cannot be resolved yet are left out. Empty outside an organization.
 */
export function useOrgMembers(): { members: OrgMember[]; isLoaded: boolean } {
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { user } = useUser();
  const currentClerkId = user?.id ?? null;
  const api = useApi();
  const [members, setMembers] = React.useState<OrgMember[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!isOrgLoaded) return;
    if (!organization) {
      setMembers([]);
      setIsLoaded(true);
      return;
    }
    let active = true;
    organization
      .getMemberships()
      .then(async (res) => {
        const clerkIds = res.data
          .map((m) => m.publicUserData?.userId)
          .filter(Boolean) as string[];
        if (clerkIds.length === 0) return [];
        const map = await api.get<{ clerkId: string; id: string }[]>(
          `/user/by-clerk-ids?ids=${clerkIds.join(",")}`,
        );
        const lookup = new Map(map.map((u) => [u.clerkId, u.id]));
        return res.data
          .map((m) => {
            const clerkId = m.publicUserData?.userId || "";
            const name =
              `${m.publicUserData?.firstName || ""} ${
                m.publicUserData?.lastName || ""
              }`.trim() ||
              m.publicUserData?.identifier ||
              null;
            return {
              id: lookup.get(clerkId) || "",
              name,
              imageUrl: m.publicUserData?.imageUrl || null,
              isCurrentUser: !!clerkId && clerkId === currentClerkId,
            };
          })
          .filter((m) => m.id);
      })
      .then((resolved) => {
        if (active) setMembers(resolved);
      })
      .catch(() => {
        if (active) setMembers([]);
      })
      .finally(() => {
        if (active) setIsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [isOrgLoaded, organization, api, currentClerkId]);

  return { members, isLoaded };
}
