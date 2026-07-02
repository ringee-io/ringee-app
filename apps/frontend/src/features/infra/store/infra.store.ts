import { create } from 'zustand';
import type { InspectorTab } from '../lib/node-config';
import type { InfrastructureResourceType, SipCredentials } from '../types';

/**
 * A request to open a create/link surface, raised from outside the canvas (the
 * topbar "Add resource" button). `type: null` opens the link-existing picker.
 */
export interface AddRequest {
  type: InfrastructureResourceType | null;
}

export interface CanvasMenuState {
  kind: 'pane' | 'node';
  /** Screen coordinates where the menu opens. */
  x: number;
  y: number;
  /** Flow coordinates (for pane menu → where a new node should land). */
  flowX: number;
  flowY: number;
  nodeId?: string;
}

/**
 * The edge currently hovered on the canvas, held here (not in the node/edge
 * arrays) so hovering restyles the custom edge and highlights its two endpoint
 * nodes without rebuilding the whole graph on every mouse move.
 */
export interface HoveredEdge {
  id: string;
  source: string;
  target: string;
}

interface InfraStore {
  selectedNodeId: string | null;
  inspectorTab: InspectorTab;
  menu: CanvasMenuState | null;
  /**
   * True from the moment the workspace switcher is clicked until the canvas has
   * reloaded the new context. Lets the canvas show its loading overlay instantly
   * (before Clerk's active-org change has propagated to `orgId`).
   */
  contextSwitching: boolean;
  /**
   * One-time SIP credentials keyed by resource id. The provider only returns a
   * device's password at creation/regeneration, so we hold it in memory for the
   * Credentials tab and never persist or refetch it.
   */
  credentialsByResource: Record<string, SipCredentials>;
  /** Set by the topbar "Add resource" button; consumed + cleared by the canvas. */
  addRequest: AddRequest | null;
  /** Edge under the cursor — drives edge/endpoint hover highlight (see above). */
  hoveredEdge: HoveredEdge | null;
  /**
   * A node the canvas should select + reveal once its overview has loaded. Set
   * from the Usage view (health rows) before navigating to /infra/overview;
   * survives the per-context reset so the deep-link isn't wiped on load.
   */
  focusNodeId: string | null;

  select: (nodeId: string, tab?: InspectorTab) => void;
  closeInspector: () => void;
  setTab: (tab: InspectorTab) => void;
  openMenu: (menu: CanvasMenuState) => void;
  closeMenu: () => void;
  setCredentials: (resourceId: string, credentials: SipCredentials) => void;
  setContextSwitching: (switching: boolean) => void;
  requestAdd: (type: InfrastructureResourceType | null) => void;
  clearAddRequest: () => void;
  setHoveredEdge: (edge: HoveredEdge | null) => void;
  setFocusNode: (nodeId: string | null) => void;
  /**
   * Wipe all canvas-local UI state when the active workspace changes, so a
   * resource from the previous context never lingers in the inspector/menu and
   * one-time SIP credentials don't leak across workspaces.
   */
  resetForContext: () => void;
}

export const useInfraStore = create<InfraStore>((set) => ({
  selectedNodeId: null,
  inspectorTab: 'overview',
  menu: null,
  contextSwitching: false,
  credentialsByResource: {},
  addRequest: null,
  hoveredEdge: null,
  focusNodeId: null,

  select: (nodeId, tab = 'overview') =>
    set({ selectedNodeId: nodeId, inspectorTab: tab }),
  closeInspector: () => set({ selectedNodeId: null }),
  setTab: (tab) => set({ inspectorTab: tab }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  setCredentials: (resourceId, credentials) =>
    set((s) => ({
      credentialsByResource: {
        ...s.credentialsByResource,
        [resourceId]: credentials
      }
    })),
  setContextSwitching: (switching) => set({ contextSwitching: switching }),
  requestAdd: (type) => set({ addRequest: { type } }),
  clearAddRequest: () => set({ addRequest: null }),
  setHoveredEdge: (edge) => set({ hoveredEdge: edge }),
  setFocusNode: (nodeId) => set({ focusNodeId: nodeId }),
  resetForContext: () =>
    set({
      selectedNodeId: null,
      inspectorTab: 'overview',
      menu: null,
      credentialsByResource: {},
      addRequest: null,
      hoveredEdge: null
    })
}));
