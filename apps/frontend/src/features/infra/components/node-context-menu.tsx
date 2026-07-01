'use client';

import {
  IconSettings,
  IconRoute,
  IconUsers,
  IconPhone,
  IconKey,
  IconWifi,
  IconChartBar,
  IconHistory,
  IconPencil,
  IconEyeOff,
  IconTrash,
  IconPlayerPlay,
  IconPlayerPause,
  IconRefresh
} from '@tabler/icons-react';
import {
  FloatingMenu,
  MenuItem,
  MenuLabel,
  MenuSeparator
} from './floating-menu';
import {
  RESOURCE_META,
  getNodeActions,
  type NodeActionKey
} from '../lib/node-config';
import type { InfraNode } from '../types';

const ACTION_ICON: Record<
  NodeActionKey,
  React.ComponentType<{ className?: string }>
> = {
  configure: IconSettings,
  routing: IconRoute,
  agents: IconUsers,
  numbers: IconPhone,
  credentials: IconKey,
  registration: IconWifi,
  usage: IconChartBar,
  logs: IconHistory,
  rename: IconPencil,
  remove: IconEyeOff,
  delete: IconTrash,
  release: IconTrash,
  start: IconPlayerPlay,
  pause: IconPlayerPause,
  regenerate: IconRefresh
};

export function NodeContextMenu({
  x,
  y,
  node,
  hasOrg,
  onAction,
  onClose
}: {
  x: number;
  y: number;
  node: InfraNode;
  hasOrg: boolean;
  onAction: (key: NodeActionKey) => void;
  onClose: () => void;
}) {
  const actions = getNodeActions(node.type, { hasOrg });
  // First danger action starts the "destructive" group (rendered after a rule).
  const firstDangerIndex = actions.findIndex((a) => a.danger);

  return (
    <FloatingMenu x={x} y={y} onClose={onClose}>
      <MenuLabel>
        {!hasOrg && node.type === 'TEAM_MEMBER'
          ? 'Personal profile'
          : RESOURCE_META[node.type].label}
      </MenuLabel>
      {actions.map((action, i) => {
        const Icon = ACTION_ICON[action.key];
        return (
          <div key={`${action.key}-${i}`}>
            {firstDangerIndex >= 0 && i === firstDangerIndex ? (
              <MenuSeparator />
            ) : null}
            <MenuItem
              danger={action.danger}
              onClick={() => {
                onAction(action.key);
                onClose();
              }}
            >
              <Icon className='size-4' />
              {action.label}
            </MenuItem>
          </div>
        );
      })}
    </FloatingMenu>
  );
}
