/**
 * TCS office / delivery locations used on registration as "Location".
 * Stored in the existing business_unit field.
 */

export interface TcsLocationGroup {
  region: string;
  locations: string[];
}

/** Default campus for PlaySmart (Siruseri / Chennai). */
export const DEFAULT_TCS_LOCATION = 'Chennai, India';

/** Normalize location strings for consistent storage and matching. */
export function normalizeLocation(loc?: string | null): string {
  return String(loc || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Case-insensitive location equality after normalize. */
export function sameLocation(a?: string | null, b?: string | null): boolean {
  const left = normalizeLocation(a).toLowerCase();
  const right = normalizeLocation(b).toLowerCase();
  if (!left || !right) return false;
  return left === right;
}

export const TCS_LOCATION_GROUPS: TcsLocationGroup[] = [
  {
    region: 'India',
    locations: [
      'Ahmedabad, India',
      'Bengaluru, India',
      'Bhubaneswar, India',
      'Chandigarh, India',
      'Chennai, India',
      'Coimbatore, India',
      'Delhi NCR, India',
      'Gandhinagar, India',
      'Gurugram, India',
      'Hyderabad, India',
      'Indore, India',
      'Jaipur, India',
      'Kochi, India',
      'Kolkata, India',
      'Lucknow, India',
      'Mangaluru, India',
      'Mumbai, India',
      'Mysuru, India',
      'Nagpur, India',
      'Nashik, India',
      'Noida, India',
      'Pune, India',
      'Thiruvananthapuram, India',
      'Vadodara, India',
      'Visakhapatnam, India'
    ]
  },
  {
    region: 'North America — United States',
    locations: [
      'Atlanta, USA',
      'Austin, USA',
      'Boston, USA',
      'Charlotte, USA',
      'Chicago, USA',
      'Cincinnati, USA',
      'Dallas, USA',
      'Denver, USA',
      'Detroit, USA',
      'Houston, USA',
      'Los Angeles, USA',
      'Miami, USA',
      'Minneapolis, USA',
      'New Jersey, USA',
      'New York, USA',
      'Philadelphia, USA',
      'Phoenix, USA',
      'Pittsburgh, USA',
      'San Francisco Bay Area, USA',
      'Santa Clara, USA',
      'Seattle, USA',
      'Tampa, USA',
      'Washington DC, USA'
    ]
  },
  {
    region: 'North America — Canada & Mexico',
    locations: [
      'Calgary, Canada',
      'Mexico City, Mexico',
      'Mississauga, Canada',
      'Monterrey, Mexico',
      'Montreal, Canada',
      'Ottawa, Canada',
      'Toronto, Canada',
      'Vancouver, Canada'
    ]
  },
  {
    region: 'United Kingdom & Ireland',
    locations: [
      'Belfast, UK',
      'Birmingham, UK',
      'Cardiff, UK',
      'Dublin, Ireland',
      'Edinburgh, UK',
      'Glasgow, UK',
      'London, UK',
      'Manchester, UK',
      'Peterborough, UK'
    ]
  },
  {
    region: 'Continental Europe',
    locations: [
      'Amsterdam, Netherlands',
      'Barcelona, Spain',
      'Berlin, Germany',
      'Brussels, Belgium',
      'Budapest, Hungary',
      'Copenhagen, Denmark',
      'Düsseldorf, Germany',
      'Frankfurt, Germany',
      'Geneva, Switzerland',
      'Helsinki, Finland',
      'Lisbon, Portugal',
      'Luxembourg City, Luxembourg',
      'Madrid, Spain',
      'Milan, Italy',
      'Munich, Germany',
      'Oslo, Norway',
      'Paris, France',
      'Prague, Czech Republic',
      'Rome, Italy',
      'Stockholm, Sweden',
      'Vienna, Austria',
      'Warsaw, Poland',
      'Zurich, Switzerland'
    ]
  },
  {
    region: 'Asia Pacific',
    locations: [
      'Auckland, New Zealand',
      'Bangkok, Thailand',
      'Beijing, China',
      'Brisbane, Australia',
      'Hanoi, Vietnam',
      'Ho Chi Minh City, Vietnam',
      'Hong Kong',
      'Jakarta, Indonesia',
      'Kuala Lumpur, Malaysia',
      'Manila, Philippines',
      'Melbourne, Australia',
      'Perth, Australia',
      'Seoul, South Korea',
      'Shanghai, China',
      'Singapore',
      'Sydney, Australia',
      'Taipei, Taiwan',
      'Tokyo, Japan',
      'Wellington, New Zealand'
    ]
  },
  {
    region: 'Middle East',
    locations: [
      'Abu Dhabi, UAE',
      'Amman, Jordan',
      'Doha, Qatar',
      'Dubai, UAE',
      'Jeddah, Saudi Arabia',
      'Kuwait City, Kuwait',
      'Manama, Bahrain',
      'Muscat, Oman',
      'Riyadh, Saudi Arabia'
    ]
  },
  {
    region: 'Africa',
    locations: [
      'Accra, Ghana',
      'Cairo, Egypt',
      'Cape Town, South Africa',
      'Casablanca, Morocco',
      'Johannesburg, South Africa',
      'Lagos, Nigeria',
      'Nairobi, Kenya'
    ]
  },
  {
    region: 'Latin America',
    locations: [
      'Bogotá, Colombia',
      'Buenos Aires, Argentina',
      'Lima, Peru',
      'Montevideo, Uruguay',
      'Quito, Ecuador',
      'Santiago, Chile',
      'São Paulo, Brazil'
    ]
  }
];

/** Flat sorted list of all location labels. */
export const TCS_LOCATIONS: string[] = TCS_LOCATION_GROUPS.flatMap(g => g.locations);

export interface CampusContactInfo {
  location: string;
  city: string;
  country: string;
  committee: string;
  address: string;
  phone: string;
  email: string;
  region: string;
}

/** Known flagship campus overrides (address / main helpdesk lines). */
const CAMPUS_CONTACT_OVERRIDES: Record<string, Partial<CampusContactInfo>> = {
  'Chennai, India': {
    address: 'Siruseri Campus, TCS Chennai, Tamil Nadu, India',
    phone: '+91 44 6616 8888 (Ext. 200)',
    email: 'playsmart.chennai@tcs.com',
    committee: 'TCS Chennai Sports Committee'
  },
  'Bengaluru, India': {
    address: 'TCS Bengaluru Campus, Karnataka, India',
    phone: '+91 80 6725 7000 (Ext. 200)',
    email: 'playsmart.bengaluru@tcs.com'
  },
  'Hyderabad, India': {
    address: 'TCS Hyderabad Campus, Telangana, India',
    phone: '+91 40 6667 2000 (Ext. 200)',
    email: 'playsmart.hyderabad@tcs.com'
  },
  'Mumbai, India': {
    address: 'TCS Mumbai Campus, Maharashtra, India',
    phone: '+91 22 6778 9000 (Ext. 200)',
    email: 'playsmart.mumbai@tcs.com'
  },
  'Pune, India': {
    address: 'TCS Pune Campus, Maharashtra, India',
    phone: '+91 20 6608 7000 (Ext. 200)',
    email: 'playsmart.pune@tcs.com'
  },
  'Delhi NCR, India': {
    address: 'TCS Delhi NCR Campus, India',
    phone: '+91 11 6650 7000 (Ext. 200)',
    email: 'playsmart.delhincr@tcs.com'
  },
  'Gurugram, India': {
    address: 'TCS Gurugram Campus, Haryana, India',
    phone: '+91 124 665 7000 (Ext. 200)',
    email: 'playsmart.gurugram@tcs.com'
  },
  'Noida, India': {
    address: 'TCS Noida Campus, Uttar Pradesh, India',
    phone: '+91 120 665 7000 (Ext. 200)',
    email: 'playsmart.noida@tcs.com'
  },
  'Kolkata, India': {
    address: 'TCS Kolkata Campus, West Bengal, India',
    phone: '+91 33 6621 2000 (Ext. 200)',
    email: 'playsmart.kolkata@tcs.com'
  },
  'Ahmedabad, India': {
    address: 'TCS Ahmedabad Campus, Gujarat, India',
    phone: '+91 79 6670 2000 (Ext. 200)',
    email: 'playsmart.ahmedabad@tcs.com'
  },
  'Coimbatore, India': {
    address: 'TCS Coimbatore Campus, Tamil Nadu, India',
    phone: '+91 422 665 2000 (Ext. 200)',
    email: 'playsmart.coimbatore@tcs.com'
  },
  'Kochi, India': {
    address: 'TCS Kochi Campus, Kerala, India',
    phone: '+91 484 661 2000 (Ext. 200)',
    email: 'playsmart.kochi@tcs.com'
  },
  'London, UK': {
    address: 'TCS London Office, United Kingdom',
    phone: '+44 20 7240 0000',
    email: 'playsmart.london@tcs.com'
  },
  'New York, USA': {
    address: 'TCS New York Office, USA',
    phone: '+1 212 555 0100',
    email: 'playsmart.newyork@tcs.com'
  },
  'Singapore': {
    address: 'TCS Singapore Campus, Singapore',
    phone: '+65 6660 2000',
    email: 'playsmart.singapore@tcs.com'
  },
  'Dubai, UAE': {
    address: 'TCS Dubai Office, United Arab Emirates',
    phone: '+971 4 365 2000',
    email: 'playsmart.dubai@tcs.com'
  }
};

function slugForEmail(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'campus';
}

function defaultPhoneForRegion(region: string): string {
  if (region.startsWith('India')) return '+91 1800 209 4455 (Campus Helpdesk)';
  if (region.includes('United States') || region.includes('Canada') || region.includes('Mexico')) {
    return '+1 877 827 8277 (Campus Helpdesk)';
  }
  if (region.includes('United Kingdom') || region.includes('Ireland')) {
    return '+44 800 917 7994 (Campus Helpdesk)';
  }
  if (region.includes('Europe')) return '+44 20 7240 0000 (EMEA Helpdesk)';
  if (region.includes('Asia Pacific')) return '+65 6660 2000 (APAC Helpdesk)';
  if (region.includes('Middle East')) return '+971 4 365 2000 (MEA Helpdesk)';
  if (region.includes('Africa')) return '+27 11 785 6000 (Africa Helpdesk)';
  if (region.includes('Latin America')) return '+55 11 5186 1000 (LATAM Helpdesk)';
  return '+91 1800 209 4455 (Campus Helpdesk)';
}

function findRegionForLocation(location: string): string {
  const key = normalizeLocation(location);
  for (const group of TCS_LOCATION_GROUPS) {
    if (group.locations.some(l => sameLocation(l, key))) return group.region;
  }
  return 'Global';
}

/** Contact / helpdesk details for a campus — updates with the landing-page location picker. */
export function getCampusContactInfo(location?: string | null): CampusContactInfo {
  const loc = normalizeLocation(location) || DEFAULT_TCS_LOCATION;
  const [cityPart, ...rest] = loc.split(',');
  const city = (cityPart || loc).trim();
  const country = rest.join(',').trim() || city;
  const region = findRegionForLocation(loc);
  const override = CAMPUS_CONTACT_OVERRIDES[loc] || {};

  return {
    location: loc,
    city,
    country,
    region,
    committee: override.committee || `TCS ${city} Sports Committee`,
    address: override.address || `TCS ${city} Campus, ${country}`,
    phone: override.phone || defaultPhoneForRegion(region),
    email: override.email || `playsmart.${slugForEmail(city)}@tcs.com`
  };
}
