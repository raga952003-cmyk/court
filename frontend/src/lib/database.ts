import { createClient } from '@supabase/supabase-js';
import {
  User,
  Facility,
  Booking,
  Notification,
  SlotTime,
  SportType,
  BookingStatus,
  Attendance,
  WaitlistEntry,
  BookingSource,
  BookingInvite,
  InvitePlayerInput,
  InviteStatus,
  SupportTicket,
  TicketCategory,
  TicketQueue,
  TicketStatus
} from '../types';
import { hashPassword, verifyPassword, generateTempPassword, isPasswordHash } from './password';
import { apiFetch } from './api';
import { DEFAULT_SPORTS } from '../data/initialData';
import { DEFAULT_TCS_LOCATION, normalizeLocation, sameLocation } from '../data/tcsLocations';
import {
  getWallClockIST,
  isEmployeeOnlineBookingOpen,
  isSecurityDeskBookingOpen,
  isSlotPastOrStarted
} from './timeWindows';

function notifyFacilitiesChanged() {
  try {
    localStorage.setItem('playsmart_facilities_rev', String(Date.now()));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event('facilities_change'));
}

function notifyUsersChanged() {
  try {
    localStorage.setItem('playsmart_users_rev', String(Date.now()));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event('users_change'));
}

/** Canonical system_settings / localStorage key for a location-scoped setting. */
function locationSettingKey(prefix: string, location?: string | null): string {
  const loc = normalizeLocation(location);
  return loc ? `${prefix}::${loc}` : prefix;
}

const INVITE_TTL_MS = 5 * 60 * 1000;
const TICKET_ESCALATE_MS = 10 * 60 * 1000;

/** Public user columns — omit `avatar` so register works if that column is not migrated yet */
const USER_PUBLIC_SELECT =
  'id, employee_id, name, email, phone_number, department, business_unit, role, approved, status, suspended_until, rejection_reason, created_at';

function mapTicket(row: any): SupportTicket {
  return {
    ticketId: row.ticket_id,
    reporterEmployeeId: row.reporter_employee_id,
    reporterName: row.reporter_name,
    reporterRole: row.reporter_role,
    category: row.category as TicketCategory,
    subject: row.subject,
    details: row.details,
    facilityId: row.facility_id || undefined,
    courtName: row.court_name || undefined,
    sport: row.sport || undefined,
    assignedQueue: row.assigned_queue as TicketQueue,
    status: row.status as TicketStatus,
    priority: row.priority,
    createdAt: row.created_at,
    escalateAt: row.escalate_at,
    escalatedAt: row.escalated_at || undefined,
    acknowledgedAt: row.acknowledged_at || undefined,
    resolvedAt: row.resolved_at || undefined,
    assignedToEmployeeId: row.assigned_to_employee_id || undefined,
    resolutionNotes: row.resolution_notes || undefined
  };
}

function initialQueueForCategory(category: TicketCategory): TicketQueue {
  if (category === 'court') return 'security';
  if (category === 'application') return 'it';
  return 'admin';
}

function mapPublicUser(u: any): User {
  return {
    id: u.id,
    employeeId: u.employee_id,
    name: u.name,
    email: u.email,
    phoneNumber: u.phone_number || '',
    department: u.department,
    businessUnit: normalizeLocation(u.business_unit) || u.business_unit,
    role: u.role,
    // Never keep plaintext/hash passwords in client session objects
    password: undefined,
    avatar: u.avatar || '',
    approved: u.approved,
    status: u.status || 'active',
    suspendedUntil: u.suspended_until,
    rejectionReason: u.rejection_reason,
    createdAt: u.created_at
  };
}

function mapInvite(row: any): BookingInvite {
  return {
    inviteId: row.invite_id,
    bookingId: row.booking_id,
    organizerEmployeeId: row.organizer_employee_id,
    inviteeEmployeeId: row.invitee_employee_id,
    inviteeName: row.invitee_name,
    facilityId: row.facility_id,
    sport: row.sport as SportType,
    courtName: row.court_name,
    slotTime: row.slot_time as SlotTime,
    status: row.status as InviteStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    respondedAt: row.responded_at || undefined,
    acceptedBookingId: row.accepted_booking_id || undefined
  };
}

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env');
} else if (!supabaseKey.startsWith('eyJ')) {
  console.error(
    'VITE_SUPABASE_ANON_KEY does not look like a JWT. Use the anon public key from Supabase → Project Settings → API.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  }
});

/** Map PostgREST / Supabase errors into actionable UI messages. */
function throwSupabaseError(error: any, context: string): never {
  const msg = String(error?.message || error || 'Unknown database error');
  const code = String(error?.code || '');
  const status = Number(error?.status || error?.statusCode || 0);
  const lower = msg.toLowerCase();

  if (
    status === 401 ||
    code === '401' ||
    code === 'PGRST301' ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('jwt')
  ) {
    throw new Error(
      `${context}: Supabase 401 Unauthorized. ` +
        `1) Confirm VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in frontend/.env (anon public key). ` +
        `2) Restart Vite / rebuild. ` +
        `3) Run supabase_anon_grants.sql in Supabase SQL Editor (GRANT + disable RLS).`
    );
  }
  if (code === '42501' || lower.includes('permission denied')) {
    throw new Error(
      `${context}: permission denied. Run supabase_anon_grants.sql in Supabase SQL Editor.`
    );
  }
  throw new Error(msg);
}

export const db = {
  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select(USER_PUBLIC_SELECT);
    if (error) throw new Error(error.message);
    return (data || []).map(mapPublicUser);
  },

  async hasAdmin(): Promise<boolean> {
    const { data, error } = await supabase
      .from('users')
      .select('role, status, approved')
      .eq('role', 'admin');
    if (error) throw new Error(error.message);
    return (data || []).some(u => this.isApprovingAdminRow(u));
  },

  isApprovingAdminRow(u: {
    status?: string | null;
    approved?: boolean | null;
    role?: string | null;
  }): boolean {
    if ((u.role || '').toLowerCase() !== 'admin') return false;
    if (u.approved === false) return false;
    const st = (u.status || 'active').toLowerCase();
    return st === 'active';
  },

  /** Active (approved) admins for a TCS location — used for staff approval messaging. */
  async getLocationAdmins(location: string): Promise<{ name: string; email: string; employeeId: string }[]> {
    const loc = normalizeLocation(location);
    if (!loc) return [];
    const { data, error } = await supabase
      .from('users')
      .select('name, email, employee_id, status, approved, role, business_unit')
      .eq('role', 'admin');
    if (error) throw new Error(error.message);
    return (data || [])
      .filter(u => sameLocation(u.business_unit, loc) && this.isApprovingAdminRow(u))
      .map(u => ({
        name: String(u.name || 'Admin'),
        email: String(u.email || ''),
        employeeId: String(u.employee_id || '')
      }));
  },

  /** Prefer location admins; if none, any active admin (so pending users always see a named contact). */
  async getApproverContacts(location: string): Promise<{
    admins: { name: string; email: string; employeeId: string }[];
    scope: 'location' | 'global';
  }> {
    const locationAdmins = await this.getLocationAdmins(location);
    if (locationAdmins.length > 0) {
      return { admins: locationAdmins, scope: 'location' };
    }
    const { data, error } = await supabase
      .from('users')
      .select('name, email, employee_id, status, approved, role, business_unit')
      .eq('role', 'admin');
    if (error) throw new Error(error.message);
    const globalAdmins = (data || [])
      .filter(u => this.isApprovingAdminRow(u))
      .map(u => ({
        name: String(u.name || 'Admin'),
        email: String(u.email || ''),
        employeeId: String(u.employee_id || '')
      }));
    return { admins: globalAdmins, scope: 'global' };
  },

  async hasActiveAdminAtLocation(location: string): Promise<boolean> {
    const admins = await this.getLocationAdmins(location);
    return admins.length > 0;
  },

  formatLocationAdminContacts(
    admins: { name: string; email: string; employeeId?: string }[]
  ): string {
    if (!admins.length) return '';
    return admins
      .map(a => {
        const idPart = a.employeeId ? `, Emp ID: ${a.employeeId}` : '';
        return `${a.name} (${a.email}${idPart})`;
      })
      .join('; ');
  },

  async buildPendingApprovalMessage(role: string, location: string): Promise<string> {
    const loc = (location || '').trim() || 'your location';
    const roleLabel =
      role === 'admin'
        ? 'System Administrator'
        : role === 'security'
          ? 'Security Officer'
          : role === 'it'
            ? 'IT Support'
            : 'staff';
    const { admins, scope } = await this.getApproverContacts(loc);
    const contacts = this.formatLocationAdminContacts(admins);
    if (!contacts) {
      return `Your ${roleLabel} account at ${loc} is pending approval. No active admin contact was found — ask your campus admin to open Pending Approvals.`;
    }
    if (scope === 'location') {
      return `Your ${roleLabel} account at ${loc} is pending approval with: ${contacts}. Ask them to approve you under Pending Approvals.`;
    }
    return `Your ${roleLabel} account at ${loc} is pending approval. No active admin is listed for this location yet. Contact: ${contacts}.`;
  },

  async initializeAdmin(adminData: any): Promise<{ success: boolean; error?: string; user?: User }> {
    return this.registerUser({ ...adminData, role: 'admin' });
  },

  async registerUser(userData: any): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const empId = userData.employeeId.trim().toUpperCase();
      const email = userData.email.trim().toLowerCase();
      const location = normalizeLocation(userData.businessUnit) || DEFAULT_TCS_LOCATION;
      
      // Check if employee ID already exists
      const { data: existingEmp, error: checkEmpError } = await supabase
        .from('users')
        .select('employee_id')
        .eq('employee_id', empId)
        .maybeSingle();
      if (checkEmpError) throw checkEmpError;
      if (existingEmp) {
        return { success: false, error: `Employee ID ${empId} is already registered.` };
      }

      // Check if email already exists (unique constraint users_email_key)
      const { data: existingEmail, error: checkEmailError } = await supabase
        .from('users')
        .select('employee_id, email')
        .eq('email', email)
        .maybeSingle();
      if (checkEmailError) throw checkEmailError;
      if (existingEmail) {
        return {
          success: false,
          error: `Email ${email} is already registered with Employee ID ${existingEmail.employee_id}. Use a different email or login with that Employee ID.`
        };
      }

      let approved = true;
      let status = 'active';
      // Admin: pending only if this location already has an active admin (first admin bootstraps).
      // Security/IT: pending if this location has an admin, OR any approving admin exists globally.
      if (userData.role === 'admin') {
        if (await this.hasActiveAdminAtLocation(location)) {
          approved = false;
          status = 'pending';
        }
      } else if (userData.role === 'security' || userData.role === 'it') {
        if (await this.hasActiveAdminAtLocation(location)) {
          approved = false;
          status = 'pending';
        } else {
          const { admins } = await this.getApproverContacts(location);
          if (admins.length > 0) {
            approved = false;
            status = 'pending';
          }
        }
      }

      if (!userData.password || String(userData.password).length < 6) {
        return { success: false, error: 'Password must be at least 6 characters.' };
      }

      const id = `u_${Date.now()}`;
      const passwordHash = await hashPassword(String(userData.password));
      const newUser = {
        id,
        employee_id: empId,
        name: userData.name.trim(),
        email,
        phone_number: userData.phoneNumber ? userData.phoneNumber.trim() : '',
        // Department is no longer collected on register; keep DB NOT NULL satisfied
        department: (userData.department && String(userData.department).trim()) || 'N/A',
        business_unit: location,
        role: userData.role || 'employee',
        password: passwordHash,
        approved,
        status
      };

      const { data, error } = await supabase
        .from('users')
        .insert(newUser)
        .select(USER_PUBLIC_SELECT)
        .single();
      if (error) {
        if (error.message?.includes('users_email_key') || error.code === '23505') {
          return {
            success: false,
            error: `Email ${email} is already registered. Use a different email or login with the existing account.`
          };
        }
        if (error.message?.includes('avatar') || error.code === '42703') {
          return {
            success: false,
            error: 'Database schema is missing a column. Run supabase_users_avatar.sql in Supabase SQL Editor, then try again.'
          };
        }
        return {
          success: false,
          error: [error.message, error.details, error.hint].filter(Boolean).join(' — ') || 'Registration failed.'
        };
      }

      notifyUsersChanged();
      return { success: true, user: mapPublicUser(data) };
    } catch (error: any) {
      return { success: false, error: error.message || 'Registration failed.' };
    }
  },

  async loginUser(employeeId: string, password?: string): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      if (!password) {
        return { success: false, error: 'Password is required.' };
      }

      const empId = employeeId.trim().toUpperCase();
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empId)
        .maybeSingle();

      if (error) throw error;
      if (!user) {
        return { success: false, error: 'Invalid Employee ID. No account found.' };
      }

      const ok = await verifyPassword(password, user.password);
      if (!ok) {
        return { success: false, error: 'Incorrect password.' };
      }

      // Upgrade legacy plaintext passwords to bcrypt on successful login
      if (user.password && !isPasswordHash(user.password)) {
        const upgraded = await hashPassword(password);
        await supabase.from('users').update({ password: upgraded }).eq('employee_id', empId);
      }

      if (user.status === 'rejected') {
        return { success: false, error: `Your registration request was rejected by the administrator. Reason: "${user.rejection_reason || 'No comments provided'}"` };
      }

      if (user.status === 'pending' || user.approved === false) {
        const loc = normalizeLocation(user.business_unit);
        const locationAdmins = loc ? await this.getLocationAdmins(loc) : [];
        const isStaff =
          user.role === 'admin' || user.role === 'security' || user.role === 'it';
        // New location bootstrap: first admin at a site with no location admin can activate.
        // Security/IT only auto-activate when there is literally no approving admin anywhere.
        let bootstrapped = false;
        if (isStaff && locationAdmins.length === 0) {
          if (user.role === 'admin') {
            bootstrapped = true;
          } else {
            const { admins } = await this.getApproverContacts(loc || DEFAULT_TCS_LOCATION);
            bootstrapped = admins.length === 0;
          }
        }
        if (bootstrapped) {
          await supabase
            .from('users')
            .update({ approved: true, status: 'active', rejection_reason: null })
            .eq('employee_id', empId);
          user.approved = true;
          user.status = 'active';
          notifyUsersChanged();
        } else {
          const pendingMsg = await this.buildPendingApprovalMessage(
            user.role || 'staff',
            loc || DEFAULT_TCS_LOCATION
          );
          return { success: false, error: pendingMsg };
        }
      }

      if (user.status === 'inactive') {
        return { success: false, error: 'Your account has been deactivated (relieved from the company).' };
      }

      const userObj = mapPublicUser(user);
      localStorage.setItem('playsmart_current_user', JSON.stringify(userObj));
      return { success: true, user: userObj };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async forgotPassword(employeeId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const empId = employeeId.trim().toUpperCase();
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empId)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!user) {
        return { success: false, error: `No registered account matches Employee ID ${empId}.` };
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: passwordHash })
        .eq('employee_id', empId);

      if (updateError) throw updateError;

      const emailBody =
        `Dear ${user.name},\n\n` +
        `We received a password recovery request for TCS PlaySmart.\n\n` +
        `Temporary Password: ${tempPassword}\n\n` +
        `Log in and change your password immediately.\n\n` +
        `Best Regards,\nTCS PlaySmart Admin Team`;

      await supabase.from('simulated_emails').insert({
        id: `email_${Date.now()}`,
        to_email: user.email,
        subject: 'TCS PlaySmart - Password Recovery',
        body: emailBody
      });

      try {
        await apiFetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            subject: 'TCS PlaySmart - Password Recovery',
            body: emailBody
          })
        });
      } catch {
        // optional real email
      }

      window.dispatchEvent(new Event('simulated_email_sent'));
      return { success: true, message: 'A temporary password was emailed / logged to the outbox. Change it after login.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async recoverAdminCredentials(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const emailLower = email.trim().toLowerCase();
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('email', emailLower)
        .eq('role', 'admin')
        .maybeSingle();

      if (selectError) throw selectError;
      if (!user) {
        return { success: false, error: `No registered Administrator account matches email ${emailLower}.` };
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: passwordHash })
        .eq('employee_id', user.employee_id);

      if (updateError) throw updateError;

      const emailBody =
        `Dear ${user.name},\n\n` +
        `Admin credential recovery for TCS PlaySmart.\n\n` +
        `- Employee ID: ${user.employee_id}\n` +
        `- Temporary Password: ${tempPassword}\n\n` +
        `Change your password immediately after login.\n\n` +
        `Best Regards,\nTCS PlaySmart System Services`;

      await supabase.from('simulated_emails').insert({
        id: `email_${Date.now()}`,
        to_email: user.email,
        subject: 'TCS PlaySmart - Admin Credential Recovery',
        body: emailBody
      });

      try {
        await apiFetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: user.email,
            subject: 'TCS PlaySmart - Admin Credential Recovery',
            body: emailBody
          })
        });
      } catch {
        // optional
      }

      window.dispatchEvent(new Event('simulated_email_sent'));
      return { success: true, message: 'Admin credentials recovered. Check outbox / email for the temporary password.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async changePassword(employeeId: string, oldPasswordText: string, newPasswordText: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!newPasswordText || newPasswordText.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters.' };
      }

      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!user) {
        return { success: false, error: 'User not found.' };
      }

      const ok = await verifyPassword(oldPasswordText, user.password);
      if (!ok) {
        return { success: false, error: 'Incorrect current password.' };
      }

      const passwordHash = await hashPassword(newPasswordText);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: passwordHash })
        .eq('employee_id', employeeId);

      if (updateError) throw updateError;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async updateUserProfile(
    employeeId: string, 
    name: string, 
    email: string, 
    phoneNumber: string, 
    avatar: string
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      // Prefer updating avatar when column exists; fall back if schema is older
      let { data, error } = await supabase
        .from('users')
        .update({
          name,
          email,
          phone_number: phoneNumber,
          avatar
        })
        .eq('employee_id', employeeId)
        .select(USER_PUBLIC_SELECT)
        .single();

      if (error && (error.code === '42703' || error.message?.includes('avatar'))) {
        ({ data, error } = await supabase
          .from('users')
          .update({
            name,
            email,
            phone_number: phoneNumber
          })
          .eq('employee_id', employeeId)
          .select(USER_PUBLIC_SELECT)
          .single());
      }
        
      if (error) throw error;

      const userObj = mapPublicUser({ ...data, avatar: avatar || (data as any)?.avatar || '' });
      localStorage.setItem('playsmart_current_user', JSON.stringify(userObj));
      return { success: true, user: userObj };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  getCurrentUser(): User | null {
    try {
      const item = localStorage.getItem('playsmart_current_user');
      if (!item) return null;
      const parsed = JSON.parse(item);
      // Strip any legacy password field from older sessions
      if (parsed && 'password' in parsed) {
        delete parsed.password;
        localStorage.setItem('playsmart_current_user', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return null;
    }
  },

  logoutUser(): void {
    localStorage.removeItem('playsmart_current_user');
  },

  async changeUserRole(userId: string, role: string): Promise<boolean> {
    try {
      const { data: existing, error: getError } = await supabase
        .from('users')
        .select('id, role, status, approved, business_unit')
        .eq('id', userId)
        .maybeSingle();
      if (getError) throw getError;
      if (!existing) return false;

      const nextRole = String(role || '').toLowerCase();
      const prevRole = String(existing.role || '').toLowerCase();
      const isStaffRole = (r: string) => r === 'admin' || r === 'security' || r === 'it';
      // Any move into a different staff role needs approval again (employee→staff or security→admin, etc.)
      const needsStaffApproval = isStaffRole(nextRole) && prevRole !== nextRole;

      const patch: Record<string, unknown> = { role: nextRole };
      if (needsStaffApproval) {
        patch.approved = false;
        patch.status = 'pending';
        patch.rejection_reason = null;
      } else if (nextRole === 'employee') {
        // Demote to employee: always usable for booking (no staff approval gate)
        patch.approved = true;
        if (existing.status === 'pending' || existing.status === 'rejected') {
          patch.status = 'active';
          patch.rejection_reason = null;
        }
      }

      const { error } = await supabase.from('users').update(patch).eq('id', userId);
      if (error) throw error;
      notifyUsersChanged();
      return true;
    } catch {
      return false;
    }
  },

  async toggleUserStatus(userId: string, status: 'active' | 'inactive'): Promise<boolean> {
    try {
      const { data: existing, error: getError } = await supabase
        .from('users')
        .select('id, status, approved, role')
        .eq('id', userId)
        .maybeSingle();
      if (getError) throw getError;
      if (!existing) return false;

      const current = String(existing.status || 'active').toLowerCase();
      // Never flip pending/rejected via activate/deactivate — use Approve / Reject
      if (current === 'pending' || current === 'rejected') {
        throw new Error('Use Approve or Reject for pending registration requests.');
      }
      if (existing.approved === false) {
        throw new Error('This account is awaiting approval. Use Pending Approvals.');
      }

      const patch: Record<string, unknown> = { status };
      // Keep approved flag in sync only when reactivating a previously approved account
      if (status === 'active') {
        patch.approved = true;
      }
      const { error } = await supabase.from('users').update(patch).eq('id', userId);
      if (error) throw error;
      notifyUsersChanged();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async approveUser(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ approved: true, status: 'active', rejection_reason: null })
        .eq('id', userId);
      if (error) throw error;
      notifyUsersChanged();
      return true;
    } catch {
      return false;
    }
  },

  async approveUserWithComments(userId: string, comments: string): Promise<boolean> {
    try {
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (selectError || !user) throw selectError || new Error('User not found');
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ approved: true, status: 'active', rejection_reason: null })
        .eq('id', userId);
      if (updateError) throw updateError;

      const emailId = `email_${Date.now()}`;
      await supabase.from('simulated_emails').insert({
        id: emailId,
        to_email: user.email,
        subject: 'TCS PlaySmart - Account Approved! 🎉',
        body: `Dear ${user.name},\n\nCongratulations! Your TCS PlaySmart ${user.role} account request has been approved and activated.\n\nAdministrator Comments:\n"${comments || 'Welcome to the platform!'}"\n\nYou can now log in to your portal using your credentials.\n\nBest Regards,\nTCS PlaySmart Sports Committee`
      });
      notifyUsersChanged();
      return true;
    } catch {
      return false;
    }
  },

  async rejectUser(userId: string, comments: string): Promise<boolean> {
    try {
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (selectError || !user) throw selectError || new Error('User not found');
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ status: 'rejected', approved: false, rejection_reason: comments })
        .eq('id', userId);
      if (updateError) throw updateError;

      const emailId = `email_${Date.now()}`;
      await supabase.from('simulated_emails').insert({
        id: emailId,
        to_email: user.email,
        subject: 'TCS PlaySmart - Account Request Rejected ❌',
        body: `Dear ${user.name},\n\nYour request for a TCS PlaySmart ${user.role} account has been rejected by the administrator.\n\nAdministrator Rejection Comments/Reason:\n"${comments}"\n\nBest Regards,\nTCS PlaySmart Sports Committee`
      });
      notifyUsersChanged();
      return true;
    } catch {
      return false;
    }
  },

  // --- FACILITIES (location-scoped) ---
  mapFacility(f: any): Facility {
    return {
      facilityId: f.facility_id,
      sport: f.sport as SportType,
      courtName: f.court_name,
      status: f.status as 'active' | 'maintenance',
      location: normalizeLocation(f.location) || DEFAULT_TCS_LOCATION,
      playerCapacity:
        typeof f.player_capacity === 'number' && f.player_capacity > 0
          ? f.player_capacity
          : undefined
    };
  },

  defaultSportCapacities(): Record<string, number> {
    return {
      Badminton: 4,
      Carrom: 4,
      'Table Tennis': 4,
      Basketball: 10,
      'Box Cricket': 22,
      Volleyball: 12
    };
  },

  /** Effective max players for a court at a location. */
  async getFacilityCapacity(facility: Facility): Promise<number> {
    if (facility.playerCapacity && facility.playerCapacity > 0) {
      return facility.playerCapacity;
    }
    const caps = await this.getSportCapacities(facility.location);
    return caps[facility.sport] || 4;
  },

  /** All facilities, or only those at a TCS location (normalized match). */
  async getFacilities(location?: string): Promise<Facility[]> {
    const { data, error } = await supabase.from('facilities').select('*').order('facility_id');
    if (error) {
      // Older DB without location column — return unscoped map
      if (error.code === '42703' || error.message?.includes('location')) {
        const fallback = await supabase.from('facilities').select('facility_id, sport, court_name, status').order('facility_id');
        if (fallback.error) throwSupabaseError(fallback.error, 'Load facilities');
        return (fallback.data || []).map(f => this.mapFacility({ ...f, location: DEFAULT_TCS_LOCATION }));
      }
      throwSupabaseError(error, 'Load facilities');
    }
    let list = (data || []).map(f => this.mapFacility(f));
    const loc = normalizeLocation(location);
    if (loc) {
      list = list.filter(f => sameLocation(f.location, loc));
    }
    return list;
  },

  async toggleFacilityMaintenance(facilityId: string, location?: string): Promise<Facility[]> {
    const { data: current, error: getError } = await supabase
      .from('facilities')
      .select('status, location')
      .eq('facility_id', facilityId)
      .single();
    if (getError) throwSupabaseError(getError, 'Load facility');

    if (location && current.location && !sameLocation(current.location, location)) {
      throw new Error('You can only manage courts at your assigned location.');
    }
    
    const nextStatus = current.status === 'active' ? 'maintenance' : 'active';
    const { error: updateError } = await supabase
      .from('facilities')
      .update({ status: nextStatus })
      .eq('facility_id', facilityId);
    if (updateError) throwSupabaseError(updateError, 'Update facility status');
    notifyFacilitiesChanged();
    return this.getFacilities(location);
  },

  async addFacility(
    sport: SportType,
    courtName: string,
    location: string,
    playerCapacity?: number
  ): Promise<Facility[]> {
    const loc = normalizeLocation(location);
    if (!loc) throw new Error('Location is required to add a court.');
    const name = courtName.trim();
    if (!name) throw new Error('Court name is required.');
    const sportName = this.normalizeSportName(sport);
    if (!sportName) throw new Error('Sport category is required.');

    // Ensure this sport exists in the location's editable category list
    const sports = await this.getLocationSports(loc);
    let canonical = sports.find(s => s.toLowerCase() === sportName.toLowerCase());
    if (!canonical) {
      await this.addLocationSport(sportName, loc);
      canonical = sportName;
    }
    return this.insertFacilityRow(canonical, name, loc, playerCapacity);
  },

  async insertFacilityRow(
    sport: string,
    courtName: string,
    loc: string,
    playerCapacity?: number
  ): Promise<Facility[]> {
    const facilityId = `${sport.toLowerCase().replace(/ /g, '_')}_${loc.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24)}_${Date.now()}`;
    const baseRow: Record<string, unknown> = {
      facility_id: facilityId,
      sport,
      court_name: courtName,
      status: 'active',
      location: loc
    };
    const withCap =
      playerCapacity && playerCapacity >= 1
        ? { ...baseRow, player_capacity: Math.min(100, Math.floor(playerCapacity)) }
        : baseRow;

    let { error } = await supabase.from('facilities').insert(withCap);
    // Retry without optional columns if schema not migrated yet
    if (
      error &&
      (error.code === '42703' || error.message?.includes('player_capacity'))
    ) {
      ({ error } = await supabase.from('facilities').insert(baseRow));
    }
    if (error) {
      if (error.code === '23505') {
        throw new Error(`A ${sport} court named "${courtName}" already exists at ${loc}.`);
      }
      if (error.code === '42703' || error.message?.includes('location')) {
        throw new Error(
          'Database is missing the facilities.location column. Run supabase_facility_locations.sql (and supabase_location_capacities.sql) in Supabase SQL Editor, then try again.'
        );
      }
      throwSupabaseError(error, 'Add facility');
    }
    notifyFacilitiesChanged();
    return this.getFacilities(loc);
  },

  async updateFacilityCapacity(
    facilityId: string,
    playerCapacity: number | null,
    location?: string
  ): Promise<Facility[]> {
    if (location) {
      const { data: fac, error: getErr } = await supabase
        .from('facilities')
        .select('location')
        .eq('facility_id', facilityId)
        .maybeSingle();
      if (getErr) throwSupabaseError(getErr, 'Load facility');
      if (fac?.location && !sameLocation(fac.location, location)) {
        throw new Error('You can only update courts at your assigned location.');
      }
    }
    const { error } = await supabase
      .from('facilities')
      .update({
        player_capacity:
          playerCapacity && playerCapacity >= 1 ? Math.min(100, Math.floor(playerCapacity)) : null
      })
      .eq('facility_id', facilityId);
    if (error) {
      if (error.code === '42703' || error.message?.includes('player_capacity')) {
        throw new Error('Run supabase_location_capacities.sql in Supabase to enable per-court capacity.');
      }
      throwSupabaseError(error, 'Update court capacity');
    }
    notifyFacilitiesChanged();
    return this.getFacilities(location);
  },

  async deleteFacility(facilityId: string, location?: string): Promise<Facility[]> {
    if (location) {
      const { data: fac, error: getErr } = await supabase
        .from('facilities')
        .select('location')
        .eq('facility_id', facilityId)
        .maybeSingle();
      if (getErr) throwSupabaseError(getErr, 'Load facility');
      if (fac?.location && !sameLocation(fac.location, location)) {
        throw new Error('You can only remove courts at your assigned location.');
      }
    }
    // Delete bookings and waitlist entries for this facility to emulate cascade deletion
    await supabase.from('waitlist').delete().eq('facility_id', facilityId);
    await supabase.from('bookings').delete().eq('facility_id', facilityId);
    const { error } = await supabase.from('facilities').delete().eq('facility_id', facilityId);
    if (error) throwSupabaseError(error, 'Delete facility');
    notifyFacilitiesChanged();
    return this.getFacilities(location);
  },

  // --- BOOKINGS ---
  async getBookings(): Promise<Booking[]> {
    const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(b => ({
      bookingId: b.booking_id,
      employeeId: b.employee_id,
      employeeName: b.employee_name,
      facilityId: b.facility_id,
      sport: b.sport as SportType,
      courtName: b.court_name,
      slotTime: b.slot_time as SlotTime,
      bookingSource: b.booking_source as BookingSource,
      status: b.status as BookingStatus,
      createdAt: b.created_at,
      additionalPlayers: []
    }));
  },

  async expireStaleInvites(): Promise<void> {
    try {
      await supabase.rpc('expire_stale_booking_invites');
      return;
    } catch {
      // RPC may not be deployed yet
    }
    const nowIso = new Date().toISOString();
    await supabase
      .from('booking_invites')
      .update({ status: 'expired', responded_at: nowIso })
      .eq('status', 'pending')
      .lt('expires_at', nowIso);
  },

  async getPendingInviteCount(facilityId: string, slotTime: SlotTime): Promise<number> {
    await this.expireStaleInvites();
    const { count, error } = await supabase
      .from('booking_invites')
      .select('*', { count: 'exact', head: true })
      .eq('facility_id', facilityId)
      .eq('slot_time', slotTime)
      .eq('status', 'pending');
    if (error) {
      // Table may not exist yet on older deployments
      console.warn('getPendingInviteCount:', error.message);
      return 0;
    }
    return count || 0;
  },

  async getSlotOccupancy(facilityId: string, slotTime: SlotTime): Promise<number> {
    const bookings = await this.getBookings();
    const confirmed = bookings.filter(
      b => b.facilityId === facilityId && b.slotTime === slotTime && b.status !== 'cancelled'
    ).length;
    const pending = await this.getPendingInviteCount(facilityId, slotTime);
    return confirmed + pending;
  },

  async getInvitesForEmployee(employeeId: string): Promise<BookingInvite[]> {
    await this.expireStaleInvites();
    const empId = employeeId.trim().toUpperCase();
    const { data, error } = await supabase
      .from('booking_invites')
      .select('*')
      .eq('invitee_employee_id', empId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('getInvitesForEmployee:', error.message);
      return [];
    }
    return (data || []).map(mapInvite);
  },

  async getPendingInvitesForSlot(facilityId: string, slotTime: SlotTime): Promise<BookingInvite[]> {
    await this.expireStaleInvites();
    const { data, error } = await supabase
      .from('booking_invites')
      .select('*')
      .eq('facility_id', facilityId)
      .eq('slot_time', slotTime)
      .eq('status', 'pending');
    if (error) {
      console.warn('getPendingInvitesForSlot:', error.message);
      return [];
    }
    return (data || []).map(mapInvite);
  },

  async getAllPendingInvites(): Promise<BookingInvite[]> {
    await this.expireStaleInvites();
    const { data, error } = await supabase
      .from('booking_invites')
      .select('*')
      .eq('status', 'pending');
    if (error) {
      console.warn('getAllPendingInvites:', error.message);
      return [];
    }
    return (data || []).map(mapInvite);
  },

  async lookupRegisteredUser(employeeId: string): Promise<{ success: boolean; error?: string; user?: User }> {
    const empId = employeeId.trim().toUpperCase();
    if (!empId) return { success: false, error: 'Employee ID is required.' };
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('employee_id', empId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) {
      return { success: false, error: `Employee ID ${empId} is not registered. They must register before they can be invited.` };
    }
    if (data.status === 'inactive') {
      return { success: false, error: `Employee ID ${empId} is inactive and cannot be invited.` };
    }
    if (data.status === 'pending' || data.approved === false) {
      return { success: false, error: `Employee ID ${empId} is not an approved account yet.` };
    }
    if (data.suspended_until && new Date(data.suspended_until) > new Date()) {
      return { success: false, error: `Employee ID ${empId} is currently suspended from booking.` };
    }
    return { success: true, user: mapPublicUser(data) };
  },

  async createBooking(bookingData: {
    employeeId: string;
    email?: string;
    facilityId: string;
    slotTime: SlotTime;
    bookingSource: 'online' | 'security';
    additionalPlayers?: InvitePlayerInput[];
  }): Promise<{ success: boolean; error?: string; booking?: Booking; invitesSent?: number }> {
    try {
      const empId = bookingData.employeeId.trim().toUpperCase();
      const email = bookingData.email ? bookingData.email.trim().toLowerCase() : '';
      const inviteInputs = (bookingData.additionalPlayers || [])
        .map(p => ({
          employeeId: (p.employeeId || '').trim().toUpperCase(),
          name: (p.name || '').trim()
        }))
        .filter(p => p.employeeId);

      const { data: facility, error: facError } = await supabase
        .from('facilities')
        .select('*')
        .eq('facility_id', bookingData.facilityId)
        .single();
      if (facError) throw facError;

      const { data: creator, error: creatorError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empId)
        .maybeSingle();
      if (creatorError) throw creatorError;

      if (!creator) {
        return { success: false, error: `Employee ID ${empId} is not registered. Register before booking.` };
      }

      // Courts are location-scoped — employee can only book at their registered location
      const facilityLoc = normalizeLocation(facility.location) || DEFAULT_TCS_LOCATION;
      const creatorLoc = normalizeLocation(creator.business_unit);
      if (!creatorLoc) {
        return {
          success: false,
          error: 'Your account has no location assigned. Contact your location admin before booking.'
        };
      }
      if (!sameLocation(facilityLoc, creatorLoc)) {
        return {
          success: false,
          error: `This court belongs to ${facilityLoc}. Your location is ${creatorLoc}. Book courts at your location only.`
        };
      }
      if (email && creator.email.toLowerCase() !== email) {
        return { success: false, error: `The provided Email ID does not match the registered Email for Employee ID ${empId}.` };
      }
      if (creator.status === 'pending' || creator.approved === false) {
        return { success: false, error: 'Your account is pending approval and cannot book courts yet.' };
      }
      if (creator.status === 'rejected') {
        return { success: false, error: 'Your registration was rejected. You cannot book courts.' };
      }
      if (creator.status === 'inactive') {
        return { success: false, error: 'Your account is inactive (deactivated or relieved).' };
      }
      if (creator.suspended_until && new Date(creator.suspended_until) > new Date()) {
        const dateStr = new Date(creator.suspended_until).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return { success: false, error: `Your booking privileges are suspended until ${dateStr} due to a recent No-Show violation.` };
      }

      // Validate invitees (must be registered; no auto-register)
      const resolvedInvitees: Array<{ employeeId: string; name: string; email: string }> = [];
      const seen = new Set<string>();
      for (const invite of inviteInputs) {
        if (invite.employeeId === empId) {
          return { success: false, error: 'You cannot invite yourself as an additional player.' };
        }
        if (seen.has(invite.employeeId)) {
          return { success: false, error: `Duplicate invite for Employee ID ${invite.employeeId}.` };
        }
        seen.add(invite.employeeId);

        const lookup = await this.lookupRegisteredUser(invite.employeeId);
        if (!lookup.success || !lookup.user) {
          return { success: false, error: lookup.error || `Employee ID ${invite.employeeId} is not registered.` };
        }
        if (invite.name && invite.name.toLowerCase() !== lookup.user.name.trim().toLowerCase()) {
          return {
            success: false,
            error: `Name for ${invite.employeeId} does not match registered name (${lookup.user.name}).`
          };
        }
        if (!sameLocation(lookup.user.businessUnit, creatorLoc)) {
          return {
            success: false,
            error: `${lookup.user.name} (${lookup.user.employeeId}) is registered at ${lookup.user.businessUnit || 'another location'} and cannot join bookings at ${creatorLoc}.`
          };
        }
        resolvedInvitees.push({
          employeeId: lookup.user.employeeId,
          name: lookup.user.name,
          email: lookup.user.email
        });
      }

      await this.expireStaleInvites();

      // Campus clock: freeze windows + past slots (compare to current campus time)
      const campusTime = await this.getCampusTime();
      if (isSlotPastOrStarted(bookingData.slotTime, campusTime)) {
        return {
          success: false,
          error: `Slot ${bookingData.slotTime} is no longer available — it has already started or ended for today.`
        };
      }
      if (bookingData.bookingSource === 'online' && !isEmployeeOnlineBookingOpen(campusTime)) {
        return {
          success: false,
          error: 'Employee online booking is frozen. Self-service is open 10:00 AM – 8:00 PM. Use the security desk 5:00–10:00 AM.'
        };
      }
      if (bookingData.bookingSource === 'security' && !isSecurityDeskBookingOpen(campusTime)) {
        return {
          success: false,
          error: 'Security desk booking is frozen outside 5:00 AM – 10:00 AM. Employees book online from 10:00 AM.'
        };
      }

      const mappedFacility = this.mapFacility(facility);
      const capacity = await this.getFacilityCapacity(mappedFacility);
      const occupancy = await this.getSlotOccupancy(bookingData.facilityId, bookingData.slotTime);
      const seatsNeeded = 1 + resolvedInvitees.length;
      if (occupancy + seatsNeeded > capacity) {
        return {
          success: false,
          error: `Not enough seats. Capacity ${capacity}, occupied/reserved ${occupancy}, requested ${seatsNeeded}.`
        };
      }

      // Organizer + invitees must not already hold a seat or pending invite on this slot
      const existingBookings = await this.getBookings();
      const organizerHasBooking = existingBookings.some(
        b =>
          b.employeeId === empId &&
          b.facilityId === bookingData.facilityId &&
          b.slotTime === bookingData.slotTime &&
          b.status !== 'cancelled'
      );
      if (organizerHasBooking) {
        return {
          success: false,
          error: 'You already have a booking for this court and time slot.'
        };
      }

      for (const inv of resolvedInvitees) {
        const hasBooking = existingBookings.some(
          b =>
            b.employeeId === inv.employeeId &&
            b.facilityId === bookingData.facilityId &&
            b.slotTime === bookingData.slotTime &&
            b.status !== 'cancelled'
        );
        if (hasBooking) {
          return { success: false, error: `${inv.name} (${inv.employeeId}) already has a booking for this slot.` };
        }
        const { data: existingInvite } = await supabase
          .from('booking_invites')
          .select('invite_id')
          .eq('invitee_employee_id', inv.employeeId)
          .eq('facility_id', bookingData.facilityId)
          .eq('slot_time', bookingData.slotTime)
          .eq('status', 'pending')
          .maybeSingle();
        if (existingInvite) {
          return { success: false, error: `${inv.name} (${inv.employeeId}) already has a pending invite for this slot.` };
        }
      }

      const bookingId = `b_${Date.now()}`;
      const { data: newBooking, error: insertError } = await supabase.from('bookings').insert({
        booking_id: bookingId,
        employee_id: empId,
        employee_name: creator.name,
        facility_id: bookingData.facilityId,
        sport: facility.sport,
        court_name: facility.court_name,
        slot_time: bookingData.slotTime,
        booking_source: bookingData.bookingSource,
        status: 'confirmed'
      }).select().single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
      let invitesSent = 0;

      for (let i = 0; i < resolvedInvitees.length; i++) {
        const inv = resolvedInvitees[i];
        const inviteId = `inv_${Date.now()}_${i}`;
        const { error: inviteError } = await supabase.from('booking_invites').insert({
          invite_id: inviteId,
          booking_id: bookingId,
          organizer_employee_id: empId,
          invitee_employee_id: inv.employeeId,
          invitee_name: inv.name,
          facility_id: bookingData.facilityId,
          sport: facility.sport,
          court_name: facility.court_name,
          slot_time: bookingData.slotTime,
          status: 'pending',
          expires_at: expiresAt
        });
        if (inviteError) {
          // Roll back organizer booking if invites fail (e.g. table missing)
          await supabase.from('bookings').update({ status: 'cancelled' }).eq('booking_id', bookingId);
          return {
            success: false,
            error: inviteError.message.includes('booking_invites')
              ? 'Booking invites table is missing. Run supabase_booking_invites.sql in Supabase SQL Editor.'
              : inviteError.message
          };
        }

        await supabase.from('notifications').insert({
          id: `notif_${Date.now()}_${i}`,
          employee_id: inv.employeeId,
          title: 'Match Invite — Accept within 5 minutes',
          message: `${creator.name} (${empId}) invited you to ${facility.sport} (${facility.court_name}) at ${bookingData.slotTime}. Accept within 5 minutes or the invite expires.`,
          type: 'warning',
          read: false
        });

        const emailBody =
          `Dear ${inv.name},\n\n` +
          `${creator.name} (${empId}) invited you to a PlaySmart slot.\n\n` +
          `Details:\n` +
          `- Sport: ${facility.sport}\n` +
          `- Court: ${facility.court_name}\n` +
          `- Slot: ${bookingData.slotTime}\n` +
          `- Expires in: 5 minutes\n\n` +
          `Please log in to PlaySmart and Accept or Reject this invite. If you do not respond in 5 minutes, the invite expires and you cannot participate.\n\n` +
          `Best Regards,\nTCS PlaySmart`;

        const subject = `TCS PlaySmart - Match Invite [${facility.sport} ${bookingData.slotTime}]`;
        await supabase.from('simulated_emails').insert({
          id: `email_${Date.now()}_inv_${i}`,
          to_email: inv.email,
          subject,
          body: emailBody
        });

        try {
          await apiFetch('/api/emails/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: inv.email, subject, body: emailBody })
          });
        } catch {
          // real email optional
        }

        invitesSent++;
      }

      if (invitesSent > 0) {
        window.dispatchEvent(new Event('simulated_email_sent'));
      }

      return {
        success: true,
        invitesSent,
        booking: {
          bookingId: newBooking.booking_id,
          employeeId: newBooking.employee_id,
          employeeName: newBooking.employee_name,
          facilityId: newBooking.facility_id,
          sport: newBooking.sport as SportType,
          courtName: newBooking.court_name,
          slotTime: newBooking.slot_time as SlotTime,
          bookingSource: newBooking.booking_source as BookingSource,
          status: newBooking.status as BookingStatus,
          createdAt: newBooking.created_at,
          additionalPlayers: resolvedInvitees
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async acceptInvite(inviteId: string, employeeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const empId = employeeId.trim().toUpperCase();

      // Prefer atomic DB RPC (supabase_hardening.sql)
      const { data: rpcData, error: rpcError } = await supabase.rpc('accept_booking_invite', {
        p_invite_id: inviteId,
        p_employee_id: empId
      });

      if (!rpcError && rpcData) {
        if (rpcData.success) return { success: true };
        return { success: false, error: rpcData.error || 'Failed to accept invite.' };
      }

      // Fallback if RPC not deployed yet
      await this.expireStaleInvites();
      const { data: invite, error } = await supabase
        .from('booking_invites')
        .select('*')
        .eq('invite_id', inviteId)
        .maybeSingle();
      if (error) throw error;
      if (!invite) return { success: false, error: 'Invite not found.' };
      if (invite.invitee_employee_id !== empId) {
        return { success: false, error: 'This invite is not for your Employee ID.' };
      }
      if (invite.status !== 'pending' || new Date(invite.expires_at).getTime() <= Date.now()) {
        await supabase
          .from('booking_invites')
          .update({ status: 'expired', responded_at: new Date().toISOString() })
          .eq('invite_id', inviteId)
          .eq('status', 'pending');
        return { success: false, error: 'This invite has expired. You cannot participate.' };
      }

      const lookup = await this.lookupRegisteredUser(empId);
      if (!lookup.success || !lookup.user) {
        return { success: false, error: lookup.error || 'Your account is not eligible to accept.' };
      }

      await supabase
        .from('booking_invites')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('invite_id', inviteId);

      const acceptedBookingId = `b_${Date.now()}_acc`;
      const { error: insertError } = await supabase.from('bookings').insert({
        booking_id: acceptedBookingId,
        employee_id: empId,
        employee_name: lookup.user.name,
        facility_id: invite.facility_id,
        sport: invite.sport,
        court_name: invite.court_name,
        slot_time: invite.slot_time,
        booking_source: 'online',
        status: 'confirmed'
      });
      if (insertError) {
        await supabase
          .from('booking_invites')
          .update({ status: 'pending', responded_at: null })
          .eq('invite_id', inviteId);
        return { success: false, error: insertError.message };
      }

      await supabase
        .from('booking_invites')
        .update({ accepted_booking_id: acceptedBookingId })
        .eq('invite_id', inviteId);

      await supabase.from('notifications').insert({
        id: `notif_acc_${Date.now()}`,
        employee_id: invite.organizer_employee_id,
        title: 'Invite Accepted',
        message: `${invite.invitee_name} (${empId}) accepted your invite for ${invite.sport} at ${invite.slot_time}.`,
        type: 'success',
        read: false
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async rejectInvite(inviteId: string, employeeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.expireStaleInvites();
      const empId = employeeId.trim().toUpperCase();
      const { data: invite, error } = await supabase
        .from('booking_invites')
        .select('*')
        .eq('invite_id', inviteId)
        .maybeSingle();
      if (error) throw error;
      if (!invite) return { success: false, error: 'Invite not found.' };
      if (invite.invitee_employee_id !== empId) {
        return { success: false, error: 'This invite is not for your Employee ID.' };
      }
      if (invite.status !== 'pending') {
        return { success: false, error: `Invite is already ${invite.status}.` };
      }

      await supabase
        .from('booking_invites')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('invite_id', inviteId);

      await supabase.from('notifications').insert({
        id: `notif_rej_${Date.now()}`,
        employee_id: invite.organizer_employee_id,
        title: 'Invite Rejected',
        message: `${invite.invitee_name} (${empId}) rejected your invite for ${invite.sport} at ${invite.slot_time}. Seat released.`,
        type: 'warning',
        read: false
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: booking, error: selectError } = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!booking) return { success: false, error: 'Booking not found.' };
      if (booking.status === 'cancelled') return { success: false, error: 'Booking is already cancelled.' };

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('booking_id', bookingId);
      if (updateError) throw updateError;

      // Expire any pending invites tied to this organizer booking
      await supabase
        .from('booking_invites')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('booking_id', bookingId)
        .eq('status', 'pending');

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async updateBookingStatus(bookingId: string, status: BookingStatus, verifiedBy?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('booking_id', bookingId);
      if (error) throw error;

      if (status === 'no_show') {
        const { data: booking, error: selectError } = await supabase
          .from('bookings')
          .select('employee_id')
          .eq('booking_id', bookingId)
          .maybeSingle();
        
        if (selectError) throw selectError;
        if (booking) {
          const addWorkingDays = (date: Date, days: number): Date => {
            const result = new Date(date);
            let added = 0;
            while (added < days) {
              result.setDate(result.getDate() + 1);
              const day = result.getDay(); // 0 = Sunday, 6 = Saturday
              if (day !== 0 && day !== 6) {
                added++;
              }
            }
            return result;
          };

          const penaltyUntil = addWorkingDays(new Date(), 2);
          
          const { error: userError } = await supabase
            .from('users')
            .update({ suspended_until: penaltyUntil.toISOString() })
            .eq('employee_id', booking.employee_id);
          
          if (userError) throw userError;
        }
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // --- WAITLIST ---
  async getWaitlist(): Promise<WaitlistEntry[]> {
    const { data, error } = await supabase.from('waitlist').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(w => ({
      waitlistId: w.waitlist_id,
      employeeId: w.employee_id,
      employeeName: w.employee_name,
      facilityId: w.facility_id,
      sport: w.sport as SportType,
      courtName: w.court_name,
      slotTime: w.slot_time as SlotTime,
      createdAt: w.created_at
    }));
  },

  async joinWaitlist(employeeId: string, facilityId: string, slotTime: SlotTime): Promise<{ success: boolean; error?: string; entry?: WaitlistEntry }> {
    try {
      const empId = employeeId.trim().toUpperCase();
      
      // Ensure user is registered
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empId)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) {
        return { success: false, error: `Employee ID ${empId} not found.` };
      }

      if (user.status === 'inactive') {
        return { success: false, error: 'Your account is inactive (deactivated or relieved).' };
      }

      if (user.suspended_until && new Date(user.suspended_until) > new Date()) {
        const dateStr = new Date(user.suspended_until).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return { success: false, error: `Your waitlist privileges are suspended until ${dateStr} due to a recent No-Show violation.` };
      }
      
      // Check if already waitlisted for this specific slot
      const { data: existing, error: existError } = await supabase
        .from('waitlist')
        .select('*')
        .eq('employee_id', empId)
        .eq('facility_id', facilityId)
        .eq('slot_time', slotTime)
        .maybeSingle();
      if (existError) throw existError;
      if (existing) {
        return { success: false, error: 'You are already on the waitlist for this slot.' };
      }
      
      const waitlistId = `w_${Date.now()}`;
      const { data: entry, error: insertError } = await supabase.from('waitlist').insert({
        waitlist_id: waitlistId,
        employee_id: empId,
        employee_name: user.name,
        facility_id: facilityId,
        slot_time: slotTime
      }).select().single();
      
      if (insertError) throw insertError;
      
      return {
        success: true,
        entry: {
          waitlistId: entry.waitlist_id,
          employeeId: entry.employee_id,
          employeeName: entry.employee_name,
          facilityId: entry.facility_id,
          sport: entry.sport as SportType,
          courtName: entry.court_name,
          slotTime: entry.slot_time as SlotTime,
          createdAt: entry.created_at
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async leaveWaitlist(waitlistId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('waitlist').delete().eq('waitlist_id', waitlistId);
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // --- NOTIFICATIONS ---
  async getNotifications(employeeId: string): Promise<Notification[]> {
    const empId = employeeId.trim().toUpperCase();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('employee_id', empId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(n => ({
      id: n.id,
      employeeId: n.employee_id,
      title: n.title,
      message: n.message,
      type: n.type as any,
      read: n.read,
      createdAt: n.created_at
    }));
  },

  async markNotificationRead(id: string): Promise<void> {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  },

  async markAllNotificationsRead(employeeId: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('employee_id', employeeId)
      .eq('read', false);
  },

  // --- CAMPUS / SIMULATED TIME ---
  /**
   * Authoritative clock for booking freeze & slot availability.
   * Production: Asia/Kolkata wall clock.
   * Demo (`VITE_SHOW_SIMULATED_TIME=true`): value from simulated_time / local override.
   */
  async getCampusTime(): Promise<{ hour: number; minute: number }> {
    const demoMode = import.meta.env.VITE_SHOW_SIMULATED_TIME === 'true';
    if (!demoMode) {
      return getWallClockIST();
    }
    return this.getSimulatedTime();
  },

  async getSimulatedTime(): Promise<{ hour: number; minute: number }> {
    const demoMode = import.meta.env.VITE_SHOW_SIMULATED_TIME === 'true';
    if (!demoMode) {
      return getWallClockIST();
    }
    try {
      const { data, error } = await supabase
        .from('simulated_time')
        .select('hour, minute')
        .eq('key', 'current_time')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return getWallClockIST();
      return { hour: data.hour, minute: data.minute };
    } catch (e) {
      console.warn('Failed to fetch simulated time from database, falling back to IST wall clock.', e);
      const cached = localStorage.getItem('tcs_playsmart_sim_time');
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore
        }
      }
      return getWallClockIST();
    }
  },

  async setSimulatedTime(time: { hour: number; minute: number }): Promise<void> {
    localStorage.setItem('tcs_playsmart_sim_time', JSON.stringify(time));
    try {
      const { error } = await supabase
        .from('simulated_time')
        .upsert({ key: 'current_time', hour: time.hour, minute: time.minute });
      if (error) throw error;
    } catch (e) {
      console.warn("Failed to save simulated time to database (RLS or connection issue). Using local storage instead.", e);
    }
    window.dispatchEvent(new Event('simulated_time_change'));
  },

  formatSimulatedTime(time: { hour: number; minute: number }): string {
    const suffix = time.hour >= 12 ? 'PM' : 'AM';
    const displayHour = time.hour % 12 || 12;
    const padMin = String(time.minute).padStart(2, '0');
    return `${displayHour}:${padMin} ${suffix}`;
  },

  // --- SLOT TIMINGS (per location when location is provided) ---
  defaultSlotTimes(): SlotTime[] {
    return [
      '6-7 AM', '7-8 AM', '8-9 AM', '9-10 AM', '10-11 AM',
      '11-12 PM', '12-1 PM', '1-2 PM', '2-3 PM', '3-4 PM',
      '4-5 PM', '5-6 PM', '6-7 PM', '7-8 PM'
    ];
  },

  async getSlotTimes(location?: string): Promise<SlotTime[]> {
    const defaultSlots = this.defaultSlotTimes();
    const loc = normalizeLocation(location);
    const cacheKey = loc ? `playsmart_slot_times::${loc}` : 'playsmart_slot_times';
    const dbKey = locationSettingKey('slot_times', loc);

    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', dbKey)
        .maybeSingle();
      if (error) throw error;
      if (data?.value) {
        const slots = JSON.parse(data.value);
        localStorage.setItem(cacheKey, JSON.stringify(slots));
        return slots;
      }
      // Legacy global key only for default campus (do not leak Chennai hours to other sites)
      if (loc && sameLocation(loc, DEFAULT_TCS_LOCATION)) {
        const legacy = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'slot_times')
          .maybeSingle();
        if (legacy.data?.value) {
          const slots = JSON.parse(legacy.data.value);
          return slots;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch slots from database, using cache or defaults.', e);
    }
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* ignore */
      }
    }
    return defaultSlots;
  },

  async saveSlotTimes(slots: string[], location?: string): Promise<void> {
    const loc = normalizeLocation(location);
    if (!loc) throw new Error('Location is required to save slot times.');
    const cacheKey = `playsmart_slot_times::${loc}`;
    const dbKey = locationSettingKey('slot_times', loc);
    localStorage.setItem(cacheKey, JSON.stringify(slots));
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: dbKey, value: JSON.stringify(slots) });
      if (error) throw error;
    } catch (e) {
      console.warn('Failed to save slot times to database.', e);
      throw e;
    }
    window.dispatchEvent(new Event('slot_times_change'));
  },

  normalizeSportName(sport: string): string {
    return sport.trim().replace(/\s+/g, ' ');
  },

  /**
   * Sport categories available at a location (editable by that location's admin).
   * Stored in system_settings as location_sports::<Location>.
   */
  async getLocationSports(location?: string): Promise<SportType[]> {
    const loc = normalizeLocation(location);
    const defaults = [...DEFAULT_SPORTS];
    if (!loc) return defaults;

    const cacheKey = `playsmart_location_sports::${loc}`;
    const dbKey = locationSettingKey('location_sports', loc);

    let stored: string[] | null = null;
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', dbKey)
        .maybeSingle();
      if (error) throw error;
      if (data?.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          stored = parsed.map((s: unknown) => this.normalizeSportName(String(s))).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch location sports from database.', e);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) stored = parsed;
        } catch {
          /* ignore */
        }
      }
    }

    // Always include sports that already have courts at this location
    let fromFacilities: string[] = [];
    try {
      const facs = await this.getFacilities(loc);
      fromFacilities = Array.from(
        new Set<string>(facs.map(f => String(f.sport || '')).filter(s => s.length > 0))
      );
    } catch {
      /* ignore */
    }

    const base = stored && stored.length > 0 ? stored : defaults;
    const merged = [...base];
    for (const s of fromFacilities) {
      if (!merged.some(x => x.toLowerCase() === s.toLowerCase())) {
        merged.push(s);
      }
    }
    localStorage.setItem(cacheKey, JSON.stringify(merged));
    return merged;
  },

  async saveLocationSports(sports: SportType[], location: string): Promise<SportType[]> {
    const loc = normalizeLocation(location);
    if (!loc) throw new Error('Location is required to save sports.');
    const cleaned = [
      ...new Map(
        sports
          .map(s => this.normalizeSportName(s))
          .filter(Boolean)
          .map(s => [s.toLowerCase(), s] as const)
      ).values()
    ];
    if (cleaned.length === 0) {
      throw new Error('At least one sport category is required.');
    }

    const cacheKey = `playsmart_location_sports::${loc}`;
    const dbKey = locationSettingKey('location_sports', loc);
    localStorage.setItem(cacheKey, JSON.stringify(cleaned));
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: dbKey, value: JSON.stringify(cleaned) });
    if (error) throw new Error(error.message);

    // Keep capacities in sync (add defaults for new sports; drop removed ones without courts)
    const caps = await this.getSportCapacities(loc);
    const defaults = this.defaultSportCapacities();
    const nextCaps: Record<string, number> = {};
    for (const s of cleaned) {
      nextCaps[s] = caps[s] ?? defaults[s] ?? 4;
    }
    await this.saveSportCapacities(nextCaps, loc);
    window.dispatchEvent(new Event('location_sports_change'));
    return cleaned;
  },

  async addLocationSport(sport: string, location: string, defaultCapacity = 4): Promise<SportType[]> {
    const name = this.normalizeSportName(sport);
    if (!name) throw new Error('Sport name is required.');
    if (name.length > 40) throw new Error('Sport name must be 40 characters or less.');
    const existing = await this.getLocationSports(location);
    if (existing.some(s => s.toLowerCase() === name.toLowerCase())) {
      throw new Error(`"${name}" is already in this location's sport list.`);
    }
    return this.saveLocationSports([...existing, name], location);
  },

  async removeLocationSport(sport: string, location: string): Promise<SportType[]> {
    const name = this.normalizeSportName(sport);
    const loc = normalizeLocation(location);
    const facs = await this.getFacilities(loc);
    if (facs.some(f => f.sport.toLowerCase() === name.toLowerCase())) {
      throw new Error(
        `Cannot remove "${name}" while courts exist for it. Delete those courts first.`
      );
    }
    const existing = await this.getLocationSports(loc);
    const next = existing.filter(s => s.toLowerCase() !== name.toLowerCase());
    if (next.length === existing.length) {
      throw new Error(`"${name}" is not in this location's sport list.`);
    }
    return this.saveLocationSports(next, loc);
  },

  /**
   * Max players per sport for a location (court size / headcount config).
   * Each location admin configures their own; other locations are unaffected.
   * When a location sports list exists, capacities are keyed to that list.
   */
  async getSportCapacities(location?: string): Promise<Record<string, number>> {
    const defaults = this.defaultSportCapacities();
    const loc = normalizeLocation(location);
    const cacheKey = loc
      ? `playsmart_sport_capacities::${loc}`
      : 'playsmart_sport_capacities';
    const dbKey = locationSettingKey('sport_capacities', loc);

    let stored: Record<string, number> = {};
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', dbKey)
        .maybeSingle();
      if (error) throw error;
      if (data?.value) {
        stored = JSON.parse(data.value);
      } else if (loc && sameLocation(loc, DEFAULT_TCS_LOCATION)) {
        // Legacy global key only for default campus
        const legacy = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'sport_capacities')
          .maybeSingle();
        if (legacy.data?.value) {
          stored = JSON.parse(legacy.data.value);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch sport capacities from database, using cache or defaults.', e);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          stored = JSON.parse(cached);
        } catch {
          /* ignore */
        }
      }
    }

    const merged = { ...defaults, ...stored };
    if (loc) {
      try {
        // Read sports list directly (avoid calling getLocationSports → recursion with save flows)
        const { data: sportsRow } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', `location_sports::${loc}`)
          .maybeSingle();
        if (sportsRow?.value) {
          const parsed = JSON.parse(sportsRow.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const keyed: Record<string, number> = {};
            for (const s of parsed) {
              const name = this.normalizeSportName(String(s));
              if (!name) continue;
              keyed[name] = merged[name] ?? defaults[name] ?? 4;
            }
            localStorage.setItem(cacheKey, JSON.stringify(keyed));
            return keyed;
          }
        }
      } catch {
        /* fall through */
      }
    }
    localStorage.setItem(cacheKey, JSON.stringify(merged));
    return merged;
  },

  async saveSportCapacities(capacities: Record<string, number>, location?: string): Promise<void> {
    const loc = normalizeLocation(location);
    if (!loc) throw new Error('Location is required to save sport capacities.');
    const cacheKey = `playsmart_sport_capacities::${loc}`;
    const dbKey = locationSettingKey('sport_capacities', loc);
    localStorage.setItem(cacheKey, JSON.stringify(capacities));
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: dbKey, value: JSON.stringify(capacities) });
      if (error) throw error;
    } catch (e) {
      console.warn('Failed to save sport capacities to database.', e);
      throw e;
    }
    window.dispatchEvent(new Event('sport_capacities_change'));
  },

  // --- SIMULATED EMAILS ---
  async getSimulatedEmails(): Promise<any[]> {
    const { data, error } = await supabase
      .from('simulated_emails')
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(e => ({
      id: e.id,
      to: e.to_email,
      subject: e.subject,
      body: e.body,
      sentAt: e.sent_at
    }));
  },

  async clearSimulatedEmails(): Promise<void> {
    const { error } = await supabase.from('simulated_emails').delete().neq('id', '');
    if (error) throw new Error(error.message);
    window.dispatchEvent(new Event('simulated_email_sent'));
  },

  // --- SUPPORT / COMPLAINT TICKETS ---
  async createSupportTicket(input: {
    reporterEmployeeId: string;
    reporterName: string;
    reporterRole: 'employee' | 'admin';
    category: TicketCategory;
    subject: string;
    details: string;
    facilityId?: string;
    courtName?: string;
    sport?: string;
  }): Promise<{ success: boolean; error?: string; ticket?: SupportTicket }> {
    try {
      if (input.reporterRole !== 'employee' && input.reporterRole !== 'admin') {
        return { success: false, error: 'Only employees and admins can raise concern tickets.' };
      }
      const subject = input.subject.trim();
      const details = input.details.trim();
      if (!subject) return { success: false, error: 'Select or enter what the concern is about.' };
      if (details.length < 10) return { success: false, error: 'Please describe the issue in at least 10 characters.' };

      const assignedQueue = initialQueueForCategory(input.category);
      const now = new Date();
      const ticketId = `TKT_${Date.now()}`;
      const escalateAt = new Date(now.getTime() + TICKET_ESCALATE_MS).toISOString();

      const row = {
        ticket_id: ticketId,
        reporter_employee_id: input.reporterEmployeeId,
        reporter_name: input.reporterName,
        reporter_role: input.reporterRole,
        category: input.category,
        subject,
        details,
        facility_id: input.facilityId || null,
        court_name: input.courtName || null,
        sport: input.sport || null,
        assigned_queue: assignedQueue,
        status: 'open',
        priority: 'normal',
        created_at: now.toISOString(),
        escalate_at: escalateAt
      };

      const { data, error } = await supabase.from('support_tickets').insert(row).select('*').single();
      if (error) throw error;

      // Notify destination queue + always ping admins for employee-raised tickets
      await this.notifyTicketQueue(
        assignedQueue,
        'New concern ticket',
        `${input.reporterName} raised: ${subject} (${input.category}). Act within 10 minutes or it escalates.`,
        'warning'
      );
      if (input.reporterRole === 'employee' && assignedQueue !== 'admin') {
        await this.notifyTicketQueue(
          'admin',
          'Employee concern filed',
          `${subject} routed to ${assignedQueue}. Ticket ${ticketId}.`,
          'info'
        );
      }

      window.dispatchEvent(new Event('support_tickets_change'));
      return { success: true, ticket: mapTicket(data) };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to create ticket.' };
    }
  },

  async notifyTicketQueue(
    queue: TicketQueue,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ): Promise<void> {
    const role =
      queue === 'admin' ? 'admin' : queue === 'security' ? 'security' : 'it';
    const { data: users } = await supabase
      .from('users')
      .select('employee_id')
      .eq('role', role)
      .eq('status', 'active');
    for (const u of users || []) {
      await supabase.from('notifications').insert({
        id: `notif_${Date.now()}_${u.employee_id}_${Math.random().toString(36).slice(2, 7)}`,
        employee_id: u.employee_id,
        title,
        message,
        type,
        read: false,
        created_at: new Date().toISOString()
      });
    }
    window.dispatchEvent(new Event('storage'));
  },

  async getSupportTickets(filters?: {
    queue?: TicketQueue;
    reporterEmployeeId?: string;
  }): Promise<SupportTicket[]> {
    await this.processTicketEscalations();
    try {
      let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
      if (filters?.queue) q = q.eq('assigned_queue', filters.queue);
      if (filters?.reporterEmployeeId) q = q.eq('reporter_employee_id', filters.reporterEmployeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapTicket);
    } catch (e) {
      console.warn('Failed to fetch support tickets.', e);
      return [];
    }
  },

  /** Auto-escalate open tickets past 10 minutes; bump priority and re-notify target team. */
  async processTicketEscalations(): Promise<number> {
    try {
      const nowIso = new Date().toISOString();
      const { data: due, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('status', 'open')
        .lte('escalate_at', nowIso)
        .is('escalated_at', null);
      if (error) throw error;
      let count = 0;
      for (const row of due || []) {
        const category = row.category as TicketCategory;
        // Ensure queue matches complaint type after SLA breach
        const targetQueue = initialQueueForCategory(category);
        const { error: upErr } = await supabase
          .from('support_tickets')
          .update({
            status: 'escalated',
            priority: 'urgent',
            assigned_queue: targetQueue,
            escalated_at: nowIso
          })
          .eq('ticket_id', row.ticket_id);
        if (upErr) continue;
        count++;
        await this.notifyTicketQueue(
          targetQueue,
          'Ticket escalated (10 min SLA)',
          `${row.subject} — ${row.ticket_id} was not actioned in time. Priority is now urgent.`,
          'error'
        );
        if (targetQueue !== 'admin') {
          await this.notifyTicketQueue(
            'admin',
            'Escalated concern',
            `${row.ticket_id} escalated to ${targetQueue}: ${row.subject}`,
            'warning'
          );
        }
      }
      if (count > 0) window.dispatchEvent(new Event('support_tickets_change'));
      return count;
    } catch (e) {
      console.warn('Ticket escalation processing failed.', e);
      return 0;
    }
  },

  async updateSupportTicket(
    ticketId: string,
    updates: {
      status?: TicketStatus;
      assignedQueue?: TicketQueue;
      resolutionNotes?: string;
      assignedToEmployeeId?: string;
      actorEmployeeId?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const patch: Record<string, unknown> = {};
      if (updates.status) {
        patch.status = updates.status;
        if (updates.status === 'acknowledged' || updates.status === 'in_progress') {
          patch.acknowledged_at = new Date().toISOString();
        }
        if (updates.status === 'resolved' || updates.status === 'closed') {
          patch.resolved_at = new Date().toISOString();
        }
      }
      if (updates.assignedQueue) {
        patch.assigned_queue = updates.assignedQueue;
        patch.last_manual_move_at = new Date().toISOString();
        if (updates.actorEmployeeId) patch.last_manual_move_by = updates.actorEmployeeId;
      }
      if (updates.resolutionNotes !== undefined) patch.resolution_notes = updates.resolutionNotes;
      if (updates.assignedToEmployeeId !== undefined) {
        patch.assigned_to_employee_id = updates.assignedToEmployeeId;
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .update(patch)
        .eq('ticket_id', ticketId)
        .select('*')
        .single();
      if (error) throw error;

      if (updates.assignedQueue) {
        await this.notifyTicketQueue(
          updates.assignedQueue,
          'Ticket reassigned',
          `${data.subject} (${ticketId}) was manually moved to your queue.`,
          'warning'
        );
      }

      window.dispatchEvent(new Event('support_tickets_change'));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};


