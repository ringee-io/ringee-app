// Subset of Apollo.io API response shapes used by the provider mapper.

export type ApolloOrganization = {
  id?: string;
  name?: string;
  website_url?: string;
  primary_domain?: string;
  domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  retail_location_count?: number;
  publicly_traded_symbol?: string;
  publicly_traded_exchange?: string;
  founded_year?: number;
  annual_revenue?: number;
  total_funding?: number;
  latest_funding_stage?: string;
  short_description?: string;
  long_description?: string;
  logo_url?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  crunchbase_url?: string;
  technology_names?: string[];
  keywords?: string[];
  street_address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
};

export type ApolloPerson = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  headline?: string;
  email?: string;
  email_status?: string;
  phone_numbers?: Array<{
    raw_number?: string;
    sanitized_number?: string;
    type?: string;
  }>;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  facebook_url?: string;
  photo_url?: string;
  city?: string;
  state?: string;
  country?: string;
  seniority?: string;
  departments?: string[];
  subdepartments?: string[];
  organization?: ApolloOrganization;
  employment_history?: Array<{
    organization_name?: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    current?: boolean;
  }>;
};

export type ApolloPeopleMatchResponse = {
  person?: ApolloPerson;
};

export type ApolloOrganizationEnrichResponse = {
  organization?: ApolloOrganization;
};

export type ApolloPeopleSearchResponse = {
  pagination?: {
    page?: number;
    per_page?: number;
    total_entries?: number;
    total_pages?: number;
  };
  people?: ApolloPerson[];
  contacts?: ApolloPerson[];
};

export type ApolloAuthHealthResponse = {
  is_logged_in?: boolean;
  user_email?: string;
  user_name?: string;
  team_name?: string;
};
