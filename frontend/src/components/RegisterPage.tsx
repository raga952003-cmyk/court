/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { db } from '../lib/database';
import { ChevronLeft, ShieldAlert, CheckCircle2, User, Mail, KeyRound, Building, Hash, Phone, Info } from 'lucide-react';
import { UserRole } from '../types';
import { DEFAULT_TCS_LOCATION, TCS_LOCATION_GROUPS } from '../data/tcsLocations';

interface RegisterPageProps {
  onSuccess: () => void;
  onNavigateBack: () => void;
  onNavigateLogin: () => void;
}

export default function RegisterPage({ onSuccess, onNavigateBack, onNavigateLogin }: RegisterPageProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [businessUnit, setBusinessUnit] = useState(DEFAULT_TCS_LOCATION);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [approverHint, setApproverHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadHint = async () => {
      if (role === 'employee') {
        setApproverHint('Employees can log in immediately after register — no admin approval needed.');
        return;
      }
      try {
        const { admins, scope } = await db.getApproverContacts(businessUnit);
        if (cancelled) return;
        if (admins.length === 0) {
          setApproverHint(
            role === 'admin'
              ? 'If no admin exists at this location yet, the first Administrator can activate on first login.'
              : 'After register you stay pending until an admin can approve you. No admin contact is listed yet for this campus.'
          );
          return;
        }
        const contacts = db.formatLocationAdminContacts(admins);
        setApproverHint(
          scope === 'location'
            ? `After register you stay pending until approved. Contact your location admin: ${contacts}.`
            : `After register you stay pending until approved. No admin at this campus yet — contact: ${contacts}.`
        );
      } catch {
        if (!cancelled) {
          setApproverHint(
            'Security, Admin, and IT need approval from an active location admin before login.'
          );
        }
      }
    };
    loadHint();
    return () => {
      cancelled = true;
    };
  }, [role, businessUnit]);

  const roleTitle =
    role === 'admin'
      ? 'Create Administrator Account'
      : role === 'security'
        ? 'Create Security Officer Account'
        : role === 'it'
          ? 'Create IT Support Account'
          : 'Create Employee Account';

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validations
    if (!employeeId.trim()) return setError('Employee ID is required.');
    if (!name.trim()) return setError('Name is required.');
    if (!email.trim()) return setError('Email address is required.');
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.endsWith('@tcs.com') && !emailLower.endsWith('@gmail.com')) {
      return setError('Only TCS (@tcs.com) and Gmail (@gmail.com) email addresses are allowed.');
    }
    if (!password) return setError('Password is required.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    const result = await db.registerUser({
      employeeId: employeeId.trim().toUpperCase(),
      name: name.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber.trim(),
      businessUnit,
      role,
      password
    });

    if (result.success) {
      const created = result.user;
      const isPending = created?.status === 'pending' || created?.approved === false;
      if (isPending) {
        const pendingMsg = await db.buildPendingApprovalMessage(
          created?.role || role,
          created?.businessUnit || businessUnit
        );
        setSuccess(`${pendingMsg} Redirecting you to login...`);
        setTimeout(() => {
          onNavigateLogin();
        }, 3500);
      } else {
        setSuccess('Account created successfully! Redirecting you to login...');
        setTimeout(() => {
          onNavigateLogin();
        }, 1500);
      }
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  return (
    <div id="register_screen" className="min-h-screen tcs-auth-bg flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <button
          id="register_back_btn"
          onClick={onNavigateBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4">
          <img src="/tcs_logo.png" className="h-8 sm:h-9 object-contain bg-white rounded px-1.5 py-0.5 shadow-sm" alt="TCS Logo" />
          <span className="text-lg sm:text-xl font-bold tracking-tight text-[#003366] font-display">TCS Play-Smart</span>
          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[9px] font-semibold uppercase tracking-wider font-sans">Campus Hub</span>
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight px-1">
          {roleTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          Choose your location and portal role below.{' '}
          <button
            id="register_to_login_btn"
            onClick={onNavigateLogin}
            className="font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            Or log in to your existing account
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-6 sm:py-8 px-4 sm:px-6 shadow-sm rounded-2xl border border-slate-200">
          <form className="space-y-5" onSubmit={handleRegister}>
            {error && (
              <div id="register_error_alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div id="register_success_alert" className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{success}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Employee ID */}
              <div>
                <label htmlFor="reg_employee_id" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Employee ID
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    id="reg_employee_id"
                    type="text"
                    required
                    placeholder="e.g. EMP404"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-mono"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label htmlFor="reg_name" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Full Name
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="reg_name"
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  />
                </div>
              </div>
            </div>

            {/* Location (stored as business_unit) */}
            <div>
              <label htmlFor="reg_location" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Location
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Building className="w-4 h-4" />
                </div>
                <select
                  id="reg_location"
                  value={businessUnit}
                  onChange={(e) => setBusinessUnit(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                >
                  {TCS_LOCATION_GROUPS.map(group => (
                    <optgroup key={group.region} label={group.region}>
                      {group.locations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Select your TCS office / delivery location.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Account Role Selection */}
              <div>
                <label htmlFor="reg_role" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Account Portal Role
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <select
                    id="reg_role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950 font-semibold"
                  >
                    <option value="employee">TCS Employee (default)</option>
                    <option value="security">Security Officer</option>
                    <option value="admin">System Administrator</option>
                    <option value="it">IT Support</option>
                  </select>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>{approverHint}</span>
                </p>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="reg_email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Corporate Email Address
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="reg_email"
                    type="email"
                    required
                    placeholder="name@tcs.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  />
                </div>
              </div>
            </div>

            {/* Phone Number Field */}
            <div>
              <label htmlFor="reg_phone" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Phone Number (Optional)
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="reg_phone"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Password */}
              <div>
                <label htmlFor="reg_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Password
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="reg_password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  />
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="reg_confirm_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="reg_confirm_password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                id="register_submit_btn"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors cursor-pointer"
              >
                Register Account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
