export type RotationStrategy = 'local_presence' | 'balanced';

export interface RotationSettings {
  enabled: boolean;
  strategy: RotationStrategy;
  defaultDailyCap: number;
}

export type RotationStatus = 'active' | 'cooling' | 'flagged' | 'disabled';

export interface PoolMember {
  numberId: string;
  phoneNumber: string;
  isoCountry: string;
  kind: string;
  areaCode: string | null;
  rotationStatus: RotationStatus;
  participating: boolean;
  dailyCap: number;
  dailyCapOverride: number | null;
  usedToday: number;
  healthScore: number;
  lastUsedAt: string | null;
  coolingUntil: string | null;
}

export interface NumberReportRow {
  numberId: string;
  phoneNumber: string;
  isoCountry: string;
  rotationStatus: RotationStatus;
  healthScore: number;
  calls: number;
  answered: number;
  shortCalls: number;
  answerRate: number;
}

export interface UpdatePoolMemberPatch {
  participating?: boolean;
  dailyCap?: number | null;
  status?: 'active' | 'disabled';
}
