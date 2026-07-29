/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from './lib/database';
import { User } from './types';
import SimulatedTimeHeader from './components/SimulatedTimeHeader';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import EmployeeDashboard from './components/EmployeeDashboard';
import SecurityDashboard from './components/SecurityDashboard';
import AdminDashboard from './components/AdminDashboard';
import AdminSetupModal from './components/AdminSetupModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<'landing' | 'login' | 'register'>('landing');
  const [isAdminSetupOpen, setIsAdminSetupOpen] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  // Load user session on start
  const refreshUser = () => {
    const user = db.getCurrentUser();
    setCurrentUser(user);
    db.hasAdmin().then(res => setHasAdmin(res)).catch(() => setHasAdmin(false));
    
    if (user) {
      if (user.role === 'admin' && window.location.hash !== '#/admin') {
        window.location.hash = '#/admin';
      } else if (user.role === 'security' && window.location.hash !== '#/security') {
        window.location.hash = '#/security';
      } else if (user.role === 'employee' && !window.location.hash.startsWith('#/employee') && !window.location.hash.startsWith('#/availability')) {
        window.location.hash = '#/employee';
      }
    }
  };

  useEffect(() => {
    refreshUser();

    // Listen to storage events to keep auth state synchronized
    const handleStorageUpdate = () => {
      refreshUser();
    };

    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };

    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleAuthSuccess = () => {
    refreshUser();
  };

  const handleLogout = () => {
    db.logoutUser();
    setCurrentUser(null);
    setScreen('landing');
    window.location.hash = '#/';
  };

  // Render the appropriate panel based on auth and role
  const renderContent = () => {
    if (currentUser) {
      switch (currentUser.role) {
        case 'employee':
          return (
            <EmployeeDashboard 
              user={currentUser} 
              onLogout={handleLogout} 
              onUpdateUser={refreshUser}
            />
          );
        case 'security':
          return (
            <SecurityDashboard 
              user={currentUser} 
              onLogout={handleLogout} 
              onUpdateUser={refreshUser}
            />
          );
        case 'admin':
          return (
            <AdminDashboard 
              user={currentUser} 
              onLogout={handleLogout} 
              onUpdateUser={refreshUser}
            />
          );
        default:
          return (
            <div className="p-8 text-center">
              <p className="text-red-600 font-bold">Error: Unknown User Role "{currentUser.role}"</p>
              <button 
                onClick={handleLogout}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded cursor-pointer"
              >
                Reset Session
              </button>
            </div>
          );
      }
    }

    // Unauthenticated Screens - Hash routing overrides screen state
    if (currentHash === '#/admin') {
      return (
        <LoginPage 
          onSuccess={handleAuthSuccess} 
          onNavigateBack={() => { window.location.hash = '#/'; setScreen('landing'); }} 
          onNavigateRegister={() => { window.location.hash = '#/'; setScreen('register'); }} 
          onOpenAdminSetup={() => setIsAdminSetupOpen(true)}
          restrictRole="admin"
        />
      );
    }

    if (currentHash === '#/security') {
      return (
        <LoginPage 
          onSuccess={handleAuthSuccess} 
          onNavigateBack={() => { window.location.hash = '#/'; setScreen('landing'); }} 
          onNavigateRegister={() => { window.location.hash = '#/'; setScreen('register'); }} 
          onOpenAdminSetup={() => setIsAdminSetupOpen(true)}
          restrictRole="security"
        />
      );
    }

    if (currentHash === '#/employee') {
      return (
        <LoginPage 
          onSuccess={handleAuthSuccess} 
          onNavigateBack={() => { window.location.hash = '#/'; setScreen('landing'); }} 
          onNavigateRegister={() => { window.location.hash = '#/'; setScreen('register'); }} 
          onOpenAdminSetup={() => setIsAdminSetupOpen(true)}
          restrictRole="employee"
        />
      );
    }

    // Standard Landing/Register/Login screens based on state
    switch (screen) {
      case 'login':
        return (
          <LoginPage 
            onSuccess={handleAuthSuccess} 
            onNavigateBack={() => setScreen('landing')} 
            onNavigateRegister={() => setScreen('register')} 
            onOpenAdminSetup={() => setIsAdminSetupOpen(true)}
            restrictRole="employee"
          />
        );
      case 'register':
        return (
          <RegisterPage 
            onSuccess={() => setScreen('login')} 
            onNavigateBack={() => setScreen('landing')} 
            onNavigateLogin={() => setScreen('login')} 
          />
        );
      case 'landing':
      default:
        return (
          <LandingPage 
            onNavigate={(target) => {
              if (target === 'login') {
                window.location.hash = '#/employee';
              } else {
                setScreen(target);
              }
            }} 
            onOpenAdminSetup={() => setIsAdminSetupOpen(true)}
          />
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Global Simulated Time Policy Tracker Header */}
      <SimulatedTimeHeader />
      
      {/* Dynamic Screen Area */}
      <div className="flex-1 flex flex-col">
        {renderContent()}
      </div>

      {/* Admin Setup Modal */}
      <AdminSetupModal 
        isOpen={isAdminSetupOpen} 
        onClose={() => setIsAdminSetupOpen(false)} 
        onSuccess={() => {
          refreshUser();
        }}
      />
    </div>
  );
}
