/** Shapes of `/api/contact-lists` (`ContactListService`). */

export interface ContactListPerson {
  id: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

/** What the caller may do with a list — decided and enforced by the server. */
export interface ContactListPermissions {
  canManage: boolean;
  canAddContacts: boolean;
  canAssign: boolean;
}

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: ContactListPerson;
  /** Null only once the person it was assigned to no longer exists. */
  assignedTo: ContactListPerson | null;
  permissions: ContactListPermissions;
}

export interface ContactListContact {
  /** The contact's id. */
  id: string;
  name: string | null;
  phoneNumber: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  lastCallAt: string | null;
  doNotCall: boolean;
  addedAt: string;
  source: string;
}

export interface ContactListImportSummary {
  totalRows: number;
  contactsCreated: number;
  existingContacts: number;
  addedToList: number;
  alreadyInList: number;
  invalidRows: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
