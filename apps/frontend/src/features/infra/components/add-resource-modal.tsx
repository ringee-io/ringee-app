'use client';

import type { InfrastructureResourceType } from '../types';
import type { OnResourceCreated } from '../lib/node-config';
import { CreateTeamMemberFlow } from './create-team-member-flow';
import { CreatePhoneNumberFlow } from './create-phone-number-flow';
import { CreateSipDeviceFlow } from './create-sip-device-flow';
import { CreateCampaignFlow } from './create-campaign-flow';
import { LinkExistingResourceModal } from './link-existing-resource-modal';

/**
 * Routes a canvas "add" intent to the right surface: a native create flow for
 * each buildable resource type, or the link-existing picker when `type` is null
 * (or a type without a native flow yet).
 */
export function AddResourceModal({
  open,
  type,
  position,
  hasOrg,
  onClose,
  onCreated,
  onLinked
}: {
  open: boolean;
  type: InfrastructureResourceType | null;
  position: { x: number; y: number } | null;
  hasOrg: boolean;
  onClose: () => void;
  onCreated: OnResourceCreated;
  onLinked: (resourceIds: string[]) => void;
}) {
  const shared = { open, position, onClose };

  switch (type) {
    case 'TEAM_MEMBER':
      return <CreateTeamMemberFlow {...shared} onCreated={onCreated} />;
    case 'PHONE_NUMBER':
      return <CreatePhoneNumberFlow {...shared} />;
    case 'SIP_DEVICE':
      return (
        <CreateSipDeviceFlow
          {...shared}
          hasOrg={hasOrg}
          onCreated={onCreated}
        />
      );
    case 'CAMPAIGN':
      return (
        <CreateCampaignFlow {...shared} hasOrg={hasOrg} onCreated={onCreated} />
      );
    default:
      return (
        <LinkExistingResourceModal
          open={open}
          type={type}
          position={position}
          onClose={onClose}
          onLinked={onLinked}
        />
      );
  }
}
