/**
 * Raise concern / complaint ticket — employees and admins only.
 */

import React, { useEffect, useState } from 'react';
import { db } from '../lib/database';
import { Facility, TicketCategory, User } from '../types';
import { showAppToast } from './ui/AppToast';

interface RaiseConcernFormProps {
  user: User;
  onCreated?: () => void;
}

const CATEGORY_HELP: Record<TicketCategory, string> = {
  general: 'Routes to Admin. Use for policy, process, or general campus concerns.',
  court: 'Routes to Security. Use for court condition, equipment, or facility access issues.',
  application: 'Routes to IT. Use for login, booking app bugs, or digital PlayPass issues.'
};

export default function RaiseConcernForm({ user, onCreated }: RaiseConcernFormProps) {
  const [category, setCategory] = useState<TicketCategory>('general');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loc = (user.businessUnit || 'Chennai, India').trim();
    db.getFacilities(loc).then(setFacilities).catch(() => setFacilities([]));
  }, [user.businessUnit]);

  if (user.role !== 'employee' && user.role !== 'admin') {
    return (
      <p className="text-sm text-slate-500">
        Only employees and admins can raise concern tickets.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const fac = facilities.find(f => f.facilityId === facilityId);
    const res = await db.createSupportTicket({
      reporterEmployeeId: user.employeeId,
      reporterName: user.name,
      reporterRole: user.role === 'admin' ? 'admin' : 'employee',
      category,
      subject,
      details,
      facilityId: category === 'court' ? facilityId || undefined : undefined,
      courtName: category === 'court' ? fac?.courtName : undefined,
      sport: category === 'court' ? fac?.sport : undefined
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Failed to submit concern.');
      return;
    }
    showAppToast(
      `Ticket ${res.ticket?.ticketId} filed. Routed to ${res.ticket?.assignedQueue}. Teams have 10 minutes to act before escalation.`,
      'success'
    );
    setSubject('');
    setDetails('');
    setFacilityId('');
    setCategory('general');
    onCreated?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="concern_category" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
          What is the concern about?
        </label>
        <select
          id="concern_category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory)}
          className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="general">General / process (→ Admin)</option>
          <option value="court">Court / facility issue (→ Security)</option>
          <option value="application">Application / digital issue (→ IT)</option>
        </select>
        <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">{CATEGORY_HELP[category]}</p>
      </div>

      {category === 'court' && (
        <div>
          <label htmlFor="concern_facility" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Related court (optional)
          </label>
          <select
            id="concern_facility"
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Not specific —</option>
            {facilities.map(f => (
              <option key={f.facilityId} value={f.facilityId}>
                {f.sport} · {f.courtName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="concern_subject" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
          Concern summary
        </label>
        <input
          id="concern_subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short title of the issue"
          required
          className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="concern_details" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
          Details
        </label>
        <textarea
          id="concern_details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          required
          placeholder="Describe what happened, when, and any impact on booking or play."
          className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </div>

      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
        Open tickets escalate automatically after <strong>10 minutes</strong> if not acknowledged.
        Admins can also move tickets between Admin, Security, and IT manually.
      </p>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-[#003366] hover:bg-[#002244] disabled:bg-slate-400 text-white text-sm font-bold rounded-xl cursor-pointer transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit concern ticket'}
      </button>
    </form>
  );
}
