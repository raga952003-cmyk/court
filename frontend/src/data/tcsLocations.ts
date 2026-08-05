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
