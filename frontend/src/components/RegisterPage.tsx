/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { db } from '../lib/database';
import { ChevronLeft, ShieldAlert, CheckCircle2, User, Mail, Briefcase, KeyRound, Building, Hash, Phone } from 'lucide-react';
import { UserRole } from '../types';

interface RegisterPageProps {
  onSuccess: () => void;
  onNavigateBack: () => void;
  onNavigateLogin: () => void;
}

export default function RegisterPage({ onSuccess, onNavigateBack, onNavigateLogin }: RegisterPageProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('BFSI');
  const [businessUnit, setBusinessUnit] = useState('BU_TCS_CHN');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const departments = ['BFSI', 'Retail & CPG', 'Manufacturing', 'HiTech & Telecom', 'Life Sciences', 'Physical Security', 'HR & Admin'];
  const businessUnits = ['BU_TCS_CHN', 'BU_TCS_MUM', 'BU_TCS_BLR', 'BU_TCS_DEL', 'BU_SEC_CHN', 'BU_ADM_CHN'];

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
      department,
      businessUnit,
      role,
      password
    });

    if (result.success) {
      setSuccess('Account created successfully! Redirecting you to login...');
      setTimeout(() => {
        onNavigateLogin();
      }, 1500);
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  return (
    <div id="register_screen" className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <button
          id="register_back_btn"
          onClick={onNavigateBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/tcs_logo.png" className="h-8 object-contain" alt="TCS Logo" />
          <span className="text-xl font-bold tracking-tight text-[#003366] font-display">PlaySmart</span>
          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[9px] font-semibold uppercase tracking-wider font-sans">Campus Hub</span>
        </div>
        <h2 className="text-center text-3xl font-display font-extrabold text-slate-900 tracking-tight">
          Create Employee Account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          Or{' '}
          <button
            id="register_to_login_btn"
            onClick={onNavigateLogin}
            className="font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
          >
            log in to your existing account
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 shadow-sm sm:rounded-2xl border border-slate-200">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Department */}
              <div>
                <label htmlFor="reg_department" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Department
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <select
                    id="reg_department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Business Unit */}
              <div>
                <label htmlFor="reg_bu" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Business Unit
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <select
                    id="reg_bu"
                    value={businessUnit}
                    onChange={(e) => setBusinessUnit(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-950"
                  >
                    {businessUnits.map(bu => (
                      <option key={bu} value={bu}>{bu}</option>
                    ))}
                  </select>
                </div>
              </div>
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
                    <option value="employee">TCS Employee</option>
                    <option value="security">Security Officer</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>
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
