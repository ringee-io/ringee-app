import {
  AssignedNumber,
  AvailableNumber,
  PurchaseNumbers,
  SearchAvailableParams,
} from "./available.number";

export interface TelephonyNumbersService {
  searchAvailableNumbers(
    params: SearchAvailableParams,
  ): Promise<AvailableNumber[]>;
  purchaseNumbers(phoneNumbers: string[]): Promise<PurchaseNumbers>;
  assignNumberToConnection(
    phoneNumber: string,
    connectionId?: string,
  ): Promise<AssignedNumber>;
}
