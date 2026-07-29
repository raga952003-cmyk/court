import { createClient } from '@supabase/supabase-js';
import { User, Facility, Booking, Notification, SlotTime, SportType, BookingStatus, Attendance, WaitlistEntry, BookingSource } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const db = {
  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw new Error(error.message);
    return (data || []).map(u => ({
      id: u.id,
      employeeId: u.employee_id,
      name: u.name,
      email: u.email,
      phoneNumber: u.phone_number || '',
      department: u.department,
      businessUnit: u.business_unit,
      role: u.role,
      password: u.password,
      avatar: u.avatar || '',
      approved: u.approved,
      status: u.status || 'active',
      suspendedUntil: u.suspended_until,
      rejectionReason: u.rejection_reason,
      createdAt: u.created_at
    }));
  },

  async hasAdmin(): Promise<boolean> {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (error) throw new Error(error.message);
    return (count || 0) > 0;
  },

  async initializeAdmin(adminData: any): Promise<{ success: boolean; error?: string; user?: User }> {
    return this.registerUser({ ...adminData, role: 'admin' });
  },

  async registerUser(userData: any): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const empId = userData.employeeId.trim().toUpperCase();
      const email = userData.email.trim().toLowerCase();
      
      // Check if user already exists
      const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('employee_id')
        .eq('employee_id', empId)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existing) {
        return { success: false, error: `Employee ID ${empId} is already registered.` };
      }

      let approved = true;
      let status = 'active';
      if (userData.role === 'admin' || userData.role === 'security') {
        const adminCheck = await this.hasAdmin();
        if (adminCheck) {
          approved = false;
          status = 'pending';
        }
      }

      const id = `u_${Date.now()}`;
      const newUser = {
        id,
        employee_id: empId,
        name: userData.name.trim(),
        email,
        phone_number: userData.phoneNumber ? userData.phoneNumber.trim() : '',
        department: userData.department,
        business_unit: userData.businessUnit,
        role: userData.role || 'employee',
        password: userData.password || 'password',
        approved,
        status
      };

      const { data, error } = await supabase.from('users').insert(newUser).select().single();
      if (error) throw error;

      const userObj: User = {
        id: data.id,
        employeeId: data.employee_id,
        name: data.name,
        email: data.email,
        phoneNumber: data.phone_number,
        department: data.department,
        businessUnit: data.business_unit,
        role: data.role,
        password: data.password,
        avatar: data.avatar || '',
        approved: data.approved,
        status: data.status || 'active',
        suspendedUntil: data.suspended_until,
        createdAt: data.created_at
      };

      return { success: true, user: userObj };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async loginUser(employeeId: string, password?: string): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
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
      
      const userPassword = user.password || 'password';
      if (password && password !== userPassword) {
        return { success: false, error: 'Incorrect password.' };
      }

      if (user.status === 'rejected') {
        return { success: false, error: `Your registration request was rejected by the administrator. Reason: "${user.rejection_reason || 'No comments provided'}"` };
      }

      if (user.status === 'pending' || user.approved === false) {
        return { success: false, error: 'Your account is inactive due to pending with the approval stage with admin.' };
      }

      if (user.status === 'inactive') {
        return { success: false, error: 'Your account has been deactivated (relieved from the company).' };
      }
      
      const userObj: User = {
        id: user.id,
        employeeId: user.employee_id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phone_number || '',
        department: user.department,
        businessUnit: user.business_unit,
        role: user.role,
        password: user.password,
        avatar: user.avatar || '',
        approved: user.approved,
        status: user.status || 'active',
        suspendedUntil: user.suspended_until,
        rejectionReason: user.rejection_reason,
        createdAt: user.created_at
      };
      
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
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: 'password' })
        .eq('employee_id', empId);
        
      if (updateError) throw updateError;
      
      // Send simulated email
      const emailId = `email_${Date.now()}`;
      const emailBody = `Dear ${user.name},\n\nWe received a request to recover your password for the TCS PlaySmart sports reservation system.\n\nYour password has been reset to the default developer bypass password:\n- Temporary Password: password\n\nPlease log in and update your profile password as soon as possible.\n\nBest Regards,\nTCS PlaySmart Admin Team`;
      
      await supabase.from('simulated_emails').insert({
        id: emailId,
        to_email: user.email,
        subject: 'TCS PlaySmart - Password Recovery request 🔑',
        body: emailBody
      });
      
      return { success: true, message: 'Password reset successfully to the default: password' };
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
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: 'password' })
        .eq('employee_id', user.employeeId);
        
      if (updateError) throw updateError;
      
      // Send simulated recovery email with username
      const emailId = `email_${Date.now()}`;
      const emailBody = `Dear ${user.name},\n\nWe received a request to recover your TCS PlaySmart Administrator credentials.\n\nHere are your account details:\n- TCS Employee ID: ${user.employeeId}\n- Temporary Password: password\n\nPlease log in to the Administrator Portal (/#/admin) and change your password immediately.\n\nBest Regards,\nTCS PlaySmart System Services`;
      
      await supabase.from('simulated_emails').insert({
        id: emailId,
        to_email: user.email,
        subject: 'TCS PlaySmart - Admin Credential Recovery 🔑',
        body: emailBody
      });
      
      return { success: true, message: 'Admin credentials recovered! A simulated recovery email has been sent.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async changePassword(employeeId: string, oldPasswordText: string, newPasswordText: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();
        
      if (selectError) throw selectError;
      if (!user) {
        return { success: false, error: 'User not found.' };
      }
      
      const currentPassword = user.password || 'password';
      if (oldPasswordText !== currentPassword) {
        return { success: false, error: 'Incorrect current password.' };
      }
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newPasswordText })
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
      const { data, error } = await supabase
        .from('users')
        .update({
          name,
          email,
          phone_number: phoneNumber,
          avatar
        })
        .eq('employee_id', employeeId)
        .select()
        .single();
        
      if (error) throw error;
      
      const userObj: User = {
        id: data.id,
        employeeId: data.employee_id,
        name: data.name,
        email: data.email,
        phoneNumber: data.phone_number || '',
        department: data.department,
        businessUnit: data.business_unit,
        role: data.role,
        password: data.password,
        avatar: data.avatar || '',
        createdAt: data.created_at
      };
      
      localStorage.setItem('playsmart_current_user', JSON.stringify(userObj));
      return { success: true, user: userObj };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  getCurrentUser(): User | null {
    try {
      const item = localStorage.getItem('playsmart_current_user');
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  logoutUser(): void {
    localStorage.removeItem('playsmart_current_user');
  },

  async changeUserRole(userId: string, role: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role })
        .eq('id', userId);
      if (error) throw error;
      return true;
    } catch {
      return false;
    }
  },

  async toggleUserStatus(userId: string, status: 'active' | 'inactive'): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', userId);
      if (error) throw error;
      return true;
    } catch {
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
        .update({ status: 'rejected', rejection_reason: comments })
        .eq('id', userId);
      if (updateError) throw updateError;

      const emailId = `email_${Date.now()}`;
      await supabase.from('simulated_emails').insert({
        id: emailId,
        to_email: user.email,
        subject: 'TCS PlaySmart - Account Request Rejected ❌',
        body: `Dear ${user.name},\n\nYour request for a TCS PlaySmart ${user.role} account has been rejected by the administrator.\n\nAdministrator Rejection Comments/Reason:\n"${comments}"\n\nBest Regards,\nTCS PlaySmart Sports Committee`
      });
      return true;
    } catch {
      return false;
    }
  },

  // --- FACILITIES ---
  async getFacilities(): Promise<Facility[]> {
    const { data, error } = await supabase.from('facilities').select('*').order('facility_id');
    if (error) throw new Error(error.message);
    return (data || []).map(f => ({
      facilityId: f.facility_id,
      sport: f.sport as SportType,
      courtName: f.court_name,
      status: f.status as 'active' | 'maintenance'
    }));
  },

  async toggleFacilityMaintenance(facilityId: string): Promise<Facility[]> {
    const { data: current, error: getError } = await supabase
      .from('facilities')
      .select('status')
      .eq('facility_id', facilityId)
      .single();
    if (getError) throw getError;
    
    const nextStatus = current.status === 'active' ? 'maintenance' : 'active';
    const { error: updateError } = await supabase
      .from('facilities')
      .update({ status: nextStatus })
      .eq('facility_id', facilityId);
    if (updateError) throw updateError;
    
    return this.getFacilities();
  },

  async addFacility(sport: SportType, courtName: string): Promise<Facility[]> {
    const facilityId = `${sport.toLowerCase().replace(/ /g, '_')}_${Date.now()}`;
    const { error } = await supabase.from('facilities').insert({
      facility_id: facilityId,
      sport,
      court_name: courtName,
      status: 'active'
    });
    if (error) throw new Error(error.message);
    return this.getFacilities();
  },

  async deleteFacility(facilityId: string): Promise<Facility[]> {
    // Delete bookings and waitlist entries for this facility to emulate cascade deletion
    await supabase.from('waitlist').delete().eq('facility_id', facilityId);
    await supabase.from('bookings').delete().eq('facility_id', facilityId);
    const { error } = await supabase.from('facilities').delete().eq('facility_id', facilityId);
    if (error) throw new Error(error.message);
    return this.getFacilities();
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

  async createBooking(bookingData: {
    employeeId: string;
    email?: string;
    facilityId: string;
    slotTime: SlotTime;
    bookingSource: 'online' | 'security';
    additionalPlayers?: Array<{ employeeId: string; name: string; email: string }>;
  }): Promise<{ success: boolean; error?: string; booking?: Booking }> {
    try {
      const empId = bookingData.employeeId.trim().toUpperCase();
      const email = bookingData.email ? bookingData.email.trim().toLowerCase() : '';
      
      // Get facility details
      const { data: facility, error: facError } = await supabase
        .from('facilities')
        .select('*')
        .eq('facility_id', bookingData.facilityId)
        .single();
      if (facError) throw facError;
      
      // 1. Ensure creator exists in users table
      const { data: creator, error: creatorError } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', empId)
        .maybeSingle();
      if (creatorError) throw creatorError;
      
      let creatorUser = creator;
      if (!creatorUser) {
        if (email) {
          // Auto register creator
          const id = `u_${Date.now()}`;
          const { data: newReg, error: regError } = await supabase.from('users').insert({
            id,
            employee_id: empId,
            name: `Employee ${empId}`,
            email,
            phone_number: '',
            department: 'BFSI',
            business_unit: 'BU_TCS_CHN',
            role: 'employee',
            password: 'password'
          }).select().single();
          if (regError) throw regError;
          creatorUser = newReg;
        } else {
          return { success: false, error: `Employee ID ${empId} not found.` };
        }
      } else if (email && creatorUser.email.toLowerCase() !== email) {
        return { success: false, error: `The provided Email ID does not match the registered Email for Employee ID ${empId}.` };
      }

      if (creatorUser.status === 'inactive') {
        return { success: false, error: 'Your account is inactive (deactivated or relieved).' };
      }

      if (creatorUser.suspended_until && new Date(creatorUser.suspended_until) > new Date()) {
        const dateStr = new Date(creatorUser.suspended_until).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return { success: false, error: `Your booking privileges are suspended until ${dateStr} due to a recent No-Show violation.` };
      }

      // 3. Insert booking (Trigger validates rules, duplicate checks, overlapping checks, and creates notifications/emails)
      const bookingId = `b_${Date.now()}`;
      const { data: newBooking, error: insertError } = await supabase.from('bookings').insert({
        booking_id: bookingId,
        employee_id: empId,
        employee_name: creatorUser.name,
        facility_id: bookingData.facilityId,
        sport: facility.sport,
        court_name: facility.court_name,
        slot_time: bookingData.slotTime,
        booking_source: bookingData.bookingSource,
        status: 'confirmed'
      }).select().single();
      
      if (insertError) {
        // Return friendly trigger exceptions
        return { success: false, error: insertError.message };
      }
      
      return {
        success: true,
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
          additionalPlayers: []
        }
      };
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

  // --- SIMULATED TIME ---
  async getSimulatedTime(): Promise<{ hour: number; minute: number }> {
    try {
      const { data, error } = await supabase
        .from('simulated_time')
        .select('hour, minute')
        .eq('key', 'current_time')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { hour: 9, minute: 0 };
      return { hour: data.hour, minute: data.minute };
    } catch (e) {
      console.warn("Failed to fetch simulated time from database, falling back to local storage.", e);
      const cached = localStorage.getItem('tcs_playsmart_sim_time');
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore parsing error
        }
      }
      return { hour: 9, minute: 0 };
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

  // --- SLOT TIMINGS ---
  async getSlotTimes(): Promise<SlotTime[]> {
    const defaultSlots: SlotTime[] = [
      '6-7 AM', '7-8 AM', '8-9 AM', '9-10 AM', '10-11 AM',
      '11-12 PM', '12-1 PM', '1-2 PM', '2-3 PM', '3-4 PM',
      '4-5 PM', '5-6 PM', '6-7 PM', '7-8 PM'
    ];
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'slot_times')
        .maybeSingle();
      if (error) throw error;
      if (data && data.value) {
        const slots = JSON.parse(data.value);
        localStorage.setItem('playsmart_slot_times', JSON.stringify(slots));
        return slots;
      }
    } catch (e) {
      console.warn("Failed to fetch slots from database, using cache or defaults.", e);
    }
    const cached = localStorage.getItem('playsmart_slot_times');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return defaultSlots;
  },

  async saveSlotTimes(slots: string[]): Promise<void> {
    localStorage.setItem('playsmart_slot_times', JSON.stringify(slots));
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'slot_times', value: JSON.stringify(slots) });
      if (error) throw error;
    } catch (e) {
      console.warn("Failed to save slot times to database.", e);
    }
    window.dispatchEvent(new Event('slot_times_change'));
  },

  async getSportCapacities(): Promise<Record<string, number>> {
    const defaultCapacities: Record<string, number> = {
      'Badminton': 4,
      'Carrom': 4,
      'Table Tennis': 4,
      'Basketball': 10,
      'Box Cricket': 22,
      'Volleyball': 12
    };
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'sport_capacities')
        .maybeSingle();
      if (error) throw error;
      if (data && data.value) {
        const capacities = JSON.parse(data.value);
        localStorage.setItem('playsmart_sport_capacities', JSON.stringify(capacities));
        return capacities;
      }
    } catch (e) {
      console.warn("Failed to fetch sport capacities from database, using cache or defaults.", e);
    }
    const cached = localStorage.getItem('playsmart_sport_capacities');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return defaultCapacities;
  },

  async saveSportCapacities(capacities: Record<string, number>): Promise<void> {
    localStorage.setItem('playsmart_sport_capacities', JSON.stringify(capacities));
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'sport_capacities', value: JSON.stringify(capacities) });
      if (error) throw error;
    } catch (e) {
      console.warn("Failed to save sport capacities to database.", e);
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

  // --- FEEDBACK SYSTEM ---
  async submitFeedback(employeeId: string, employeeName: string, subject: string, content: string, rating: number): Promise<{ success: boolean; error?: string }> {
    try {
      const id = `fb_${Date.now()}`;
      const { error } = await supabase.from('feedback').insert({
        id,
        employee_id: employeeId,
        employee_name: employeeName,
        subject,
        content,
        rating
      });
      if (error) throw error;
      window.dispatchEvent(new Event('feedback_change'));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async getFeedbackList(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(f => ({
        id: f.id,
        employeeId: f.employee_id,
        employeeName: f.employee_name,
        subject: f.subject,
        content: f.content,
        rating: f.rating,
        createdAt: f.created_at
      }));
    } catch (e) {
      console.warn("Failed to fetch feedback list from database.", e);
      return [];
    }
  },
};
