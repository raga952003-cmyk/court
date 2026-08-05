/**
 * IT team inbox — application concern tickets only.
 */

import React, { useState } from 'react';
import { User } from '../types';
import { db } from '../lib/database';
import NotificationBell from './NotificationBell';
import TicketInbox from './TicketInbox';
import AIChatAssistant from './AIChatAssistant';
import { KeyRound, UserCircle } from 'lucide-react';

interface ITDashboardProps {
  user: User;
  onLogout: () => void;
  onUpdateUser?: () => void;
}

export default function ITDashboard({ user, onLogout, onUpdateUser }: ITDashboardProps) {
  const [activeTab, setActiveTab] = useState<'tickets' | 'profile'>('tickets');
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phoneNumber || '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    const res = await db.updateUserProfile(
      user.employeeId,
      profileName.trim(),
      profileEmail.trim().toLowerCase(),
      profilePhone.trim(),
      user.avatar || ''
    );
    if (res.success) {
      setProfileSuccess('Profile updated.');
      onUpdateUser?.();
    } else {
      setProfileError(res.error || 'Failed to update profile.');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    const res = await db.changePassword(user.employeeId, currentPassword, newPassword);
    if (res.success) {
      setPasswordSuccess('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'Failed to change password.');
    }
  };

  return (
    <div className="min-h-screen tcs-campus-bg text-slate-800">
      <nav className="bg-[#003366] text-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/tcs_logo.png"
              className="h-8 w-auto object-contain bg-white/95 rounded px-1.5 py-0.5"
              alt="TCS"
            />
            <div>
              <p className="font-display font-bold text-sm tracking-tight">TCS Play-Smart</p>
              <p className="text-[11px] text-blue-200 font-mono">
                IT Desk · {user.name} · {user.employeeId}
                {user.businessUnit ? ` · ${user.businessUnit}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell employeeId={user.employeeId} variant="onDark" />
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 text-xs font-bold text-rose-300 hover:text-white hover:bg-rose-600 rounded-lg border border-rose-500/20 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`pb-2.5 px-3 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'tickets'
                ? 'text-[#003366] border-[#003366]'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            Application Tickets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-3 text-sm font-semibold border-b-2 cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'text-[#003366] border-[#003366]'
                : 'text-slate-500 border-transparent hover:text-slate-800'
            }`}
          >
            <UserCircle className="w-4 h-4" />
            Profile & Password
          </button>
        </div>

        {activeTab === 'tickets' && (
          <>
            <div className="bg-sky-50 border border-sky-200 text-sky-950 p-4 rounded-2xl mb-6 text-xs leading-relaxed">
              Application issues route here. Acknowledge within <strong>10 minutes</strong> or the ticket
              auto-escalates to urgent. Admins may also move tickets into this queue manually.
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <TicketInbox user={user} queue="it" title="IT application tickets" />
            </div>
          </>
        )}

        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-display font-bold text-slate-900 text-sm mb-1">My Profile</h3>
              <p className="text-[11px] text-slate-500 mb-4">Update contact details for the IT desk.</p>
              {profileError && (
                <div className="mb-3 p-2 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold rounded-lg">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold rounded-lg">
                  {profileSuccess}
                </div>
              )}
              <form onSubmit={handleProfileSave} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Employee ID (read-only)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.employeeId}
                    className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Location (read-only)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={user.businessUnit || '—'}
                    className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400 font-bold"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-display font-bold text-slate-900 text-sm mb-1 inline-flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" /> Change Password
              </h3>
              <p className="text-[11px] text-slate-500 mb-4">Use a strong password for the IT desk account.</p>
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
                    className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
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
                    className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
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
                    className="block w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <AIChatAssistant user={user} />
    </div>
  );
}
