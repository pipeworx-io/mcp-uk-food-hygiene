interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * UK Food Hygiene MCP — Food Standards Agency food hygiene ratings (FHRS)
 * via api.ratings.food.gov.uk (keyless, official FSA open data).
 *
 * Tools:
 * - uk_food_hygiene_search: find establishments by name/address or lat/lon radius
 * - uk_food_hygiene_details: full inspection record for one FHRSID
 *
 * Covers England, Wales, and Northern Ireland (FHRS, rated 0-5) plus
 * Scotland (FHIS, rated "Pass" / "Improvement Required" — no numeric score).
 *
 * CRITICAL QUIRK: every request MUST send the header `x-api-version: 2`,
 * otherwise the API returns 404 "The API 'Establishments' doesn't exist".
 * The api() helper below always sends it — never remove it.
 *
 * Sub-scores (Hygiene / Structural / ConfidenceInManagement) are DEMERIT
 * points: 0 is best, higher is worse. Scottish FHIS records return null
 * for all three.
 */


const BASE_URL = 'https://api.ratings.food.gov.uk';

const tools: McpToolExport['tools'] = [
  {
    name: 'uk_food_hygiene_search',
    description:
      'Search UK restaurant food hygiene ratings from the Food Standards Agency FHRS — answers "is this restaurant clean", "is this takeaway safe to eat at", "food hygiene rating of X". Search by business name and/or address (a town, street, or postcode works), or by latitude/longitude + radius_miles for hygiene ratings near a point. Filter by business_type (restaurant, takeaway, pub, hotel, supermarket, mobile caterer...) and min_rating (1-5). Returns rating (0-5 in England/Wales/NI; Scotland uses "Pass"/"Improvement Required" under FHIS), inspection date, address, and inspection sub-scores. Example: uk_food_hygiene_search({ name: "Nandos", address: "Leeds" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Business name to search, e.g. "Nandos", "Golden Dragon"' },
        address: { type: 'string', description: 'Any part of the address — town, street, or postcode, e.g. "Leeds", "Baker Street", "SW1A 1AA"' },
        business_type: { type: 'string', description: 'Optional type filter, e.g. "restaurant", "takeaway", "pub", "hotel", "supermarket", "school", "mobile caterer"' },
        min_rating: { type: 'number', description: 'Minimum FHRS rating 1-5 (5 = best). Filters to numerically-rated FHRS establishments, so Scottish FHIS results drop out' },
        latitude: { type: 'number', description: 'Latitude for geo search (use with longitude)' },
        longitude: { type: 'number', description: 'Longitude for geo search (use with latitude)' },
        radius_miles: { type: 'number', description: 'Geo search radius in miles (default 2, max 30). Only used with latitude/longitude' },
        limit: { type: 'number', description: 'Max results to return, 1-30 (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'uk_food_hygiene_details',
    description:
      'Get the full Food Standards Agency FHRS inspection record for one UK establishment by its FHRSID (from uk_food_hygiene_search) — rating, inspection date, sub-scores for hygiene / structural compliance / confidence in management (0 = best, higher = worse), full address, local authority contact, and geocode. Use to check how clean or safe a specific UK restaurant, takeaway, cafe, or pub is. Example: uk_food_hygiene_details({ fhrsid: 537122 })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fhrsid: { type: 'number', description: 'FHRSID of the establishment, from uk_food_hygiene_search' },
      },
      required: ['fhrsid'],
    },
  },
];

// ---------------------------------------------------------------------------
// Business types are a fixed server-side enum (GET /BusinessTypes/basic,
// verified 2026-07-15). Map friendly words to the numeric BusinessTypeId the
// API requires.
const BUSINESS_TYPES: Array<{ id: number; name: string; aliases: string[] }> = [
  { id: 1, name: 'Restaurant/Cafe/Canteen', aliases: ['restaurant', 'cafe', 'café', 'canteen', 'coffee', 'diner', 'bistro'] },
  { id: 7844, name: 'Takeaway/sandwich shop', aliases: ['takeaway', 'take away', 'take-away', 'sandwich', 'fast food', 'chippy', 'fish and chips', 'kebab'] },
  { id: 7843, name: 'Pub/bar/nightclub', aliases: ['pub', 'bar', 'nightclub', 'club', 'tavern'] },
  { id: 7842, name: 'Hotel/bed & breakfast/guest house', aliases: ['hotel', 'bed and breakfast', 'b&b', 'guest house', 'guesthouse', 'hostel', 'inn'] },
  { id: 7840, name: 'Retailers - supermarkets/hypermarkets', aliases: ['supermarket', 'hypermarket', 'grocery', 'grocer'] },
  { id: 4613, name: 'Retailers - other', aliases: ['retailer', 'retail', 'shop', 'store', 'convenience', 'newsagent', 'off licence'] },
  { id: 7845, name: 'School/college/university', aliases: ['school', 'college', 'university'] },
  { id: 5, name: 'Hospitals/Childcare/Caring Premises', aliases: ['hospital', 'childcare', 'care home', 'caring', 'nursing', 'nursery'] },
  { id: 7846, name: 'Mobile caterer', aliases: ['mobile caterer', 'mobile', 'food truck', 'food van', 'street food', 'market stall'] },
  { id: 7841, name: 'Other catering premises', aliases: ['caterer', 'catering', 'event catering'] },
  { id: 7839, name: 'Manufacturers/packers', aliases: ['manufacturer', 'packer', 'factory', 'producer'] },
  { id: 7838, name: 'Farmers/growers', aliases: ['farm', 'farmer', 'grower'] },
  { id: 7, name: 'Distributors/Transporters', aliases: ['distributor', 'transporter', 'wholesale', 'wholesaler'] },
  { id: 14, name: 'Importers/Exporters', aliases: ['importer', 'exporter', 'import', 'export'] },
];

function resolveBusinessType(input: string): { id: number; name: string } {
  const q = input.trim().toLowerCase();
  for (const t of BUSINESS_TYPES) {
    if (t.name.toLowerCase() === q || t.aliases.some((a) => q.includes(a) || a.includes(q))) {
      return { id: t.id, name: t.name };
    }
  }
  throw new Error(
    `Unknown business_type "${input}". Use one of: ${BUSINESS_TYPES.map((t) => t.name).join(', ')} (or a close word like "restaurant", "takeaway", "pub", "hotel", "supermarket").`,
  );
}

// ---------------------------------------------------------------------------

async function api(path: string, params?: URLSearchParams): Promise<unknown> {
  const qs = params && [...params].length > 0 ? `?${params}` : '';
  const res = await fetch(`${BASE_URL}${path}${qs}`, {
    // The FSA API 404s on EVERY endpoint without this exact header.
    headers: { 'x-api-version': '2', Accept: 'application/json' },
  });
  if (res.status === 404) {
    throw new Error(
      `UK food hygiene: not found (HTTP 404) for ${path}. For details lookups, verify the fhrsid came from uk_food_hygiene_search.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `UK food hygiene: FSA ratings API error (HTTP ${res.status}) for ${path}. The API is keyless and normally reliable — retry once; if it persists check ratings.food.gov.uk.`,
    );
  }
  return res.json();
}

interface Establishment {
  FHRSID: number;
  BusinessName: string;
  BusinessType: string;
  AddressLine1?: string;
  AddressLine2?: string;
  AddressLine3?: string;
  AddressLine4?: string;
  PostCode?: string;
  Phone?: string;
  RatingValue: string;
  RatingDate?: string | null;
  RatingKey?: string;
  NewRatingPending?: boolean;
  SchemeType: string; // "FHRS" (England/Wales/NI, 0-5) or "FHIS" (Scotland, Pass/Improvement Required)
  LocalAuthorityName?: string;
  LocalAuthorityEmailAddress?: string;
  LocalAuthorityWebSite?: string;
  Distance?: number | null; // miles — only populated on geo searches
  geocode?: { latitude?: string | null; longitude?: string | null };
  scores?: {
    Hygiene?: number | null;
    Structural?: number | null;
    ConfidenceInManagement?: number | null;
  };
}

function joinAddress(e: Establishment): string {
  return [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

// Sub-scores are demerit points: 0 = best. Scottish FHIS records have nulls.
function shapeScores(s: Establishment['scores']) {
  if (!s || (s.Hygiene == null && s.Structural == null && s.ConfidenceInManagement == null)) return undefined;
  return {
    hygiene: s.Hygiene,
    structural: s.Structural,
    confidence_in_management: s.ConfidenceInManagement,
  };
}

function shapeEstablishment(e: Establishment) {
  return {
    fhrsid: e.FHRSID,
    name: e.BusinessName,
    business_type: e.BusinessType,
    rating: e.RatingValue,
    // Flag Scottish results — FHIS ratings are "Pass"/"Improvement Required",
    // a different scheme from the 0-5 FHRS scale.
    scheme: e.SchemeType === 'FHIS' ? 'FHIS (Scotland — Pass/Improvement Required scale)' : e.SchemeType,
    rating_date: e.RatingDate ? e.RatingDate.slice(0, 10) : null,
    new_rating_pending: e.NewRatingPending || undefined,
    address: joinAddress(e),
    postcode: e.PostCode || null,
    local_authority: e.LocalAuthorityName,
    scores: shapeScores(e.scores),
    distance_miles: e.Distance != null ? Math.round(e.Distance * 100) / 100 : undefined,
  };
}

// ---------------------------------------------------------------------------

async function search(args: Record<string, unknown>) {
  const name = String(args.name ?? '').trim();
  const address = String(args.address ?? args.town ?? args.postcode ?? '').trim();
  const lat = args.latitude as number | undefined;
  const lon = args.longitude as number | undefined;
  const hasGeo = typeof lat === 'number' && typeof lon === 'number';

  if (typeof lat === 'number' !== (typeof lon === 'number')) {
    throw new Error('Geo search needs BOTH latitude and longitude.');
  }
  if (!name && !address && !hasGeo) {
    throw new Error(
      'uk_food_hygiene_search needs a name, an address (town/street/postcode), or latitude+longitude. Example: { name: "Nandos", address: "Leeds" }',
    );
  }

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
  const params = new URLSearchParams({ pageSize: String(limit), pageNumber: '1' });
  if (name) params.set('name', name);
  if (address) params.set('address', address);

  let radius: number | undefined;
  if (hasGeo) {
    params.set('latitude', String(lat));
    params.set('longitude', String(lon));
    radius = Math.min(Math.max(Number(args.radius_miles) || 2, 0.1), 30);
    params.set('maxDistanceLimit', String(radius));
    // Geo results are NOT distance-ordered by default — verified 2026-07-15.
    params.set('sortOptionKey', 'distance');
  }

  let businessTypeName: string | undefined;
  if (args.business_type) {
    const bt = resolveBusinessType(String(args.business_type));
    params.set('businessTypeId', String(bt.id));
    businessTypeName = bt.name;
  }

  let minRating: number | undefined;
  if (args.min_rating != null) {
    minRating = Math.min(Math.max(Math.round(Number(args.min_rating)), 1), 5);
    // Server-side rating filter (verified): ratingKey + ratingOperatorKey.
    params.set('ratingKey', String(minRating));
    params.set('ratingOperatorKey', 'GreaterThanOrEqual');
  }

  const data = (await api('/Establishments', params)) as {
    establishments: Establishment[];
    meta: { totalCount: number };
  };
  const results = data.establishments ?? [];

  const hints: string[] = [];
  if (results.length === 0) {
    if (name && address) {
      hints.push(
        'Zero matches — broaden the search: try name only, or keep just the town in address (name matches business names; address matches any address line or postcode).',
      );
    } else if (hasGeo) {
      hints.push('Zero matches — try a larger radius_miles, or search by town via the address field instead.');
    } else {
      hints.push('Zero matches — try a shorter or partial name, or a broader address (just the town).');
    }
    if (minRating) {
      hints.push(
        'min_rating restricts results to numeric FHRS ratings, which excludes Scottish (FHIS "Pass") establishments — drop min_rating to include them.',
      );
    }
  }
  if (results.some((e) => e.SchemeType === 'FHIS')) {
    hints.push(
      'Some results are from Scotland\'s FHIS scheme: rating is "Pass" or "Improvement Required" instead of 0-5, and sub-scores are unavailable.',
    );
  }

  return {
    query: {
      name: name || undefined,
      address: address || undefined,
      business_type: businessTypeName,
      min_rating: minRating,
      geo: hasGeo ? { latitude: lat, longitude: lon, radius_miles: radius } : undefined,
    },
    total_matches: data.meta?.totalCount ?? results.length,
    count: results.length,
    rating_scale: 'FHRS ratings run 0-5 (5 = very good). Sub-scores are demerits: 0 = best, higher = worse.',
    note: hints.length > 0 ? hints.join(' ') : undefined,
    establishments: results.map(shapeEstablishment),
  };
}

async function details(args: Record<string, unknown>) {
  const id = String(args.fhrsid ?? args.id ?? args.FHRSID ?? '').trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `uk_food_hygiene_details requires a numeric fhrsid from uk_food_hygiene_search (got "${id}").`,
    );
  }
  const e = (await api(`/Establishments/${id}`)) as Establishment;
  const scores = shapeScores(e.scores);
  const isFhis = e.SchemeType === 'FHIS';
  return {
    fhrsid: e.FHRSID,
    name: e.BusinessName,
    business_type: e.BusinessType,
    rating: e.RatingValue,
    scheme: e.SchemeType,
    rating_scale: isFhis
      ? 'FHIS (Scotland): rating is "Pass" or "Improvement Required" — this scheme publishes numeric sub-scores as null.'
      : 'FHRS: 0-5 where 5 = very good and 0 = urgent improvement necessary. "Exempt" and "AwaitingInspection" mean the business has no rating yet.',
    rating_date: e.RatingDate ? e.RatingDate.slice(0, 10) : null,
    new_rating_pending: e.NewRatingPending ?? false,
    scores,
    scores_note: scores
      ? 'Sub-scores are inspection demerit points — 0 is the BEST possible; higher means worse (hygiene max 25, structural max 20, confidence_in_management max 30).'
      : undefined,
    address: joinAddress(e),
    postcode: e.PostCode || null,
    phone: e.Phone || undefined,
    local_authority: {
      name: e.LocalAuthorityName,
      email: e.LocalAuthorityEmailAddress || undefined,
      website: e.LocalAuthorityWebSite || undefined,
    },
    latitude: e.geocode?.latitude ? Number(e.geocode.latitude) : undefined,
    longitude: e.geocode?.longitude ? Number(e.geocode.longitude) : undefined,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'uk_food_hygiene_search':
      return search(args);
    case 'uk_food_hygiene_details':
      return details(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool } satisfies McpToolExport;
