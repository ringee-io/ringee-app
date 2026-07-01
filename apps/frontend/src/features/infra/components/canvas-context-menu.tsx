'use client';

import { IconLink, IconFocus2 } from '@tabler/icons-react';
import {
  FloatingMenu,
  MenuItem,
  MenuLabel,
  MenuSeparator
} from './floating-menu';
import { RESOURCE_META, addResourceOptions } from '../lib/node-config';
import type { InfrastructureResourceType } from '../types';

export function CanvasContextMenu({
  x,
  y,
  hasOrg,
  onAdd,
  onLink,
  onFitView,
  onClose
}: {
  x: number;
  y: number;
  hasOrg: boolean;
  onAdd: (type: InfrastructureResourceType) => void;
  onLink: () => void;
  onFitView: () => void;
  onClose: () => void;
}) {
  const add = (type: InfrastructureResourceType) => {
    onAdd(type);
    onClose();
  };
  const options = addResourceOptions(hasOrg);

  return (
    <FloatingMenu x={x} y={y} onClose={onClose}>
      <MenuLabel>Add resource</MenuLabel>
      {options.map((opt) => {
        const Icon = RESOURCE_META[opt.type].Icon;
        return (
          <MenuItem key={opt.type} onClick={() => add(opt.type)}>
            <Icon className='size-4' />
            {opt.label}
          </MenuItem>
        );
      })}
      <MenuSeparator />
      <MenuItem
        onClick={() => {
          onLink();
          onClose();
        }}
      >
        <IconLink className='size-4' />
        Link existing resource
      </MenuItem>
      <MenuItem
        onClick={() => {
          onFitView();
          onClose();
        }}
      >
        <IconFocus2 className='size-4' />
        Fit view
      </MenuItem>
    </FloatingMenu>
  );
}
