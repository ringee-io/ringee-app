// Subset of the Prospeo.io API response shapes we care about.
// Keep optional everywhere — the provider mapper handles missing fields.

export type ProspeoEnvelope<T> = {
  error: boolean;
  message?: string;
  error_code?: string;
  filter_error?: string;
  response?: T;
  remaining_credits?: number;
};

export type ProspeoEmailFinderResponse = {
  email?: string;
  email_status?: string; // "valid" | "risky" | "invalid" | "unknown"
  first_name?: string;
  last_name?: string;
  company?: string;
  domain?: string;
  position?: string;
  linkedin_url?: string;
  raw_format?: string;
};

export type ProspeoLinkedInResponse = ProspeoEmailFinderResponse;

export type ProspeoMobileResponse = {
  raw_format?: string;
  international_format?: string;
  national_format?: string;
  country_calling_code?: string;
  country?: string;
  country_code?: string;
  is_valid?: boolean;
};

export type ProspeoEmailVerifierResponse = {
  email?: string;
  status?: string;
  score?: number;
  free?: boolean;
  role?: boolean;
  disposable?: boolean;
  catch_all?: boolean;
};

export type ProspeoAccountInfoResponse = {
  email?: string;
  remaining_credits?: number;
  plan?: string;
  monthly_credits?: number;
  reset_date?: string;
};

// ── /search-person ──
// https://prospeo.io/api-docs/search-person
// Top-level shape: { error, results, pagination, ... } (no `response` envelope).

export type ProspeoSearchPersonFilters = {
  company?: {
    websites?: { include?: string[]; exclude?: string[] };
    names?: { include?: string[]; exclude?: string[] };
  };
  company_industry?: { include?: string[]; exclude?: string[] };
  company_location_search?: { include?: string[]; exclude?: string[] };
  company_headcount_range?: string[];
  company_funding?: { stage?: string[]; funding_date?: number; last_funding?: { min?: string; max?: string }; total_funding?: { min?: string; max?: string } };
  company_technology?: { include?: string[]; exclude?: string[] };
  company_email_provider?: { include?: string[]; exclude?: string[] };
  person_seniority?: { include?: string[]; exclude?: string[] };
  person_year_of_experience?: { min?: number; max?: number };
  person_location_search?: { include?: string[]; exclude?: string[] };
  person_job_title?: { include?: string[]; exclude?: string[] };
  person_department?: { include?: string[]; exclude?: string[] };
};

export type ProspeoSearchPersonRequest = {
  page?: number;
  filters: ProspeoSearchPersonFilters;
};

export type ProspeoSearchPersonResult = {
  person?: {
    person_id?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    linkedin_url?: string;
    current_job_title?: string;
    headline?: string;
    location?: {
      country?: string;
      country_code?: string;
      state?: string;
      city?: string;
      time_zone?: string;
    };
    skills?: string[];
  };
  company?: {
    company_id?: string;
    name?: string;
    website?: string;
    domain?: string;
    description?: string;
    industry?: string;
    employee_count?: number;
    employee_count_range?: string;
    linkedin_url?: string;
    founded?: number;
    location?: {
      country?: string;
      country_code?: string;
      state?: string;
      city?: string;
    };
  };
};

export type ProspeoSearchPersonResponse = {
  error: boolean;
  error_code?: string;
  filter_error?: string;
  results?: ProspeoSearchPersonResult[];
  pagination?: {
    current_page?: number;
    per_page?: number;
    total_page?: number;
    total_count?: number;
  };
  remaining_credits?: number;
};

// ── /enrich-person ──
// https://prospeo.io/api-docs/enrich-person

export type ProspeoEnrichPersonRequest = {
  data: {
    person_id?: string;
    linkedin_url?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    company_name?: string;
    company_website?: string;
    company_linkedin_url?: string;
  };
  only_verified_email?: boolean;
  enrich_mobile?: boolean;
  only_verified_mobile?: boolean;
};

export type ProspeoEnrichPersonResponse = {
  error: boolean;
  error_code?: string;
  free_enrichment?: boolean;
  person?: {
    person_id?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    linkedin_url?: string;
    current_job_title?: string;
    headline?: string;
    job_history?: Array<{
      company?: string;
      title?: string;
      start_date?: string;
      end_date?: string;
      current?: boolean;
    }>;
    mobile?: {
      status?: "VERIFIED" | "UNVERIFIED";
      revealed?: boolean;
      mobile?: string;
      mobile_country?: string;
      mobile_country_code?: string;
    };
    email?: {
      status?: "VERIFIED" | "UNVERIFIED";
      revealed?: boolean;
      email?: string;
      verification_method?: string;
      email_mx_provider?: string;
    };
    location?: {
      country?: string;
      country_code?: string;
      state?: string;
      city?: string;
      time_zone?: string;
    };
    skills?: string[];
  };
  company?: {
    company_id?: string;
    name?: string;
    website?: string;
    domain?: string;
    description?: string;
    industry?: string;
    employee_count?: number;
    employee_count_range?: string;
    linkedin_url?: string;
    founded?: number;
    location?: {
      country?: string;
      country_code?: string;
      state?: string;
      city?: string;
    };
  };
  remaining_credits?: number;
};
