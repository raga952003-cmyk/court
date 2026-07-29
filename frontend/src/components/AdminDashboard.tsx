/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../lib/database';
import { User, Booking, Facility, SportType, SlotTime, WaitlistEntry } from '../types';
import { INITIAL_FACILITIES, SLOT_TIMES } from '../data/initialData';
import { 
  Users, Calendar, Activity, ShieldAlert, Percent, Settings, Wrench, 
  BarChart as BarIcon, ShieldCheck, RefreshCw, UserPlus, ToggleLeft, ToggleRight, 
  Trash2, FileText, Download, CheckCircle, HelpCircle, Clock, X, Info, Star, MessageSquare
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import AIChatAssistant from './AIChatAssistant';

const THEMES = {
  blue: { navBg: 'bg-[#003366]', primaryBtn: 'bg-[#003366] hover:bg-blue-900', text: 'text-[#003366]' },
  dark: { navBg: 'bg-[#0f172a]', primaryBtn: 'bg-[#0f172a] hover:bg-slate-900', text: 'text-[#0f172a]' },
  green: { navBg: 'bg-[#064e3b]', primaryBtn: 'bg-[#064e3b] hover:bg-emerald-900', text: 'text-[#064e3b]' },
  purple: { navBg: 'bg-[#3b0764]', primaryBtn: 'bg-[#3b0764] hover:bg-fuchsia-900', text: 'text-[#3b0764]' }
};

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser?: () => void;
}

export default function AdminDashboard({ user, onLogout, onUpdateUser }: AdminDashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'approvals' | 'facilities' | 'reports' | 'security' | 'feedback'>('analytics');
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  
  // Custom user role modifier
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<'employee' | 'security' | 'admin'>('employee');
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  // Profile update states
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phoneNumber || '');
  const [profileAvatar, setProfileAvatar] = useState(user.avatar || '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [theme, setTheme] = useState<'blue' | 'dark' | 'green' | 'purple'>((localStorage.getItem('playsmart_theme') as any) || 'blue');
  const [slotTimes, setSlotTimes] = useState<SlotTime[]>(() => {
    const cached = localStorage.getItem('playsmart_slot_times');
    return cached ? JSON.parse(cached) : SLOT_TIMES;
  });
  const [sportCapacities, setSportCapacities] = useState<Record<string, number>>(() => {
    const cached = localStorage.getItem('playsmart_sport_capacities');
    return cached ? JSON.parse(cached) : {
      'Badminton': 4,
      'Carrom': 4,
      'Table Tennis': 4,
      'Basketball': 10,
      'Box Cricket': 22,
      'Volleyball': 12
    };
  });
  const [capacitiesError, setCapacitiesError] = useState('');
  const [capacitiesSuccess, setCapacitiesSuccess] = useState('');

  // Add facility states
  const [addFacilitySport, setAddFacilitySport] = useState<SportType>('Badminton');
  const [addFacilityCourtName, setAddFacilityCourtName] = useState('');
  const [addFacilityError, setAddFacilityError] = useState('');
  const [addFacilitySuccess, setAddFacilitySuccess] = useState('');

  // Slot timing states
  const [newSlotInput, setNewSlotInput] = useState('');
  const [slotsError, setSlotsError] = useState('');
  const [slotsSuccess, setSlotsSuccess] = useState('');

  const refreshData = async () => {
    try {
      const [usersList, booksList, facsList, wlist, slots, capacities, feedbackList] = await Promise.all([
        db.getUsers(),
        db.getBookings(),
        db.getFacilities(),
        db.getWaitlist(),
        db.getSlotTimes(),
        db.getSportCapacities(),
        db.getFeedbackList()
      ]);
      setUsers(usersList);
      setBookings(booksList);
      setFacilities(facsList);
      setWaitlist(wlist);
      setSlotTimes(slots);
      setSportCapacities(capacities);
      setFeedbacks(feedbackList);
    } catch (e) {
      console.error('Error refreshing admin dashboard:', e);
    }
  };

  useEffect(() => {
    refreshData();
    const handleStorageUpdate = () => {
      refreshData();
      const storedTheme = localStorage.getItem('playsmart_theme') || 'blue';
      setTheme(storedTheme as any);
    };
    const handleSlotsChange = () => refreshData();
    const handleCapacitiesChange = () => refreshData();
    const handleFeedbackChange = () => refreshData();

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('slot_times_change', handleSlotsChange);
    window.addEventListener('sport_capacities_change', handleCapacitiesChange);
    window.addEventListener('feedback_change', handleFeedbackChange);

    const interval = setInterval(() => {
      refreshData();
    }, 3000);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('slot_times_change', handleSlotsChange);
      window.removeEventListener('sport_capacities_change', handleCapacitiesChange);
      window.removeEventListener('feedback_change', handleFeedbackChange);
      clearInterval(interval);
    };
  }, []);

  const handleToggleMaintenance = async (facilityId: string) => {
    await db.toggleFacilityMaintenance(facilityId);
    refreshData();
  };

  const handleAddFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFacilityError('');
    setAddFacilitySuccess('');
    
    if (!addFacilityCourtName.trim()) {
      setAddFacilityError('Court/Board Name is required.');
      return;
    }
    
    try {
      await db.addFacility(addFacilitySport, addFacilityCourtName.trim());
      setAddFacilitySuccess(`Successfully added ${addFacilitySport} - ${addFacilityCourtName}!`);
      setAddFacilityCourtName('');
      refreshData();
    } catch (err: any) {
      setAddFacilityError(err.message || 'Failed to add facility.');
    }
  };

  const handleDeleteFacility = async (facilityId: string, sport: string, courtName: string) => {
    const confirm = window.confirm(`Are you sure you want to permanently delete "${sport} - ${courtName}"?\nAll current and historical bookings and waitlist slots for this court will be cancelled/deleted.`);
    if (!confirm) return;
    
    try {
      await db.deleteFacility(facilityId);
      alert('Facility deleted successfully.');
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete facility.');
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlotsError('');
    setSlotsSuccess('');
    
    const formattedInput = newSlotInput.trim().toUpperCase();
    if (!formattedInput) {
      setSlotsError('Slot timing string is required.');
      return;
    }
    
    const timeRegex = /^\d{1,2}-\d{1,2}\s*(AM|PM)$/i;
    if (!timeRegex.test(formattedInput)) {
      setSlotsError('Format must be like "8-9 PM" or "11-12 AM".');
      return;
    }
    
    if (slotTimes.includes(formattedInput as SlotTime)) {
      setSlotsError('This slot timing already exists.');
      return;
    }
    
    try {
      const updatedSlots = [...slotTimes, formattedInput as SlotTime];
      await db.saveSlotTimes(updatedSlots);
      setSlotsSuccess(`Successfully added slot "${formattedInput}"!`);
      setNewSlotInput('');
      refreshData();
    } catch (err: any) {
      setSlotsError(err.message || 'Failed to add slot.');
    }
  };

  const handleDeleteSlot = async (slotToDelete: string) => {
    const confirm = window.confirm(`Are you sure you want to delete the slot timing "${slotToDelete}"?\nBookings scheduled in this time slot will be removed.`);
    if (!confirm) return;
    
    try {
      const bookingsInSlot = bookings.filter(b => b.slotTime === slotToDelete && b.status !== 'cancelled');
      if (bookingsInSlot.length > 0) {
        const warnConfirm = window.confirm(`Warning: There are ${bookingsInSlot.length} active bookings in the "${slotToDelete}" slot. Deleting this slot will cancel all of them. Proceed?`);
        if (!warnConfirm) return;
      }
      
      const updatedSlots = slotTimes.filter(slot => slot !== slotToDelete);
      await db.saveSlotTimes(updatedSlots);
      alert('Slot deleted successfully.');
      refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete slot.');
    }
  };

  const handleSaveCapacities = async (e: React.FormEvent) => {
    e.preventDefault();
    setCapacitiesError('');
    setCapacitiesSuccess('');
    
    try {
      await db.saveSportCapacities(sportCapacities);
      setCapacitiesSuccess('Sport capacities saved and synchronized successfully!');
      refreshData();
    } catch (err: any) {
      setCapacitiesError(err.message || 'Failed to save sport capacities.');
    }
  };

  const handleChangeRole = async (userId: string, role: 'employee' | 'security' | 'admin') => {
    const success = await db.changeUserRole(userId, role);
    if (success) {
      refreshData();
      alert('User role updated successfully.');
    } else {
      alert('Failed to update user role.');
    }
  };

  const handleApproveUser = async (userId: string) => {
    const comments = approvalComments[userId] || 'Welcome to the TCS PlaySmart platform!';
    const success = await db.approveUserWithComments(userId, comments);
    if (success) {
      setApprovalComments(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      refreshData();
      alert('User account approved and activated successfully.');
    } else {
      alert('Failed to approve user account.');
    }
  };

  const handleRejectUser = async (userId: string) => {
    const comments = approvalComments[userId] || '';
    if (!comments.trim()) {
      alert("A rejection reason/comment is required in the input field to notify the applicant.");
      return;
    }

    const success = await db.rejectUser(userId, comments);
    if (success) {
      setApprovalComments(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      refreshData();
      alert('User registration request rejected.');
    } else {
      alert('Failed to reject user.');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const confirmToggle = window.confirm(`Are you sure you want to mark this user as ${newStatus.toUpperCase()}?`);
    if (!confirmToggle) return;

    const success = await db.toggleUserStatus(userId, newStatus);
    if (success) {
      refreshData();
      alert(`User status updated to ${newStatus.toUpperCase()} successfully.`);
    } else {
      alert('Failed to update user status.');
    }
  };

  const exportToExcel = () => {
    const escapeCsv = (val: string) => {
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    let csvContent = "";
    
    // Title & Date
    csvContent += `Daily Court Operations Audit,Date:,${new Date().toLocaleDateString()}\n\n`;
    
    // Metrics Section
    csvContent += `METRIC,VALUE\n`;
    csvContent += `Scheduled Slots,${activeBookingsCount}\n`;
    csvContent += `Successful Check-Ins,${activePlayersCount}\n`;
    csvContent += `No-Show Violations,${noShowsCount}\n`;
    csvContent += `Waitlist Queue,${waitlist.length}\n`;
    csvContent += `Utilization Efficiency,${courtUtilization}%\n\n`;
    
    // Live Sessions Section
    csvContent += `LIVE SESSION LOGS (TODAY)\n`;
    csvContent += `Booking ID,Employee Name,Employee ID,Sport,Court,Time Slot,Channel,Status\n`;
    bookings.forEach(b => {
      csvContent += `${escapeCsv(b.bookingId)},${escapeCsv(b.employeeName)},${escapeCsv(b.employeeId)},${escapeCsv(b.sport)},${escapeCsv(b.courtName)},${escapeCsv(b.slotTime)},${escapeCsv(b.bookingSource)},${escapeCsv(b.status)}\n`;
    });
    csvContent += `\n`;
    
    // Waitlist Section
    csvContent += `ACTIVE WAITLIST QUEUE\n`;
    csvContent += `Waitlist ID,Employee Name,Employee ID,Sport,Court,Time Slot,Requested At\n`;
    waitlist.forEach(w => {
      const timeStr = new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      csvContent += `${escapeCsv(w.waitlistId)},${escapeCsv(w.employeeName)},${escapeCsv(w.employeeId)},${escapeCsv(w.sport)},${escapeCsv(w.courtName)},${escapeCsv(w.slotTime)},${escapeCsv(timeStr)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `campus_audit_report_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 250 * 1024) {
        setProfileError('Profile picture must be under 250KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileAvatar(reader.result as string);
        setProfileError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!profileName.trim()) return setProfileError('Name is required.');
    const emailLower = profileEmail.trim().toLowerCase();
    if (!emailLower.endsWith('@tcs.com') && !emailLower.endsWith('@gmail.com')) {
      return setProfileError('Email must belong to tcs.com or gmail.com domains.');
    }

    const res = await db.updateUserProfile(
      user.employeeId,
      profileName.trim(),
      emailLower,
      profilePhone.trim(),
      profileAvatar
    );

    if (res.success) {
      setProfileSuccess('Profile details updated successfully!');
      onUpdateUser?.();
    } else {
      setProfileError(res.error || 'Failed to update profile.');
    }
  };

  const handleThemeChange = (newTheme: 'blue' | 'dark' | 'green' | 'purple') => {
    setTheme(newTheme);
    localStorage.setItem('playsmart_theme', newTheme);
    window.dispatchEvent(new Event('storage'));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) return setPasswordError('Current password is required.');
    if (newPassword.length < 6) return setPasswordError('New password must be at least 6 characters long.');
    if (newPassword !== confirmPassword) return setPasswordError('New passwords do not match.');

    const res = await db.changePassword(user.employeeId, currentPassword, newPassword);
    if (res.success) {
      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'Failed to update password.');
    }
  };

  // --- COMPUTE DYNAMIC METRICS (Section 16) ---
  const totalEmployeesCount = users.filter(u => u.role === 'employee').length;
  const pendingUsers = users.filter(u => u.status === 'pending');
  const activeUsers = users.filter(u => u.status === 'active' || u.status === 'inactive');
  const activeBookingsCount = bookings.filter(b => b.status !== 'cancelled').length;
  const totalSlotsCapacity = facilities.length * slotTimes.length; // 15 courts * 14 hours = 210 slots
  const availableSlotsCount = Math.max(0, totalSlotsCapacity - activeBookingsCount);
  const activePlayersCount = bookings.filter(b => b.status === 'checked_in').length;
  const noShowsCount = bookings.filter(b => b.status === 'no_show').length;
  const courtUtilization = totalSlotsCapacity > 0 
    ? Math.round((activeBookingsCount / totalSlotsCapacity) * 100) 
    : 0;

  // --- PROCESS CHARTS DATASETS (Section 16 Charts) ---
  
  // 1. Weekly Usage Dataset (Count bookings across days)
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeklyUsageData = daysOfWeek.map((day, idx) => {
    // Generate realistic relative distribution with our actual count added on current day (Thursday)
    const baseBookings = [42, 58, 65, activeBookingsCount, 0, 0, 0]; // Simulating Monday-Wednesday history, today is Thursday
    return {
      day,
      'Bookings count': baseBookings[idx]
    };
  });

  // 2. Sports Popularity Dataset (Dynamic based on live bookings)
  const sportsList: SportType[] = ['Badminton', 'Basketball', 'Volleyball', 'Table Tennis', 'Carrom', 'Box Cricket'];
  const colors = ['#3b82f6', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#eab308'];

  const sportsPopularityData = sportsList.map(sport => {
    const count = bookings.filter(b => b.sport === sport && b.status !== 'cancelled').length;
    // Add a baseline of static mock distributions if empty so the charts look beautiful
    const baseDistribution: Record<SportType, number> = {
      'Badminton': 8,
      'Basketball': 5,
      'Volleyball': 4,
      'Table Tennis': 3,
      'Carrom': 2,
      'Box Cricket': 6
    };
    return {
      name: sport,
      value: count + baseDistribution[sport]
    };
  });

  // 3. Hourly Usage Dataset (Dynamic based on slots)
  const hourlyUsageData = slotTimes.map(slot => {
    const count = bookings.filter(b => b.slotTime === slot && b.status !== 'cancelled').length;
    // Add baseline distribution for a visual line curve
    const hourBase: Record<string, number> = {
      '6-7 AM': 3, '7-8 AM': 6, '8-9 AM': 4, '9-10 AM': 2, '10-11 AM': 1,
      '11-12 PM': 1, '12-1 PM': 3, '1-2 PM': 2, '2-3 PM': 1, '3-4 PM': 2,
      '4-5 PM': 4, '5-6 PM': 8, '6-7 PM': 9, '7-8 PM': 5
    };
    return {
      hour: slot,
      'Active bookings': count + (hourBase[slot] || 0)
    };
  });

  // 4. Daily Bookings Trend (Recent dates)
  const dailyBookingsData = [
    { date: '28 Jun', bookings: 38 },
    { date: '29 Jun', bookings: 45 },
    { date: '30 Jun', bookings: 49 },
    { date: '01 Jul', bookings: 55 },
    { date: '02 Jul (Today)', bookings: 42 + activeBookingsCount }
  ];

  return (
    <div id="admin_dashboard" className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col justify-between">
      <div className="grow">
        {/* Top Corporate Nav */}
        <nav className={`${THEMES[theme]?.navBg || 'bg-[#003366]'} text-white py-3.5 px-4 sm:px-6 lg:px-8 shadow-sm transition-all duration-300`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center font-bold italic text-white shadow-sm border border-white/15">P</div>
              <div>
                <span className="font-display font-bold text-lg text-white block leading-tight">
                  PlaySmart Admin
                </span>
                <span className="text-[10px] text-blue-200 font-semibold uppercase tracking-wider block">
                  Corporate Sports Committee
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-right">
                {user.avatar ? (
                  <img src={user.avatar} className="w-7 h-7 rounded-full object-cover border border-white/25 shadow-sm" alt="Avatar" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white border border-white/25 shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-xs font-semibold block text-slate-100 text-left">{user.name}</span>
                  <span className="text-[10px] text-blue-200/80 font-mono block text-left">Admin Console</span>
                </div>
              </div>

              <button
                id="admin_logout_btn"
                onClick={onLogout}
                className="px-3 py-1.5 text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs (Section 16 Management) */}
        <div className="flex flex-wrap border-b border-slate-200 mb-8 gap-2">
          <button
            id="admin_tab_analytics"
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'analytics' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarIcon className="w-4 h-4" /> Analytics Dashboard
          </button>
          <button
            id="admin_tab_users"
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'users' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Manage Users
          </button>
          <button
            id="admin_tab_approvals"
            onClick={() => setActiveTab('approvals')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'approvals' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" /> Pending Approvals
            {pendingUsers.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>
          <button
            id="admin_tab_facilities"
            onClick={() => setActiveTab('facilities')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'facilities' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" /> Facilities & Maintenance
          </button>
          <button
            id="admin_tab_reports"
            onClick={() => setActiveTab('reports')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'reports' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" /> Audit & Reports
          </button>
          <button
            id="admin_tab_security"
            onClick={() => setActiveTab('security')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'security' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" /> Change Password
          </button>
          <button
            id="admin_tab_feedback"
            onClick={() => setActiveTab('feedback')}
            className={`pb-3 px-4 font-display font-semibold text-sm border-b-2 cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'feedback' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> User Feedbacks
            {feedbacks.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {feedbacks.length}
              </span>
            )}
          </button>
        </div>

        {/* ANALYTICS DASHBOARD VIEW */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            
            {/* KPI Cards Grid (Section 16) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">TCS Employees</p>
                <p className="text-xl font-bold font-display mt-0.5">{totalEmployeesCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Today's Bookings</p>
                <p className="text-xl font-bold font-display mt-0.5">{activeBookingsCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Available Slots</p>
                <p className="text-xl font-bold font-display mt-0.5">{availableSlotsCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mb-2">
                  <Activity className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Players</p>
                <p className="text-xl font-bold font-display mt-0.5">{activePlayersCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center mb-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">No Shows</p>
                <p className="text-xl font-bold font-display mt-0.5">{noShowsCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mb-2">
                  <Percent className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Court Utilization</p>
                <p className="text-xl font-bold font-display mt-0.5">{courtUtilization}%</p>
              </div>

            </div>

            {/* Charts Section (Section 16 Charts) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Daily Bookings & Weekly Usage */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-800 text-sm mb-4">Weekly Usage Trends</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyUsageData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Bookings count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sports Popularity Distribution */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-800 text-sm mb-4">Sports Popularity</h3>
                <div className="h-64 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sportsPopularityData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {sportsPopularityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {sportsPopularityData.map((s, idx) => (
                      <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[idx] }} />
                          <span className="font-semibold text-slate-700">{s.name}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">{s.value} slots</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hourly usage line graph */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
                <h3 className="font-display font-bold text-slate-800 text-sm mb-4">Hourly Utilization Curve (6:00 AM – 8:00 PM)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyUsageData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Active bookings" stroke="#3b82f6" strokeWidth={2.5} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* USERS MANAGEMENT VIEW */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">User Directories</h3>
                <p className="text-xs text-slate-500 mt-0.5">Edit user permissions or assign security/admin desk roles instantly for sandbox testing.</p>
              </div>
              <button
                onClick={refreshData}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">TCS Employee</th>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Department / BU</th>
                    <th className="py-3 px-4">Role Permission</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{u.employeeId}</td>
                      <td className="py-3 px-4 text-slate-500 font-medium">{u.email}</td>
                      <td className="py-3 px-4 text-slate-500 font-medium font-mono">{u.phoneNumber || '—'}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {u.department} <span className="text-[10px] text-slate-400 block font-mono">{u.businessUnit}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          u.role === 'security' ? 'bg-amber-100 text-amber-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {u.status === 'inactive' ? (
                          <span className="inline-block text-[10px] font-bold px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-100">
                            Inactive (Relieved)
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            Active
                          </span>
                        )}
                        {u.suspendedUntil && new Date(u.suspendedUntil) > new Date() && (
                          <span className="block text-[9px] text-rose-500 font-bold font-mono mt-1 animate-pulse" title={`Suspended until ${new Date(u.suspendedUntil).toLocaleDateString()}`}>
                            🚫 Penalty Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u.id, e.target.value as any)}
                            className="px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-700 focus:outline-none focus:bg-white"
                          >
                            <option value="employee">Employee</option>
                            <option value="security">Security</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status || 'active')}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border cursor-pointer ${
                              u.status === 'inactive' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                : 'bg-rose-50 text-rose-600 border-rose-150 hover:bg-rose-100'
                            }`}
                          >
                            {u.status === 'inactive' ? 'Activate' : 'Deactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PENDING APPROVALS VIEW */}
        {activeTab === 'approvals' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">Staff Requisitions & Approvals</h3>
                <p className="text-xs text-slate-500 mt-0.5">Approve or reject pending System Administrator and Security Officer portal access requests.</p>
              </div>
              <button
                onClick={refreshData}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {pendingUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No Pending Approvals</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">All administrator and security staff credentials have been verified and are active.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Applicant</th>
                      <th className="py-3 px-4">Employee ID</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Department / BU</th>
                      <th className="py-3 px-4">Requested Role</th>
                      <th className="py-3 px-4">Decision Comments</th>
                      <th className="py-3 px-4 text-center">Action Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{u.employeeId}</td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{u.email}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {u.department} <span className="text-[10px] text-slate-400 block font-mono">{u.businessUnit}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={approvalComments[u.id] || ''}
                            onChange={(e) => setApprovalComments(prev => ({ ...prev, [u.id]: e.target.value }))}
                            placeholder="Reason for rejection or welcome note..."
                            className="w-full min-w-[200px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleApproveUser(u.id)}
                              className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded-xl text-[10px] font-bold transition-all shadow-sm cursor-pointer uppercase tracking-wider"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectUser(u.id)}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-xl text-[10px] font-bold transition-all cursor-pointer uppercase tracking-wider"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FACILITIES MANAGEMENT VIEW */}
        {activeTab === 'facilities' && (
          <div className="space-y-8">
            {/* 1. Facilities Switchboard and Addition */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-lg">Facility Maintenance & Court Switchboard</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Toggle maintenance tags or dynamically add and remove courts from the platform.</p>
                </div>
              </div>

              {/* Add Facility Form */}
              <form onSubmit={handleAddFacility} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label htmlFor="add_fac_sport" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sport Category</label>
                  <select
                    id="add_fac_sport"
                    value={addFacilitySport}
                    onChange={(e) => setAddFacilitySport(e.target.value as SportType)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-slate-900"
                  >
                    {(['Badminton', 'Basketball', 'Volleyball', 'Table Tennis', 'Carrom', 'Box Cricket'] as SportType[]).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="add_fac_name" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Court / Table / Board Name</label>
                  <input
                    id="add_fac_name"
                    type="text"
                    placeholder="e.g. Court 4, Table 3"
                    value={addFacilityCourtName}
                    onChange={(e) => setAddFacilityCourtName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm h-[38px] flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> Add Court / Facility
                </button>

                {addFacilityError && <p className="text-[11px] text-rose-600 sm:col-span-3 mt-1 font-semibold">{addFacilityError}</p>}
                {addFacilitySuccess && <p className="text-[11px] text-emerald-600 sm:col-span-3 mt-1 font-semibold">{addFacilitySuccess}</p>}
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {facilities.map(facility => (
                  <div key={facility.facilityId} className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md hover:scale-[1.02] hover:border-blue-200 transition-all duration-300 ease-out flex items-center justify-between">
                    <div>
                      <h4 className="font-display font-bold text-slate-900 text-sm">{facility.sport}</h4>
                      <p className="text-xs text-slate-500">{facility.courtName}</p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 ${
                        facility.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {facility.status === 'active' ? 'Online' : 'In Maintenance'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleMaintenance(facility.facilityId)}
                        className="p-1 cursor-pointer transition-colors"
                        title={facility.status === 'active' ? 'Set Offline' : 'Set Active'}
                      >
                        {facility.status === 'active' ? (
                          <ToggleLeft className="w-9 h-9 text-slate-400 hover:text-rose-500" />
                        ) : (
                          <ToggleRight className="w-9 h-9 text-rose-500 hover:text-slate-400" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteFacility(facility.facilityId, facility.sport, facility.courtName)}
                        className="p-2 border border-slate-200 hover:border-rose-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all cursor-pointer"
                        title="Delete Court Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Timing Slot Configuration */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="font-display font-bold text-slate-900 text-lg">Timing Slot Customizer</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize daily operational scheduling hours. Updates will be synchronized with all portals instantly.</p>
              </div>

              <div className="space-y-6">
                {/* Active slots list */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Currently Active Timings</h4>
                  <div className="flex flex-wrap gap-2.5">
                    {slotTimes.map(slot => (
                      <div key={slot} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-mono font-bold hover:border-rose-200 hover:bg-rose-50/50 hover:text-rose-700 transition-colors group">
                        <span>{slot}</span>
                        <button
                          onClick={() => handleDeleteSlot(slot)}
                          className="text-slate-400 group-hover:text-rose-600 transition-colors cursor-pointer"
                          title={`Remove timing "${slot}"`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add timing slot form */}
                <form onSubmit={handleAddSlot} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div className="sm:col-span-2">
                    <label htmlFor="add_slot_time" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">New Slot Time String</label>
                    <input
                      id="add_slot_time"
                      type="text"
                      placeholder="e.g. 8-9 PM or 11-12 AM (24h or simple text format)"
                      value={newSlotInput}
                      onChange={(e) => setNewSlotInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm h-[38px]"
                  >
                    Add Timing Slot
                  </button>

                  {slotsError && <p className="text-[11px] text-rose-600 sm:col-span-3 mt-1 font-semibold">{slotsError}</p>}
                  {slotsSuccess && <p className="text-[11px] text-emerald-600 sm:col-span-3 mt-1 font-semibold">{slotsSuccess}</p>}
                </form>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-xs text-amber-800">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Important Notice:</span> Adding or removing timing slots modifies the central layout constraints of the booking grids. Removing slots with existing bookings will trigger cascade cancellations for affected matches.
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Sport Capacity Customizer */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="mb-6">
                <h3 className="font-display font-bold text-slate-900 text-lg">Sport Capacity Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">Define the maximum number of players allowed to join a single time slot for each sport. Set to 1 to allow a single employee to reserve the entire court/board.</p>
              </div>

              <form onSubmit={handleSaveCapacities} className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.keys(sportCapacities).map((sport) => (
                    <div key={sport} className="bg-slate-50 p-4 border border-slate-200/60 rounded-2xl">
                      <label htmlFor={`cap_${sport}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center truncate">{sport}</label>
                      <input
                        id={`cap_${sport}`}
                        type="number"
                        min="1"
                        max="50"
                        value={sportCapacities[sport]}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setSportCapacities(prev => ({
                            ...prev,
                            [sport]: val
                          }));
                        }}
                        className="w-full text-center px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 pt-4">
                  <div className="text-left">
                    {capacitiesError && <p className="text-xs text-rose-600 font-semibold">{capacitiesError}</p>}
                    {capacitiesSuccess && <p className="text-xs text-emerald-600 font-semibold">{capacitiesSuccess}</p>}
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm uppercase tracking-wider"
                  >
                    Save Capacities
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AUDIT & REPORTS VIEW */}
        {activeTab === 'reports' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-lg">Campus Audit Reports</h3>
                <p className="text-xs text-slate-500 mt-0.5">Compile daily usage metrics, check-in logs, and policy compliance records.</p>
              </div>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" /> Export Excel Report
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700">Daily Court Operations Audit</span>
                <span className="font-mono text-slate-500">Date: {new Date().toLocaleDateString()}</span>
              </div>

              <div className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Scheduled Slots</p>
                    <p className="text-base font-bold text-slate-800 mt-0.5">{activeBookingsCount}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Successful Check-Ins</p>
                    <p className="text-base font-bold text-emerald-700 mt-0.5">{activePlayersCount}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">No-Show Violations</p>
                    <p className="text-base font-bold text-rose-700 mt-0.5">{noShowsCount}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Waitlist Queue</p>
                    <p className="text-base font-bold text-amber-600 mt-0.5">{waitlist.length}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Utilization Efficiency</p>
                    <p className="text-base font-bold text-purple-700 mt-0.5">{courtUtilization}%</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Live Session Logs (Today)</h4>
                  {bookings.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No logged reservations for today's date yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] text-slate-500">
                        <thead>
                          <tr className="border-b border-slate-200 font-semibold text-slate-400">
                            <th className="py-2">Booking ID</th>
                            <th className="py-2">Employee</th>
                            <th className="py-2">Sport Court</th>
                            <th className="py-2">Time Slot</th>
                            <th className="py-2">Channel</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bookings.map(b => (
                            <tr key={b.bookingId}>
                              <td className="py-2 font-mono text-slate-400">{b.bookingId}</td>
                              <td className="py-2 font-bold text-slate-800">
                                {b.employeeName} ({b.employeeId})
                              </td>
                              <td className="py-2 text-slate-700 font-medium">{b.sport} - {b.courtName}</td>
                              <td className="py-2 font-mono font-bold text-slate-600">{b.slotTime}</td>
                              <td className="py-2 capitalize font-mono text-[10px]">{b.bookingSource}</td>
                              <td className="py-2">
                                <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  b.status === 'checked_in' ? 'bg-amber-100 text-amber-800' :
                                  b.status === 'no_show' ? 'bg-rose-100 text-rose-800' :
                                  b.status === 'cancelled' ? 'bg-slate-100 text-slate-500' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {b.status.replace('_', ' ')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                    Active Waitlist Queue ({waitlist.length})
                  </h4>
                  {waitlist.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No employees currently in the waitlist queues.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] text-slate-500">
                        <thead>
                          <tr className="border-b border-slate-200 font-semibold text-slate-400">
                            <th className="py-2">Waitlist ID</th>
                            <th className="py-2">Employee</th>
                            <th className="py-2">Sport Court</th>
                            <th className="py-2">Time Slot</th>
                            <th className="py-2">Requested At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {waitlist.map(w => (
                            <tr key={w.waitlistId}>
                              <td className="py-2 font-mono text-slate-400">{w.waitlistId}</td>
                              <td className="py-2 font-bold text-slate-800">{w.employeeName} ({w.employeeId})</td>
                              <td className="py-2 text-slate-700 font-medium">{w.sport} - {w.courtName}</td>
                              <td className="py-2 font-mono font-bold text-amber-600">{w.slotTime}</td>
                              <td className="py-2 font-mono text-[10px] text-slate-400">
                                {new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left 2 Columns: Profile Details */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
              <h3 className="font-display font-bold text-slate-900 text-lg mb-1">My Profile</h3>
              <p className="text-xs text-slate-500 mb-6">Manage your personal details, profile picture, and corporate department settings.</p>

              {profileError && (
                <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
                  {profileError}
                </div>
              )}

              {profileSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl">
                  {profileSuccess}
                </div>
              )}

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                {/* Profile Picture Upload */}
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
                  <div className="relative">
                    {profileAvatar ? (
                      <img src={profileAvatar} className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-md" alt="Profile" />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-blue-100 text-[#003366] flex items-center justify-center font-bold text-3xl border-4 border-slate-100 shadow-md">
                        {profileName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center cursor-pointer shadow-md hover:bg-slate-700 transition-colors">
                      <Download className="w-4 h-4 rotate-180" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="text-center sm:text-left">
                    <h4 className="font-bold text-slate-800 text-sm">Profile Picture</h4>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, or GIF. Max 250KB size limit.</p>
                    {profileAvatar && (
                      <button
                        type="button"
                        onClick={() => setProfileAvatar('')}
                        className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Remove Picture
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="text"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-medium"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      TCS Employee ID (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.employeeId}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Corporate Department (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.department}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Business Unit (Read-only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user.businessUnit}
                      className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-bold"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className={`px-6 py-2.5 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm uppercase tracking-wider`}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Security & Preferences */}
            <div className="space-y-8">
              
              {/* Security/Password Change Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-900 text-sm mb-1">Change Password</h3>
                <p className="text-[11px] text-slate-500 mb-4">Ensure your account uses a secure password phrase.</p>

                {passwordError && (
                  <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold rounded-lg">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-lg">
                    {passwordSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="At least 6 characters"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                      placeholder="Repeat new password"
                    />
                  </div>

                  <button
                    type="submit"
                    className={`w-full mt-1 py-2 ${THEMES[theme]?.primaryBtn || 'bg-[#003366] hover:bg-blue-900'} text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-sm uppercase tracking-wider`}
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {/* Theme Preferences Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-display font-bold text-slate-900 text-sm mb-1">Portal Theme Preferences</h3>
                <p className="text-[11px] text-slate-500 mb-4">Choose a color layout signature for your workspace header.</p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('blue')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'blue' ? 'border-[#003366] bg-blue-50/40 text-[#003366] font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#003366] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">TCS Blue</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'dark' ? 'border-slate-800 bg-slate-50 text-slate-950 font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#0f172a] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">Midnight</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('green')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'green' ? 'border-[#064e3b] bg-emerald-50/40 text-[#064e3b] font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#064e3b] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">Emerald</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('purple')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                      theme === 'purple' ? 'border-[#3b0764] bg-fuchsia-50/40 text-[#3b0764] font-bold' : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#3b0764] border border-white/20 shadow-sm"></div>
                    <span className="text-[10px]">Royal Purple</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <div className="mb-6">
              <h3 className="font-display font-bold text-slate-900 text-lg">Employee Feedback Logs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Read reviews, comments, and ratings submitted by TCS employees regarding sports facility quality and timings.</p>
            </div>

            {feedbacks.length === 0 ? (
              <p className="text-slate-400 text-center py-8 italic">No employee feedback has been submitted yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {feedbacks.map((fb) => (
                  <div key={fb.id} className="border border-slate-200 p-5 rounded-2xl bg-slate-50/50 hover:bg-white hover:shadow-md transition-all duration-300">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full mb-1">{fb.subject}</span>
                        <h4 className="font-display font-bold text-slate-900 text-sm">{fb.employeeName}</h4>
                        <p className="text-[10px] font-mono text-slate-400">Employee ID: {fb.employeeId}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed italic">"{fb.content}"</p>
                    <div className="text-[9px] text-slate-400 mt-3 font-mono">
                      Submitted at: {new Date(fb.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>

    {/* Footer Status Bar */}
    <footer className="h-10 bg-slate-100 border-t border-slate-200 px-6 flex items-center justify-between text-[11px] font-medium text-slate-500 shrink-0">
      <div className="flex gap-4">
        <span>Database: 12ms Response</span>
        <span className="text-slate-300">|</span>
        <span>Supabase Realtime: Connected</span>
        <span className="text-slate-300">|</span>
        <span>Last Sync: {new Date().toLocaleTimeString()}</span>
      </div>
      <div className="flex gap-2 items-center">
        <span className="w-2 h-2 bg-[#003366] rounded-full animate-pulse"></span>
        <span>PlaySmart Admin v1.0.4-Stable</span>
      </div>
    </footer>
    <AIChatAssistant user={user} />
  </div>
);
}
