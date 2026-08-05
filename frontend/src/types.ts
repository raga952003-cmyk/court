/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'employee' | 'security' | 'admin' | 'it';

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

/** Sport / game name — location admins can add custom categories (not limited to a fixed set). */
export type SportType = string;

export interface Facility {
  facilityId: string;
  sport: SportType;
  courtName: string;
  status: 'active' | 'maintenance';
  /** TCS office location (same values as user.businessUnit / Location on register) */
  location: string;
  /** Optional per-court max players; if unset, location sport capacity is used */
  playerCapacity?: number;
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

export type InviteStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface BookingInvite {
  inviteId: string;
  bookingId: string;
  organizerEmployeeId: string;
  inviteeEmployeeId: string;
  inviteeName: string;
  facilityId: string;
  sport: SportType;
  courtName: string;
  slotTime: SlotTime;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
  acceptedBookingId?: string;
}

export interface InvitePlayerInput {
  employeeId: string;
  name: string;
}

export type TicketCategory = 'general' | 'court' | 'application';
export type TicketQueue = 'admin' | 'security' | 'it';
export type TicketStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'escalated';

export interface SupportTicket {
  ticketId: string;
  reporterEmployeeId: string;
  reporterName: string;
  reporterRole: 'employee' | 'admin';
  category: TicketCategory;
  subject: string;
  details: string;
  facilityId?: string;
  courtName?: string;
  sport?: string;
  assignedQueue: TicketQueue;
  status: TicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  escalateAt: string;
  escalatedAt?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  assignedToEmployeeId?: string;
  resolutionNotes?: string;
}

