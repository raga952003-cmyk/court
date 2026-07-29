/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Facility, SportType, SlotTime } from '../types';

export const SPORT_FACILITIES_METADATA: { sport: SportType; count: number; prefix: string }[] = [
  { sport: 'Badminton', count: 3, prefix: 'Court' },
  { sport: 'Basketball', count: 2, prefix: 'Court' },
  { sport: 'Volleyball', count: 2, prefix: 'Court' },
  { sport: 'Table Tennis', count: 2, prefix: 'Table' },
  { sport: 'Carrom', count: 5, prefix: 'Board' },
  { sport: 'Box Cricket', count: 1, prefix: 'Ground' },
];

export const INITIAL_FACILITIES: Facility[] = [
  // Badminton (3 Courts)
  { facilityId: 'badminton_c1', sport: 'Badminton', courtName: 'Court 1', status: 'active' },
  { facilityId: 'badminton_c2', sport: 'Badminton', courtName: 'Court 2', status: 'active' },
  { facilityId: 'badminton_c3', sport: 'Badminton', courtName: 'Court 3', status: 'active' },
  
  // Basketball (2 Courts)
  { facilityId: 'basketball_c1', sport: 'Basketball', courtName: 'Court 1', status: 'active' },
  { facilityId: 'basketball_c2', sport: 'Basketball', courtName: 'Court 2', status: 'active' },
  
  // Volleyball (2 Courts)
  { facilityId: 'volleyball_c1', sport: 'Volleyball', courtName: 'Court 1', status: 'active' },
  { facilityId: 'volleyball_c2', sport: 'Volleyball', courtName: 'Court 2', status: 'active' },
  
  // Table Tennis (2 Tables)
  { facilityId: 'tt_t1', sport: 'Table Tennis', courtName: 'Table 1', status: 'active' },
  { facilityId: 'tt_t2', sport: 'Table Tennis', courtName: 'Table 2', status: 'active' },
  
  // Carrom (5 Boards)
  { facilityId: 'carrom_b1', sport: 'Carrom', courtName: 'Board 1', status: 'active' },
  { facilityId: 'carrom_b2', sport: 'Carrom', courtName: 'Board 2', status: 'active' },
  { facilityId: 'carrom_b3', sport: 'Carrom', courtName: 'Board 3', status: 'active' },
  { facilityId: 'carrom_b4', sport: 'Carrom', courtName: 'Board 4', status: 'active' },
  { facilityId: 'carrom_b5', sport: 'Carrom', courtName: 'Board 5', status: 'active' },
  
  // Box Cricket (1 Ground)
  { facilityId: 'cricket_g1', sport: 'Box Cricket', courtName: 'Ground 1', status: 'active' },
];

export const SLOT_TIMES: SlotTime[] = [
  '6-7 AM',
  '7-8 AM',
  '8-9 AM',
  '9-10 AM',
  '10-11 AM',
  '11-12 PM',
  '12-1 PM',
  '1-2 PM',
  '2-3 PM',
  '3-4 PM',
  '4-5 PM',
  '5-6 PM',
  '6-7 PM',
  '7-8 PM'
];
