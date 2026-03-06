interface Capabilities {
  sms: boolean;
  hdVoice: boolean;
  internationalSms: boolean;
  emergency: boolean;
  mms: boolean;
  voice: boolean;
  fax: boolean;
}

export type NumberCapability = keyof Capabilities;

export interface CostInformation {
  currency: "USD";
  monthlyCost: number;
  upfrontCost: number;
}

export interface AvailableNumber {
  phoneNumber: string;
  countryCode: string;
  locality?: string;
  region?: string;
  numberType?: string;
  capabilities: Capabilities;
  costInformation: CostInformation;
}

export interface AssignedNumber {
  id: string;
  status: string;
  phoneNumber: string;
  phoneNumberType: string;
  countryCode: string;
  connectionId: string;
  connectionName: string;
  billingGroupId: string;
}

export interface PurchaseNumbers {
  billingGroupId: string;
  orderId: string;
  phoneNumbersCount: number;
  status: string;
  provider: string;
  phoneNumbers: {
    id: string;
    status: string;
    phoneNumber: string;
    phoneNumberType: string;
    countryCode: string;
    requirementsStatus: string;
    requirementsMet: boolean;
    connectionId: string;
    connectionName: string;
    billingGroupId: string;
  }[];
}

export interface SearchAvailableParams {
  countryCode: string; // ISO (eg. "US")
  areaCode?: string; // ejemplo: "415"
  numberType?: "local" | "toll_free" | "mobile";
  limit?: number;
}
