export type AttioOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  workspace_id?: string;
  workspace_name?: string;
};

export type AttioWorkspaceResponse = {
  workspace_id: string
  active: boolean,
  scope: string,
  client_id: string,
  token_type: string,
  exp: null,
  iat: number,
  sub: string,
  aud: string,
  iss: string,
  authorized_by_workspace_member_id: string,
  workspace_name: string,
  workspace_slug: string,
  workspace_logo_url: string
};

export type AttioAttributeValue =
  | { value: string | number | boolean | null }
  | { email_address: string }
  | { original_phone_number: string; country_code?: string | null }
  | { full_name?: string; first_name?: string; last_name?: string }
  | { target_object: "people" | "companies"; target_record_id: string };

export type AttioPersonRecord = {
  id: { workspace_id: string; object_id: string; record_id: string };
  values: {
    name?: Array<{
      value?: string;
      full_name?: string;
      first_name?: string;
      last_name?: string;
    }>;
    email_addresses?: Array<{ email_address: string }>;
    phone_numbers?: Array<{
      phone_number?: string;
      original_phone_number?: string;
    }>;
    primary_location?: Array<{ locality?: string }>;
  };
};

export type AttioQueryResponse<T> = {
  data: T[];
};

export type AttioRecordResponse<T> = {
  data: T;
};

export type AttioNoteRequest = {
  data: {
    format: "plaintext" | "markdown";
    parent_object: "people" | "companies" | "calls";
    parent_record_id: string;
    title: string;
    content: string;
  };
};

export type AttioNoteResponse = {
  data: {
    id: { note_id: string };
  };
};

export type AttioTaskRequest = {
  data: {
    content: string;
    format: "plaintext";
    deadline_at?: string | null;
    is_completed?: boolean;
    linked_records: Array<{
      target_object: "people" | "companies";
      target_record_id: string;
    }>;
    assignees?: Array<{ referenced_actor_type: "workspace-member"; referenced_actor_id: string }>;
  };
};

export type AttioTaskResponse = {
  data: {
    id: { task_id: string };
  };
};

export type AttioCompanyRecord = {
  id: { workspace_id: string; object_id: string; record_id: string };
  values: {
    name?: Array<{ value?: string }>;
    domains?: Array<{ domain?: string }>;
    description?: Array<{ value?: string }>;
    primary_location?: Array<{ locality?: string }>;
    phone_numbers?: Array<{
      phone_number?: string;
      original_phone_number?: string;
    }>;
    categories?: Array<{ option?: string }>;
    team_size?: Array<{ value?: string }>;
  };
};

export type AttioListEntry = {
  id: { list_id: string };
  api_slug: string;
  name: string;
  parent_object: string[];
  workspace_access: string;
};

export type AttioListResponse = {
  data: AttioListEntry[];
};

export type AttioWorkspaceMember = {
  id: { workspace_id: string; workspace_member_id: string };
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email_address: string;
  access_level: string;
};

export type AttioWorkspaceMembersResponse = {
  data: AttioWorkspaceMember[];
};
