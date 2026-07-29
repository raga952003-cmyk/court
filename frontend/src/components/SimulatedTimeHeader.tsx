/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../lib/database';

interface SimulatedTimeConfig {
  hour: number;
  minute: number;
}
import { Clock, ShieldAlert, CheckCircle, HelpCircle, Mail, X, Trash2 } from 'lucide-react';

export default function SimulatedTimeHeader() {
  const [simTime, setSimTime] = useState<SimulatedTimeConfig>({ hour: 9, minute: 0 });
  const [isOpenInfo, setIsOpenInfo] = useState(false);
  const [emails, setEmails] = useState<any[]>([]);
  const [showEmailsLog, setShowEmailsLog] = useState(false);
  const [latestEmail, setLatestEmail] = useState<any | null>(null);
  const [showToast, setShowToast] = useState(false);

  const refreshData = async () => {
    try {
      // Get real current time instead of simulated time
      const now = new Date();
      const currentTime = { hour: now.getHours(), minute: now.getMinutes() };
      setSimTime(currentTime);
      await db.setSimulatedTime(currentTime);
      
      const allEmails = await db.getSimulatedEmails();
      setEmails(allEmails);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshData();

    // Update time every minute to show real current time
    const timeInterval = setInterval(async () => {
      const now = new Date();
      const currentTime = { hour: now.getHours(), minute: now.getMinutes() };
      setSimTime(currentTime);
      await db.setSimulatedTime(currentTime);
    }, 60000); // Update every minute

    const handleEmailSent = async () => {
      const allEmails = await db.getSimulatedEmails();
      setEmails(allEmails);
      if (allEmails.length > 0) {
        setLatestEmail(allEmails[allEmails.length - 1]);
        setShowToast(true);
      }
    };

    window.addEventListener('simulated_email_sent', handleEmailSent);

    // Poll server for email changes every 2.5 seconds
    const emailInterval = setInterval(() => {
      db.getSimulatedEmails().then(allEmails => {
        setEmails(allEmails);
      }).catch(console.error);
    }, 2500);

    return () => {
      window.removeEventListener('simulated_email_sent', handleEmailSent);
      clearInterval(timeInterval);
      clearInterval(emailInterval);
    };
  }, []);

  const clearLogs = async () => {
    await db.clearSimulatedEmails();
    setShowToast(false);
  };

  const isSecurityOnly = simTime.hour >= 5 && simTime.hour < 10;
  const isOperatingHours = simTime.hour >= 6 && simTime.hour < 20;

  return (
    <div id="simulated_time_widget" className="relative bg-slate-900 text-slate-100 px-6 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3 shadow-sm border-b border-slate-800 z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400 animate-pulse" />
          <span className="font-mono text-sky-300 font-semibold tracking-wider">
            CURRENT TIME: {db.formatSimulatedTime(simTime)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isSecurityOnly ? (
          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-800 text-amber-300 px-2 py-0.5 rounded">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">Security Only (5 AM - 10 AM)</span>
          </div>
        ) : isOperatingHours ? (
          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">Employee Booking Open</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-rose-950/60 border border-rose-800 text-rose-300 px-2 py-0.5 rounded">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-semibold">Facilities Closed (8 PM - 6 AM)</span>
          </div>
        )}

        {/* Outgoing Mail Simulation Center */}
        <button
          id="email_logs_toggle_btn"
          onClick={() => setShowEmailsLog(!showEmailsLog)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors relative cursor-pointer ${
            emails.length > 0 ? 'bg-blue-900 text-blue-200 border border-blue-700 font-bold' : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
          title="View Simulated Outgoing Emails"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Mail Trigger Logs</span>
          {emails.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[9px] font-bold px-1 rounded-full animate-bounce">
              {emails.length}
            </span>
          )}
        </button>

        <button 
          id="policy_info_toggle"
          onClick={() => setIsOpenInfo(!isOpenInfo)}
          className="text-slate-300 hover:text-white p-0.5"
          title="Show Policy Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {isOpenInfo && (
        <div id="policy_info_drawer" className="w-full bg-slate-800 p-3 mt-2 rounded border border-slate-700 text-slate-300 leading-relaxed text-xs">
          <p className="font-semibold text-white mb-1">PlaySmart TCS Booking Rules & Policy Windows:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-amber-400">Security Booking Window (5:00 AM – 10:00 AM)</strong>: Only security staff can make bookings. Employees must enter both Employee ID and Email ID. All indirect bookings trigger confirmation emails.</li>
            <li><strong className="text-emerald-400">Employee Self Booking (10:00 AM – 8:00 PM)</strong>: Employees can book any remaining slots directly, verifying their details. All direct bookings trigger confirmation emails.</li>
            <li><strong className="text-rose-400">Operating Hour Lockouts</strong>: Security bookings are frozen outside 5:00 AM – 10:00 AM, and employee bookings are frozen outside 10:00 AM – 8:00 PM.</li>
            <li><strong className="text-sky-400">Real-Time Clock</strong>: The system now uses your actual current time for booking windows and validation.</li>
          </ul>
        </div>
      )}

      {/* Outgoing Email Logs Modal Overlay */}
      {showEmailsLog && (
        <div id="simulated_emails_logs_modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-end z-[100] animate-fade-in">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-white">
                <Mail className="w-5 h-5 text-blue-400" />
                <h3 className="font-display font-extrabold text-sm tracking-wide">PlaySmart Email Dispatcher (Simulated)</h3>
              </div>
              <div className="flex items-center gap-2">
                {emails.length > 0 && (
                  <button
                    onClick={clearLogs}
                    className="p-1 text-rose-400 hover:bg-slate-800 rounded text-xs flex items-center gap-1 font-semibold cursor-pointer"
                    title="Clear Mail Log"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear All
                  </button>
                )}
                <button
                  onClick={() => setShowEmailsLog(false)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40">
              {emails.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                  <Mail className="w-12 h-12 mx-auto text-slate-700 mb-3" />
                  <p className="font-semibold text-slate-400">No Emails Triggered Yet</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Confirm a booking either via the Employee Desk or the Security Desk to watch confirmation emails trigger in real-time.
                  </p>
                </div>
              ) : (
                [...emails].reverse().map((email) => (
                  <div key={email.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-col gap-1 text-[11px]">
                      <div className="flex justify-between items-center text-slate-400">
                        <span><strong>To:</strong> <span className="text-blue-300 font-mono">{email.to}</span></span>
                        <span className="font-mono text-slate-500 text-[10px]">
                          {new Date(email.sentAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-white font-bold mt-1">
                        <strong>Subject:</strong> {email.subject}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-950/20 font-mono text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                      {email.body}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950 text-center text-[10px] text-slate-500 font-mono">
              Simulated SMTP Protocol Service // Active and Listening
            </div>
          </div>
        </div>
      )}

      {/* Floating sliding email Toast alert */}
      {showToast && latestEmail && (
        <div id="simulated_email_toast" className="fixed bottom-4 right-4 max-w-sm w-full bg-slate-900 border border-blue-500 text-white rounded-2xl shadow-2xl p-4 flex gap-3 z-[110] animate-slide-in">
          <div className="bg-blue-900/50 text-blue-400 p-2 rounded-xl h-fit self-start border border-blue-800">
            <Mail className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Email Triggered! ✉️</span>
              <button 
                onClick={() => setShowToast(false)}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h4 className="text-xs font-bold truncate mt-1 text-slate-100">{latestEmail.subject}</h4>
            <p className="text-[11px] text-slate-400 mt-1">Sent successfully to <span className="text-blue-300 font-semibold">{latestEmail.to}</span>.</p>
            <button
              onClick={() => {
                setShowToast(false);
                setShowEmailsLog(true);
              }}
              className="mt-2.5 text-[11px] text-blue-400 hover:text-blue-300 font-bold underline text-left block"
            >
              Open Outbox Logs & Read Full Body
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
