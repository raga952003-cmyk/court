/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'employee' | 'security' | 'admin';

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phoneNumber?: string;
  department: string;
  businessUnit: string;
  role: UserRole;
  password?: string;
  avatar?: string;
  approved?: boolean;
  status?: 'active' | 'inactive' | 'pending' | 'rejected';
  suspendedUntil?: string;
  rejectionReason?: string;
  createdAt: string;
}

export type SportType = 'Badminton' | 'Basketball' | 'Volleyball' | 'Table Tennis' | 'Carrom' | 'Box Cricket';

export interface Facility {
  facilityId: string;
  sport: SportType;
  courtName: string;
  status: 'active' | 'maintenance';
}

export type SlotTime = 
  | '6-7 AM'
  | '7-8 AM'
  | '8-9 AM'
  | '9-10 AM'
  | '10-11 AM'
  | '11-12 PM'
  | '12-1 PM'
  | '1-2 PM'
  | '2-3 PM'
  | '3-4 PM'
  | '4-5 PM'
  | '5-6 PM'
  | '6-7 PM'
  | '7-8 PM';

export type BookingSource = 'online' | 'security';

export type BookingStatus = 'confirmed' | 'checked_in' | 'no_show' | 'cancelled';

export interface Booking {
  bookingId: string;
  employeeId: string;
  employeeName: string;
  facilityId: string;
  sport: SportType;
  courtName: string;
  slotTime: SlotTime;
  bookingSource: BookingSource;
  status: BookingStatus;
  createdAt: string;
  additionalPlayers?: Array<{ employeeId: string; name: string; email: string }>;
}

export interface Attendance {
  attendanceId: string;
  bookingId: string;
  checkInTime: string;
  verifiedBy: string; // ID of security user
  status: 'checked_in' | 'no_show';
}

export interface Notification {
  id: string;
  employeeId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

export interface WaitlistEntry {
  waitlistId: string;
  employeeId: string;
  employeeName: string;
  facilityId: string;
  sport: SportType;
  courtName: string;
  slotTime: SlotTime;
  createdAt: string;
}

