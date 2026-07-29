/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { db } from '../lib/database';
import { KeyRound, User, ChevronLeft, ShieldAlert, ArrowRight, Activity } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
  onNavigateBack: () => void;
  onNavigateRegister: () => void;
  onOpenAdminSetup?: () => void;
  restrictRole?: 'admin' | 'security' | 'employee';
}

export default function LoginPage({ onSuccess, onNavigateBack, onNavigateRegister, onOpenAdminSetup, restrictRole }: LoginPageProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState(''); 
  const [error, setError] = useState('');
  const [hasAdmin, setHasAdmin] = useState(true);

  React.useEffect(() => {
    db.hasAdmin().then(res => setHasAdmin(res)).catch(() => setHasAdmin(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeId) {
      setError('Please enter your TCS Employee ID.');
      return;
    }

    const result = await db.loginUser(employeeId, password);
    if (result.success && result.user) {
      const activeRole = restrictRole || 'employee';
      if (result.user.role !== activeRole) {
        db.logoutUser();
        if (activeRole === 'admin') {
          setError('This login portal is restricted to Administrator accounts only.');
        } else if (activeRole === 'security') {
          setError('This login portal is restricted to Security personnel only.');
        } else {
          setError('This login portal is restricted to Employee Hub users. Please use your role-specific URL.');
        }
        return;
      }
      onSuccess();
    } else {
      setError(result.error || 'Login failed.');
    }
  };

  const handleForgotPassword = async () => {
    if (restrictRole === 'admin') {
      const email = prompt("Forgot Admin credentials? Please enter your registered Administrator Email Address:");
      if (!email) return;

      setError('');
      const res = await db.recoverAdminCredentials(email);
      if (res.success) {
        alert(`Admin Credentials Recovery Successful!\n\nA simulated recovery email has been sent to ${email} containing your TCS Employee ID and temporary password details. Click the "Outbox Log" button in the simulated header to view it.`);
        window.dispatchEvent(new Event('simulated_email_sent'));
      } else {
        setError(res.error || 'Recovery failed.');
      }
    } else {
      const empId = prompt("Please enter your TCS Employee ID to recover your password:");
      if (!empId) return;
      
      setError('');
      const res = await db.forgotPassword(empId);
      if (res.success) {
        alert(`Password recovery request successful!\n\nA simulated recovery email has been dispatched. Click the "Outbox Log" button in the simulated header to view it.`);
        window.dispatchEvent(new Event('simulated_email_sent'));
      } else {
        setError(res.error || 'Password recovery failed.');
      }
    }
  };

  return (
    <div id="login_screen" className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <button
          id="login_back_btn"
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
        <h2 className="text-center text-2xl font-display font-extrabold text-slate-900 tracking-tight">
          {restrictRole === 'admin' ? 'TCS PlaySmart Admin Portal' : 
           restrictRole === 'security' ? 'TCS Security Gatekeeper' : 
           'Login to TCS PlaySmart'}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {(!restrictRole || restrictRole === 'employee') ? (
            <>
              Or{' '}
              <button
                id="login_to_register_btn"
                onClick={onNavigateRegister}
                className="font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
              >
                register a new employee account
              </button>
            </>
          ) : (
            <span className="font-mono text-xs text-slate-400 uppercase tracking-widest font-bold">Authorized Staff Login Only</span>
          )}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-2xl border border-slate-200">
          <form className="space-y-6" onSubmit={handleLogin}>
            {!hasAdmin && (
              <div id="no_admin_setup_alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl animate-fade-in">
                <p className="font-bold mb-1 flex items-center gap-1">⚙️ First-Time Admin Setup Needed</p>
                <p className="mb-2 text-slate-600">No administrator has been initialized. Create the initial administrator credentials securely to begin.</p>
                <button
                  type="button"
                  onClick={onOpenAdminSetup}
                  className="text-amber-700 font-bold hover:text-amber-950 underline text-xs cursor-pointer block mt-1"
                >
                  Configure Admin Credentials Now &rarr;
                </button>
              </div>
            )}

            {error && (
              <div id="login_error_alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl flex items-start gap-2 animate-fade-in">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="employee_id_input" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Employee ID
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="employee_id_input"
                  name="employeeId"
                  type="text"
                  required
                  placeholder="e.g. EMP101, SEC202, ADM303"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900 font-mono placeholder-slate-400"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password_input" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="password_input"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900 placeholder-slate-400"
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-400">Simulation bypass enabled</span>
                <button
                  type="button"
                  id="forgot_pwd_btn"
                  onClick={handleForgotPassword}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                id="login_submit_btn"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors cursor-pointer"
              >
                Login to Portal
              </button>
            </div>
          </form>



        </div>
      </div>
    </div>
  );
}
