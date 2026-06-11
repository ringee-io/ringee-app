// Hard-coded, exhaustive enum lists for Prospeo's /search-person filter
// vocabulary. Any value not present in these sets is silently dropped before
// the request leaves our server — the alternative (Prospeo returning
// INVALID_FILTERS) burns precious daily quota and adds latency. Sourced from:
//   https://prospeo.io/api-docs/enum/industries
//   https://prospeo.io/api-docs/enum/employee-ranges
//   https://prospeo.io/api-docs/enum/seniorities
//   https://prospeo.io/api-docs/enum/departments
//   https://prospeo.io/api-docs/enum/funding-stages

// ── Industries (LinkedIn-derived taxonomy used by Prospeo) ─────────────────

export const PROSPEO_INDUSTRIES = new Set<string>([
  "IT Services and IT Consulting",
  "Construction",
  "Business Consulting and Services",
  "General Retail",
  "Advertising Services",
  "Real Estate",
  "Software Development",
  "Medical Practices",
  "Financial Services",
  "Technology, Information and Internet",
  "Restaurants",
  "Hospitals and Health Care",
  "Wellness and Fitness Services",
  "Design Services",
  "Non-profit Organizations",
  "Individual and Family Services",
  "Hospitality",
  "Appliances, Electrical, and Electronics Manufacturing",
  "Motor Vehicle Manufacturing",
  "Professional Training and Coaching",
  "Food and Beverage Services",
  "Education Administration Programs",
  "Consumer Services",
  "Accounting",
  "General Wholesale",
  "Civic and Social Organizations",
  "Architecture and Planning",
  "Truck and Railroad Transportation",
  "Spectator Sports",
  "Entertainment Providers",
  "Retail Apparel and Fashion",
  "Higher Education",
  "Industrial Machinery Manufacturing",
  "Insurance",
  "Machinery Manufacturing",
  "Legal Services",
  "General Manufacturing",
  "Events Services",
  "Travel Arrangements",
  "Human Resources Services",
  "Law Practice",
  "Media Production and Publishing",
  "Food and Beverage Manufacturing",
  "Staffing and Recruiting",
  "Marketing Services",
  "Renewable Energy",
  "Research Services",
  "Facilities Services",
  "Environmental Services",
  "Telecommunications",
  "Transportation, Logistics, Supply Chain and Storage",
  "Electric Power Generation",
  "E-Learning Providers",
  "Oil, Gas, and Mining",
  "Arts and Crafts",
  "Photography",
  "Venture Capital and Private Equity",
  "Principals",
  "Music Retail",
  "Office Equipment",
  "Farming",
  "Wholesale Building Materials",
  "Furniture and Home Furnishings Manufacturing",
  "Government Administration",
  "Investment Management",
  "Civil Engineering",
  "Primary and Secondary Education",
  "Medical Equipment Manufacturing",
  "Textile Manufacturing",
  "Public Relations and Communications Services",
  "Printing Services",
  "Religious Institutions",
  "Artists and Writers",
  "Personal Care",
  "Product Manufacturing",
  "International Trade and Development",
  "Mental Health Care",
  "Chemical Manufacturing",
  "Pharmaceutical Manufacturing",
  "Utilities",
  "Information Services",
  "Security and Investigations",
  "Wholesale Import and Export",
  "Banking",
  "Biotechnology Research",
  "Recreational Facilities",
  "Automation Machinery Manufacturing",
  "Plastics Manufacturing",
  "Automotive Retail",
  "Groceries",
  "Freight and Package Transportation",
  "Computer and Network Security",
  "Computer Games",
  "Veterinary Services",
  "Airlines and Aviation",
  "Maritime Transportation",
  "Executive Offices",
  "Sporting Goods Manufacturing",
  "Market Research",
  "Mechanical or Industrial Engineering",
  "Aviation and Aerospace Component Manufacturing",
  "Strategic Management Services",
  "Consumer Goods",
  "Engineering Services",
  "Museums, Historical Sites, and Zoos",
  "Investment, Funds and Trusts",
  "Philanthropic Fundraising Services",
  "Human Resources",
  "Computer Hardware",
  "E-Learning",
  "Translation and Localization",
  "Public Safety",
  "Business Supplies and Equipment",
  "Defense and Space Manufacturing",
  "Glass, Ceramics and Concrete Manufacturing",
  "Warehousing and Storage",
  "Alternative Medicine",
  "Animation and Post-production",
  "Think Tanks",
  "Semiconductor Manufacturing",
  "Building Materials",
  "Capital Markets",
  "Interior Design",
  "Political Organizations",
  "Fundraising",
  "Law Enforcement",
  "Cosmetics",
  "Wireless Services",
  "Sports Teams and Clubs",
  "Retail Health and Personal Care Products",
  "Professional Services",
  "Social Networking Platforms",
  "Dairy Product Manufacturing",
  "Gambling Facilities and Casinos",
  "Internet Marketplace Platforms",
  "Shipbuilding",
  "Luxury Goods and Jewelry",
  "Libraries",
  "Ranching and Fisheries",
  "Online and Mail Order Retail",
  "Community Services",
  "Blockchain Services",
  "Food and Beverage Retail",
  "Retail Motor Vehicles",
  "Data Infrastructure and Analytics",
  "Wine and Spirits",
  "Sports and Recreation Instruction",
  "Paper and Forest Products",
  "Agriculture, Construction, Mining Machinery Manufacturing",
  "Home Health Care Services",
  "Vehicle Repair and Maintenance",
  "Business Content",
  "General Repair and Maintenance",
  "Maritime",
  "Packaging and Containers",
  "Industry Associations",
  "Retail Furniture and Home Furnishings",
  "Tobacco Manufacturing",
  "Pet Services",
  "Landscaping Services",
  "Alternative Dispute Resolution",
  "Dentists",
  "Wholesale Food and Beverage",
  "Fabricated Metal Products",
  "Aviation & Aerospace",
  "Railroad Equipment Manufacturing",
  "Mobile Gaming Apps",
  "Administrative and Support Services",
  "Apparel Manufacturing",
  "Nanotechnology Research",
  "Specialty Trade Contractors",
  "Janitorial Services",
  "Physical, Occupational and Speech Therapists",
  "Medical and Diagnostic Laboratories",
  "Professional Organizations",
  "Philanthropy",
  "Digital Accessibility Services",
  "Fashion Accessories Manufacturing",
  "Semiconductors",
  "Wholesale Motor Vehicles and Parts",
  "HVAC and Refrigeration Equipment Manufacturing",
  "Schools",
  "Wood Product Manufacturing",
  "Fire Protection",
  "Retail Office Supplies and Gifts",
  "Equipment Rental Services",
  "Movies, Videos and Sound",
  "Ground Passenger Transportation",
  "Wholesale Hardware, Plumbing, Heating Equipment",
  "Housing and Community Development",
  "Robotics Engineering",
  "Wholesale Chemical and Allied Products",
  "Building Finishing Contractors",
  "Child Day Care Services",
  "Radio and Television Broadcasting",
  "Paint, Coating, and Adhesive Manufacturing",
  "Building Structure and Exterior Contractors",
  "Retail Pharmacies",
  "Retail Building Materials and Garden Equipment",
  "Waste Treatment and Disposal",
  "Wholesale Machinery",
  "Metal Treatments",
  "Accommodation Services",
  "Horticulture",
  "Water Supply and Irrigation Systems",
  "Building Equipment Contractors",
  "Waste Collection",
  "Executive Search Services",
  "Telephone Call Centers",
  "Mobile Food Services",
  "Data Security",
  "Software Products",
  "Taxi and Limousine Services",
  "Retail Florists",
  "Metalworking Machinery Manufacturing",
  "Plastics and Rubber Product Manufacturing",
  "Climate Technology",
  "Golf Courses and Country Clubs",
  "Loan Brokers",
  "Water, Waste, Steam, and Air Conditioning Services",
  "Office Administration",
  "Wholesale Metals and Minerals",
  "Construction Hardware Manufacturing",
  "Surveying and Mapping Services",
  "Air, Water, and Waste Program Management",
  "Measuring and Control Instrument Manufacturing",
  "Leather Product Manufacturing",
  "Animal Feed Manufacturing",
  "Wholesale Furniture and Home Furnishings",
  "Wholesale Recyclable Materials",
  "Wholesale Drugs and Sundries",
  "Theater Companies",
  "Wholesale Apparel and Sewing Supplies",
  "Wholesale Computer Equipment",
  "Household, Laundry and Drycleaning Services",
  "Distilleries",
  "Breweries",
  "Wineries",
  "Optometrists",
  "Dance Companies",
  "Retail Recyclable Materials & Used Merchandise",
  "Utility System Construction",
  "Vocational Rehabilitation Services",
  "Amusement Parks and Arcades",
  "Retail Musical Instruments",
  "Turned Products and Fastener Manufacturing",
  "Engines and Power Transmission Equipment Manufacturing",
  "Transportation Equipment Manufacturing",
  "Collection Agencies",
  "Utilities Administration",
  "Credit Intermediation",
  "Housing and Socio-Economic Programs",
  "Securities and Commodity Exchanges",
  "Boilers, Tanks, and Shipping Container Manufacturing",
  "Claims Adjusting, Actuarial Services",
  "Ambulance Services",
  "Mattress and Blinds Manufacturing",
  "Regenerative Design",
  "Primary Metal Manufacturing",
]);

// Common Apollo-style / generic industry names → Prospeo canonical names.
// Used to translate values the agent learned from broader vocabularies (or
// natural language) before we drop them.
const INDUSTRY_ALIASES: Record<string, string | string[]> = {
  "computer software": "Software Development",
  software: "Software Development",
  "software & saas": "Software Development",
  saas: "Software Development",
  "saas / software": "Software Development",
  internet: "Technology, Information and Internet",
  "information technology and services": "IT Services and IT Consulting",
  "information technology & services": "IT Services and IT Consulting",
  "it services": "IT Services and IT Consulting",
  "marketing and advertising": ["Marketing Services", "Advertising Services"],
  "advertising / marketing": ["Marketing Services", "Advertising Services"],
  marketing: "Marketing Services",
  advertising: "Advertising Services",
  "outsourcing/offshoring": "Administrative and Support Services",
  outsourcing: "Administrative and Support Services",
  bpo: "Administrative and Support Services",
  "call center": "Telephone Call Centers",
  "contact center": "Telephone Call Centers",
  "lead generation": "Marketing Services",
  fintech: "Financial Services",
  "financial services": "Financial Services",
  banking: "Banking",
  insurance: "Insurance",
  "real estate": "Real Estate",
  ecommerce: "Online and Mail Order Retail",
  "e-commerce": "Online and Mail Order Retail",
  retail: "General Retail",
  manufacturing: "General Manufacturing",
  healthcare: "Hospitals and Health Care",
  "health care": "Hospitals and Health Care",
  education: "Education Administration Programs",
  "higher education": "Higher Education",
  "non-profit": "Non-profit Organizations",
  nonprofit: "Non-profit Organizations",
  government: "Government Administration",
  legal: "Legal Services",
  "law firm": "Law Practice",
  consulting: "Business Consulting and Services",
  "management consulting": "Business Consulting and Services",
  staffing: "Staffing and Recruiting",
  recruiting: "Staffing and Recruiting",
  hospitality: "Hospitality",
  restaurants: "Restaurants",
  travel: "Travel Arrangements",
  logistics: "Transportation, Logistics, Supply Chain and Storage",
  transportation: "Transportation, Logistics, Supply Chain and Storage",
  telecommunications: "Telecommunications",
  telecom: "Telecommunications",
  energy: "Renewable Energy",
  utilities: "Utilities",
  pharmaceuticals: "Pharmaceutical Manufacturing",
  pharma: "Pharmaceutical Manufacturing",
  biotech: "Biotechnology Research",
  biotechnology: "Biotechnology Research",
  cybersecurity: "Computer and Network Security",
  "cyber security": "Computer and Network Security",
  security: "Computer and Network Security",
  blockchain: "Blockchain Services",
  crypto: "Blockchain Services",
  "venture capital": "Venture Capital and Private Equity",
  "private equity": "Venture Capital and Private Equity",
  vc: "Venture Capital and Private Equity",
  "investment management": "Investment Management",
  "asset management": "Investment Management",
  media: "Media Production and Publishing",
  publishing: "Media Production and Publishing",
  entertainment: "Entertainment Providers",
  gaming: "Computer Games",
  "video games": "Computer Games",
  // Aliases for old comma-less names (our vocabulary previously omitted commas)
  "technology information and internet": "Technology, Information and Internet",
  "transportation logistics supply chain and storage":
    "Transportation, Logistics, Supply Chain and Storage",
  "oil gas and mining": "Oil, Gas, and Mining",
  "appliances electrical and electronics manufacturing":
    "Appliances, Electrical, and Electronics Manufacturing",
  "museums historical sites and zoos": "Museums, Historical Sites, and Zoos",
  "investment funds and trusts": "Investment, Funds and Trusts",
  "glass ceramics and concrete manufacturing":
    "Glass, Ceramics and Concrete Manufacturing",
  "agriculture construction mining machinery manufacturing":
    "Agriculture, Construction, Mining Machinery Manufacturing",
};

export function normalizeIndustries(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Exact match against the canonical list wins.
    if (PROSPEO_INDUSTRIES.has(trimmed)) {
      out.add(trimmed);
      continue;
    }
    // Try alias map (case-insensitive).
    const alias = INDUSTRY_ALIASES[trimmed.toLowerCase()];
    if (alias) {
      const list = Array.isArray(alias) ? alias : [alias];
      for (const v of list) {
        if (PROSPEO_INDUSTRIES.has(v)) out.add(v);
      }
      continue;
    }
    // Last-resort: case-insensitive scan of the canonical set.
    const lc = trimmed.toLowerCase();
    for (const candidate of PROSPEO_INDUSTRIES) {
      if (candidate.toLowerCase() === lc) {
        out.add(candidate);
        break;
      }
    }
    // Otherwise drop silently — invalid industries cost us a 400.
  }
  return Array.from(out);
}

// ── Headcount ranges ──────────────────────────────────────────────────────

export const PROSPEO_HEADCOUNT_RANGES = [
  "1-10",
  "11-20",
  "21-50",
  "51-100",
  "101-200",
  "201-500",
  "501-1000",
  "1001-2000",
  "2001-5000",
  "5001-10000",
  "10000+",
] as const;
const PROSPEO_HEADCOUNT_SET = new Set<string>(PROSPEO_HEADCOUNT_RANGES);

// Maps coarse / Apollo-style ranges to Prospeo's finer brackets so we cover
// the same headcount span. Values not on the map and not in the canonical set
// are dropped.
const HEADCOUNT_ALIASES: Record<string, string[]> = {
  "1-10": ["1-10"],
  "11-50": ["11-20", "21-50"],
  "51-200": ["51-100", "101-200"],
  "201-500": ["201-500"],
  "501-1000": ["501-1000"],
  "1001-5000": ["1001-2000", "2001-5000"],
  "5001-10000": ["5001-10000"],
  "10001+": ["10000+"],
  "10000+": ["10000+"],
  "1-50": ["1-10", "11-20", "21-50"],
  "1-100": ["1-10", "11-20", "21-50", "51-100"],
};

export function normalizeHeadcountRanges(
  input: string[] | undefined,
): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (PROSPEO_HEADCOUNT_SET.has(trimmed)) {
      out.add(trimmed);
      continue;
    }
    const aliased = HEADCOUNT_ALIASES[trimmed];
    if (aliased) {
      for (const v of aliased) {
        if (PROSPEO_HEADCOUNT_SET.has(v)) out.add(v);
      }
    }
    // Otherwise drop.
  }
  return Array.from(out);
}

// ── Seniorities ───────────────────────────────────────────────────────────

export const PROSPEO_SENIORITIES = [
  "Founder/Owner",
  "C-Suite",
  "Partner",
  "Vice President",
  "Head",
  "Director",
  "Manager",
  "Senior",
  "Entry",
  "Intern",
] as const;
const PROSPEO_SENIORITY_SET = new Set<string>(PROSPEO_SENIORITIES);

const SENIORITY_ALIASES: Record<string, string> = {
  founder: "Founder/Owner",
  "co-founder": "Founder/Owner",
  cofounder: "Founder/Owner",
  owner: "Founder/Owner",
  "founder/owner": "Founder/Owner",
  "founder owner": "Founder/Owner",
  c_suite: "C-Suite",
  "c-suite": "C-Suite",
  csuite: "C-Suite",
  cxo: "C-Suite",
  ceo: "C-Suite",
  cto: "C-Suite",
  coo: "C-Suite",
  cfo: "C-Suite",
  cmo: "C-Suite",
  cro: "C-Suite",
  partner: "Partner",
  vp: "Vice President",
  "vice president": "Vice President",
  "vice-president": "Vice President",
  head: "Head",
  "head of": "Head",
  director: "Director",
  "director of": "Director",
  manager: "Manager",
  senior: "Senior",
  entry: "Entry",
  intern: "Intern",
};

export function normalizeSeniorities(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (PROSPEO_SENIORITY_SET.has(trimmed)) {
      out.add(trimmed);
      continue;
    }
    const mapped = SENIORITY_ALIASES[trimmed.toLowerCase()];
    if (mapped) {
      out.add(mapped);
    }
  }
  return Array.from(out);
}

// ── Departments ───────────────────────────────────────────────────────────

// Combined main + sub departments. Order: main departments first, then sub.
export const PROSPEO_DEPARTMENTS = new Set<string>([
  // Main
  "C-Suite",
  "Product",
  "Engineering & Technical",
  "Design",
  "Education & Coaching",
  "Finance",
  "Human Resources",
  "Information Technology",
  "Legal",
  "Marketing",
  "Medical & Health",
  "Consulting",
  "Sales",
  "Operations",
  // Sub
  "Chief Executive",
  "Finance Executive",
  "Founder",
  "Human Resources Executive",
  "Information Technology Executive",
  "Legal Executive",
  "Marketing Executive",
  "Medical & Health Executive",
  "Operations Executive",
  "Sales Leader",
  "Product Development",
  "Product Management",
  "All Product",
  "Artificial Intelligence / Machine Learning",
  "Bioengineering",
  "Biometrics",
  "Business Intelligence",
  "Chemical Engineering",
  "Data Science & Analysis",
  "DevOps",
  "Digital Transformation",
  "Emerging Technology / Innovation",
  "Industrial Engineering",
  "Mechanic",
  "Mobile Development",
  "Project Management",
  "Research & Development",
  "Scrum Master / Agile Coach",
  "Software Development",
  "Technician",
  "Technology Operations",
  "Test / Quality Assurance",
  "All Design",
  "Graphic / Visual / Brand Design",
  "Teacher",
  "Superintendent",
  "Professor",
  "Coach / Trainer",
  "Financial Reporting",
  "Financial Systems",
  "Accounting",
  "Finance & Banking",
  "Financial Planning Strategy & Analysis",
  "Internal Audit & Control",
  "Investor Relations",
  "Mergers & Acquisitions",
  "Real Estate Finance",
  "Financial Risk",
  "Sourcing / Procurement",
  "Tax",
  "Treasury",
  "Compensation & Benefits",
  "Culture Diversity & Inclusion",
  "Health & Safety",
  "All Human Resources",
  "HR Business Partner",
  "Learning & Development",
  "Organizational Development",
  "Recruiting & Talent Acquisition",
  "Talent Management",
  "Workforce Management",
  "People Operations",
  "Cloud Engineering",
  "Data Center",
  "Data Warehouse",
  "Database Administration",
  "eCommerce Development",
  "Help Desk / Desktop Services",
  "Information Security",
  "IT Asset Management",
  "IT Audit / IT Compliance",
  "IT Recruitement",
  "IT Procurement",
  "IT Strategy",
  "IT Training",
  "Networking",
  "Technical Lead",
  "Quality Assurance",
  "Retail / Store Systems",
  "Servers",
  "Disaster Recovery",
  "Telecommunications",
  "Compliance",
  "Contracts",
  "Corporate Secretary",
  "eDiscovery",
  "Ethics",
  "Governance",
  "Governmental Affairs & Regulatory Law",
  "Intellectual Property & Patent",
  "Labor & Employment",
  "Lawyer / Attorney",
  "All Legal",
  "Legal Counsel",
  "Legal Operations",
  "Litigation",
  "Privacy",
  "Advertising",
  "Brand Management",
  "Content Marketing",
  "Customer Experience",
  "Customer Marketing",
  "Growth & Demand Generation",
  "Digital Marketing",
  "eCommerce Marketing",
  "Event & Field Marketing",
  "Lead Generation",
  "Marketing Operations",
  "Product Marketing",
  "Public Relations",
  "SEO",
  "Social Media Marketing",
  "Technical Marketing",
  "Consultant",
  "All Sales",
  "Sales Training",
  "Sales Operations",
  "Sales Engineering",
  "Sales Enablement",
  "Revenue Operations",
  "Partnerships",
  "Sales Development",
  "Account Executive",
  "Field / Outside Sales",
  "Customer Success",
  "Customer Retention & Development",
  "Channel Sales",
  "Account Management",
  "Supply Chain",
  "Store Operations",
  "Safety",
  "Real Estate",
  "Quality Management",
  "Physical Security",
  "Office Operations",
  "Logistics",
  "Leasing",
  "Facilities Management",
  "Customer Service / Support",
  "Corporate Strategy",
  "Construction",
]);

const DEPARTMENT_ALIASES: Record<string, string | string[]> = {
  sales: "Sales",
  "sales development": "Sales Development",
  sdr: "Sales Development",
  bdr: "Sales Development",
  "business development": "Sales Development",
  business_development: "Sales Development",
  marketing: "Marketing",
  "demand generation": "Growth & Demand Generation",
  growth: "Growth & Demand Generation",
  engineering: "Engineering & Technical",
  "engineering & technical": "Engineering & Technical",
  product: "Product",
  finance: "Finance",
  hr: "Human Resources",
  "human resources": "Human Resources",
  it: "Information Technology",
  "information technology": "Information Technology",
  legal: "Legal",
  operations: "Operations",
  "customer success": "Customer Success",
  "customer support": "Customer Service / Support",
  support: "Customer Service / Support",
  partnerships: "Partnerships",
  "revenue operations": "Revenue Operations",
  revops: "Revenue Operations",
  "c suite": "C-Suite",
  c_suite: "C-Suite",
  founder: "Founder",
};

export function normalizeDepartments(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (PROSPEO_DEPARTMENTS.has(trimmed)) {
      out.add(trimmed);
      continue;
    }
    const alias = DEPARTMENT_ALIASES[trimmed.toLowerCase()];
    if (alias) {
      const list = Array.isArray(alias) ? alias : [alias];
      for (const v of list) if (PROSPEO_DEPARTMENTS.has(v)) out.add(v);
    }
  }
  return Array.from(out);
}

// ── Funding stages ────────────────────────────────────────────────────────

export const PROSPEO_FUNDING_STAGES = new Set<string>([
  "Pre seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E-J",
  "Grant",
  "Angel",
  "Private equity",
  "Debt financing",
  "Non equity assistance",
  "Post IPO equity",
  "Undisclosed",
  "Post IPO debt",
  "Product crowdfunding",
  "Equity crowdfunding",
  "Corporate round",
  "Convertible note",
  "Secondary market",
  "Initial coin offering",
  "Post IPO secondary",
  "Other event",
]);

const FUNDING_ALIASES: Record<string, string> = {
  preseed: "Pre seed",
  "pre-seed": "Pre seed",
  "pre seed": "Pre seed",
  seed: "Seed",
  "series-a": "Series A",
  "series a": "Series A",
  a: "Series A",
  "series-b": "Series B",
  "series b": "Series B",
  b: "Series B",
  "series-c": "Series C",
  "series c": "Series C",
  c: "Series C",
  "series-d": "Series D",
  "series d": "Series D",
  d: "Series D",
  "series-e": "Series E-J",
  "series e": "Series E-J",
  "series-f": "Series E-J",
  "series f": "Series E-J",
  e: "Series E-J",
  f: "Series E-J",
  ipo: "Post IPO equity",
  "post-ipo": "Post IPO equity",
  pe: "Private equity",
  "private equity": "Private equity",
  angel: "Angel",
  grant: "Grant",
};

export function normalizeFundingStages(input: string[] | undefined): string[] {
  if (!input?.length) return [];
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (PROSPEO_FUNDING_STAGES.has(trimmed)) {
      out.add(trimmed);
      continue;
    }
    const alias = FUNDING_ALIASES[trimmed.toLowerCase()];
    if (alias && PROSPEO_FUNDING_STAGES.has(alias)) out.add(alias);
  }
  return Array.from(out);
}
