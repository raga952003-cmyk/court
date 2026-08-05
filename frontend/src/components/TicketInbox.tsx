/**
 * Shared ticket inbox for Admin / Security / IT queues (and employee "my tickets").
 */

import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/database';
import { SupportTicket, TicketQueue, TicketStatus, User } from '../types';
import { showAppToast } from './ui/AppToast';

interface TicketInboxProps {
  user: User;
  /** If set, only this queue. If omit + showMine, reporter's tickets. */
  queue?: TicketQueue;
  showMine?: boolean;
  /** Admin can manually reassign queues */
  allowManualMove?: boolean;
  title?: string;
}

export default function TicketInbox({
  user,
  queue,
  showMine,
  allowManualMove,
  title = 'Concern tickets'
}: TicketInboxProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const list = await db.getSupportTickets(
      showMine
        ? { reporterEmployeeId: user.employeeId }
        : queue
          ? { queue }
          : undefined
    );
    setTickets(list);
  }, [user.employeeId, queue, showMine]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('support_tickets_change', onChange);
    const interval = window.setInterval(() => {
      db.processTicketEscalations().then(() => load());
    }, 30000);
    return () => {
      window.removeEventListener('support_tickets_change', onChange);
      window.clearInterval(interval);
    };
  }, [load]);

  const update = async (
    ticketId: string,
    patch: { status?: TicketStatus; assignedQueue?: TicketQueue; resolutionNotes?: string }
  ) => {
    const res = await db.updateSupportTicket(ticketId, {
      ...patch,
      actorEmployeeId: user.employeeId,
      assignedToEmployeeId: user.employeeId
    });
    if (res.success) {
      showAppToast('Ticket updated.', 'success');
      load();
    } else {
      showAppToast(res.error || 'Update failed.', 'error');
    }
  };

  const statusStyle = (s: TicketStatus) => {
    if (s === 'escalated') return 'bg-rose-100 text-rose-800';
    if (s === 'resolved' || s === 'closed') return 'bg-emerald-100 text-emerald-800';
    if (s === 'acknowledged' || s === 'in_progress') return 'bg-blue-100 text-blue-800';
    return 'bg-amber-100 text-amber-800';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-slate-900 text-lg">{title}</h3>
        <button
          type="button"
          onClick={() => load()}
          className="text-xs font-bold text-[#003366] hover:underline cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
          No tickets in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => {
            const escalateMs = new Date(t.escalateAt).getTime() - Date.now();
            const slaLabel =
              t.status === 'open' && escalateMs > 0
                ? `SLA ${Math.ceil(escalateMs / 60000)}m`
                : t.escalatedAt
                  ? 'Escalated'
                  : null;
            return (
              <div
                key={t.ticketId}
                className={`border rounded-2xl p-4 bg-white ${
                  t.status === 'escalated' ? 'border-rose-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {t.ticketId} · {t.category} · queue:{t.assignedQueue}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {slaLabel && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {slaLabel}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusStyle(t.status)}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {t.priority}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-2 leading-relaxed whitespace-pre-wrap">{t.details}</p>
                <p className="text-[11px] text-slate-400 mt-2">
                  From {t.reporterName} ({t.reporterEmployeeId})
                  {t.courtName ? ` · ${t.sport} ${t.courtName}` : ''}
                  {' · '}
                  {new Date(t.createdAt).toLocaleString()}
                </p>

                {!showMine && (
                  <div className="mt-3 flex flex-wrap gap-2 items-end">
                    {(t.status === 'open' || t.status === 'escalated') && (
                      <button
                        type="button"
                        onClick={() => update(t.ticketId, { status: 'acknowledged' })}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-600 text-white cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    )}
                    {(t.status === 'acknowledged' || t.status === 'escalated' || t.status === 'open') && (
                      <button
                        type="button"
                        onClick={() => update(t.ticketId, { status: 'in_progress' })}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-800 text-white cursor-pointer"
                      >
                        In progress
                      </button>
                    )}
                    {t.status !== 'resolved' && t.status !== 'closed' && (
                      <div className="flex gap-1.5 items-center grow min-w-[200px]">
                        <input
                          value={notes[t.ticketId] || ''}
                          onChange={(e) => setNotes(n => ({ ...n, [t.ticketId]: e.target.value }))}
                          placeholder="Resolution notes"
                          className="flex-1 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            update(t.ticketId, {
                              status: 'resolved',
                              resolutionNotes: notes[t.ticketId] || 'Resolved'
                            })
                          }
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-600 text-white cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                    {allowManualMove && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const q = e.target.value as TicketQueue;
                          if (!q) return;
                          update(t.ticketId, { assignedQueue: q });
                          e.target.value = '';
                        }}
                        className="px-2 py-1.5 text-[11px] border border-slate-300 rounded-lg font-semibold cursor-pointer"
                        aria-label="Move ticket queue"
                      >
                        <option value="">Move queue…</option>
                        <option value="admin">→ Admin</option>
                        <option value="security">→ Security</option>
                        <option value="it">→ IT</option>
                      </select>
                    )}
                  </div>
                )}

                {t.resolutionNotes && (
                  <p className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5">
                    Resolution: {t.resolutionNotes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
