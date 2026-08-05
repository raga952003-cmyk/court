/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/database';
import { Notification } from '../types';
import { Bell, Check, Info, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

interface NotificationBellProps {
  employeeId: string;
  /** Use on dark nav bars (Admin/Security/IT/Employee headers). */
  variant?: 'default' | 'onDark';
}

export default function NotificationBell({ employeeId, variant = 'default' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const notifs = await db.getNotifications(employeeId);
      setNotifications(notifs);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
    }
  };

  useEffect(() => {
    fetchNotifs();

    const handleStorageUpdate = () => {
      fetchNotifs();
    };

    window.addEventListener('storage', handleStorageUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [employeeId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await db.markNotificationRead(id);
      fetchNotifs();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await db.markAllNotificationsRead(employeeId);
      fetchNotifs();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'error':
        return <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="notification_bell_btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          variant === 'onDark'
            ? 'relative p-2 text-blue-100 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer'
            : 'relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer'
        }
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            id="notif_badge"
            className="absolute top-1 right-1 bg-rose-500 text-white font-semibold text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center border border-white"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification_dropdown"
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden"
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-sm text-slate-800">Campus Alerts</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold text-[#003366] hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No notifications yet. Create a booking to test updates.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 text-xs transition-colors flex gap-2.5 items-start ${
                    n.read ? 'bg-white' : 'bg-blue-50/40'
                  }`}
                >
                  {getIcon(n.type)}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-slate-800 ${!n.read ? 'text-blue-950 font-bold' : ''}`}>
                      {n.title}
                    </p>
                    <p className="text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkRead(n.id, e)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 cursor-pointer"
                      title="Mark read"
                      aria-label="Mark notification as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
