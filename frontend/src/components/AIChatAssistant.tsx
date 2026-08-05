import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/database';
import { apiFetch } from '../lib/api';
import { User, SportType } from '../types';
import { normalizeLocation } from '../data/tcsLocations';
import { Send, X, Bot, User as UserIcon, Loader2 } from 'lucide-react';

interface AIChatAssistantProps {
  user: User;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

const GROQ_MODEL = "llama-3.3-70b-versatile";

function sportsLabelFrom(list: string[]): string {
  return list.length > 0 ? list.join(', ') : 'none configured yet at this campus';
}

export default function AIChatAssistant({ user }: AIChatAssistantProps) {
  const userLocation = normalizeLocation(user.businessUnit) || 'Chennai, India';
  const [isOpen, setIsOpen] = useState(false);
  const [locationSports, setLocationSports] = useState<SportType[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello ${user.name}! I'm your TCS PlaySmart AI Assistant for ${userLocation}.\n\nI can help you with:\n• Checking available slots for sports at your campus\n• Booking or cancelling reservations\n• Viewing your bookings\n• Getting facility status updates${user.role === 'admin' ? '\n• Managing facilities and viewing analytics' : ''}`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'blue' | 'dark' | 'green' | 'purple'>('blue');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshLocationSports = async () => {
    try {
      const sports = await db.getLocationSports(userLocation);
      setLocationSports(sports);
      return sports;
    } catch {
      setLocationSports([]);
      return [] as SportType[];
    }
  };

  useEffect(() => {
    const handleStorageUpdate = () => {
      const storedTheme = localStorage.getItem('playsmart_theme') || 'blue';
      setTheme(storedTheme as any);
    };
    handleStorageUpdate();
    refreshLocationSports();
    window.addEventListener('storage', handleStorageUpdate);
    window.addEventListener('location_sports_change', refreshLocationSports);
    window.addEventListener('facilities_change', refreshLocationSports);
    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      window.removeEventListener('location_sports_change', refreshLocationSports);
      window.removeEventListener('facilities_change', refreshLocationSports);
    };
  }, [userLocation]);

  useEffect(() => {
    if (isOpen) {
      refreshLocationSports();
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const matchLocationSport = (sport: string | undefined, sports: string[]): string | null => {
    if (!sport) return null;
    const hit = sports.find(s => s.toLowerCase() === String(sport).trim().toLowerCase());
    return hit || null;
  };

  const executeTool = async (name: string, args: any) => {
    const sports = locationSports.length > 0 ? locationSports : await db.getLocationSports(userLocation);
    const sportsLabel = sportsLabelFrom(sports);
    try {
      switch (name) {
        case 'get_available_slots': {
          const { sport } = args;
          const canonical = matchLocationSport(sport, sports);
          if (!canonical) {
            return `ERROR: "${sport || ''}" is not offered at ${userLocation}. Sports at this campus: ${sportsLabel}.`;
          }
          const facs = await db.getFacilities(userLocation);
          const books = await db.getBookings();
          const slots = await db.getSlotTimes(userLocation);
          const simTime = await db.getSimulatedTime();

          const sportFacs = facs.filter(f => f.sport.toLowerCase() === canonical.toLowerCase());
          if (sportFacs.length === 0) {
            return `No courts found for "${canonical}" at ${userLocation} yet. Sports at this campus: ${sportsLabel}. Ask your location admin to add courts.`;
          }

          let report = `Available slots for ${canonical} at ${userLocation} (Current Time: ${db.formatSimulatedTime(simTime)}):\n\n`;
          for (const f of sportFacs) {
            report += `📍 Court: "${f.courtName}" (ID: ${f.facilityId})\n`;
            report += `   Status: ${f.status === 'active' ? '✅ Active' : '🔧 Under Maintenance'}\n`;
            
            if (f.status === 'maintenance') {
              report += `   ⚠️ No slots available - facility is offline\n\n`;
              continue;
            }
            
            const cap = await db.getFacilityCapacity(f);
            let hasAvailableSlots = false;
            
            for (const s of slots) {
              const slotBooks = books.filter(b => 
                b.facilityId === f.facilityId && 
                b.slotTime === s && 
                b.status !== 'cancelled' && 
                b.status !== 'no_show'
              );
              const freeSpots = cap - slotBooks.length;
              if (freeSpots > 0) {
                hasAvailableSlots = true;
                const percentage = Math.round((freeSpots / cap) * 100);
                let indicator = '🟢';
                if (percentage <= 25) indicator = '🔴';
                else if (percentage <= 50) indicator = '🟡';
                
                report += `   ${indicator} ${s}: ${freeSpots}/${cap} spots available\n`;
              }
            }
            
            if (!hasAvailableSlots) {
              report += `   ❌ All slots are fully booked\n`;
            }
            report += '\n';
          }
          return report;
        }

        case 'create_booking': {
          let { facilityId, slotTime, employeeId, email, sport, courtName } = args;

          // Normalize slot time format
          slotTime = slotTime.trim();
          const canonicalSport = matchLocationSport(sport, sports);
          if (sport && !canonicalSport) {
            return `ERROR: "${sport}" is not offered at ${userLocation}. Available sports: ${sportsLabel}.`;
          }

          // Robust facility resolution (this location only)
          const facs = await db.getFacilities(userLocation);
          let targetFac = facs.find(f => f.facilityId === facilityId);

          if (!targetFac && facilityId) {
            // Check if they passed court name as the facilityId
            targetFac = facs.find(f => 
              f.courtName.toLowerCase() === facilityId.toLowerCase() ||
              f.courtName.toLowerCase().includes(facilityId.toLowerCase())
            );
          }

          if (!targetFac && canonicalSport) {
            // Match by sport and/or courtName
            const sportFacs = facs.filter(f => f.sport.toLowerCase() === canonicalSport.toLowerCase());
            if (courtName) {
              // Try exact match first
              targetFac = sportFacs.find(f => 
                f.courtName.toLowerCase() === courtName.toLowerCase()
              );
              // Try partial match
              if (!targetFac) {
                targetFac = sportFacs.find(f => 
                  f.courtName.toLowerCase().includes(courtName.toLowerCase()) ||
                  courtName.toLowerCase().includes(f.courtName.toLowerCase())
                );
              }
            }
            if (!targetFac && sportFacs.length > 0) {
              // Use first available court for this sport
              targetFac = sportFacs[0];
            }
          }

          if (!targetFac) {
            return `ERROR: Could not find the requested court at ${userLocation}. Available sports: ${sportsLabel}. Please specify the sport and court name.`;
          }

          // Check if facility is under maintenance
          if (targetFac.status === 'maintenance') {
            return `ERROR: ${targetFac.courtName} (${targetFac.sport}) is currently under maintenance and unavailable for booking.`;
          }

          // Validate slot time format
          const slots = await db.getSlotTimes(userLocation);
          const validSlot = slots.find(s => 
            s.toLowerCase() === slotTime.toLowerCase() || 
            s.toLowerCase().includes(slotTime.toLowerCase())
          );
          
          if (!validSlot) {
            return `ERROR: Invalid time slot "${slotTime}". Available slots: ${slots.join(', ')}`;
          }

          // Check if slot is available
          const books = await db.getBookings();
          const cap = await db.getFacilityCapacity(targetFac);
          const slotBooks = books.filter(b => 
            b.facilityId === targetFac.facilityId && 
            b.slotTime === validSlot && 
            b.status !== 'cancelled' && 
            b.status !== 'no_show'
          );
          
          if (slotBooks.length >= cap) {
            return `ERROR: ${targetFac.courtName} is fully booked for ${validSlot}. Current bookings: ${slotBooks.length}/${cap}. Try another time slot or court.`;
          }

          const res = await db.createBooking({
            employeeId: employeeId || user.employeeId,
            email: email || user.email,
            facilityId: targetFac.facilityId,
            slotTime: validSlot,
            bookingSource: 'online'
          });
          
          if (res.success) {
            window.dispatchEvent(new Event('slot_times_change'));
            const remaining = cap - slotBooks.length - 1;
            return `✅ SUCCESS: Booking confirmed!\n\n📍 Court: ${targetFac.courtName} (${targetFac.sport})\n⏰ Time: ${validSlot}\n🎫 Booking ID: ${res.booking?.bookingId}\n👥 Remaining spots: ${remaining}/${cap}\n\nYou will receive a confirmation notification.`;
          } else {
            return `ERROR: Booking failed - ${res.error}`;
          }
        }

        case 'cancel_booking': {
          const { bookingId } = args;
          const res = await db.cancelBooking(bookingId);
          if (res.success) {
            window.dispatchEvent(new Event('slot_times_change'));
            return `SUCCESS: Booking ID ${bookingId} has been successfully cancelled.`;
          } else {
            return `ERROR: Failed to cancel: ${res.error}`;
          }
        }

        case 'get_user_bookings': {
          const { employeeId } = args;
          const targetId = employeeId || user.employeeId;
          const books = await db.getBookings();
          const userBooks = books.filter(b => b.employeeId.toUpperCase() === targetId.toUpperCase());
          
          if (userBooks.length === 0) {
            return `No bookings found for Employee ID: ${targetId}`;
          }
          
          const active = userBooks.filter(b => b.status === 'confirmed');
          const past = userBooks.filter(b => b.status !== 'confirmed');
          
          let report = `📋 Bookings for ${targetId}:\n\n`;
          
          if (active.length > 0) {
            report += `✅ Active Bookings (${active.length}):\n`;
            active.forEach((b, i) => {
              report += `${i + 1}. ${b.sport} - ${b.courtName}\n`;
              report += `   Slot: ${b.slotTime}\n`;
              report += `   Booking ID: ${b.bookingId}\n`;
              report += `   Status: ${b.status}\n\n`;
            });
          }
          
          if (past.length > 0) {
            report += `📝 Past/Cancelled Bookings (${past.length}):\n`;
            past.slice(0, 5).forEach((b, i) => {
              report += `${i + 1}. ${b.sport} - ${b.courtName} (${b.slotTime}) - Status: ${b.status}\n`;
            });
          }
          
          return report;
        }

        case 'get_facility_status': {
          const facs = await db.getFacilities(userLocation);
          const books = await db.getBookings();
          const capacities = await db.getSportCapacities(userLocation);
          
          let report = `Facilities at ${userLocation}\nSports at this campus: ${sportsLabel}\n\n`;
          
          const sportGroups: Record<string, typeof facs> = {};
          facs.forEach(f => {
            if (!sportGroups[f.sport]) sportGroups[f.sport] = [];
            sportGroups[f.sport].push(f);
          });

          const orderedSports = [
            ...sports.filter(s => sportGroups[s]?.length),
            ...Object.keys(sportGroups).filter(s => !sports.some(x => x.toLowerCase() === s.toLowerCase()))
          ];
          
          if (orderedSports.length === 0) {
            return `No courts configured yet at ${userLocation}. Sports list: ${sportsLabel}. Ask the location admin to add courts under Facilities & Maintenance.`;
          }

          for (const sport of orderedSports) {
            report += `${sport} (default ${capacities[sport] || 4} players/slot):\n`;
            for (const f of sportGroups[sport]) {
              const courtCap = await db.getFacilityCapacity(f);
              const activeBooks = books.filter(b => 
                b.facilityId === f.facilityId && 
                b.status === 'confirmed'
              ).length;
              const statusIcon = f.status === 'active' ? '✅' : '🔧';
              report += `  ${statusIcon} ${f.courtName} — max ${courtCap}/slot — ${activeBooks} active bookings\n`;
            }
            report += '\n';
          }
          
          return report;
        }

        case 'toggle_court_maintenance': {
          if (user.role !== 'admin') {
            return "ERROR: Access Denied. Only Administrators can toggle maintenance.";
          }
          const { facilityId } = args;
          await db.toggleFacilityMaintenance(facilityId, userLocation);
          window.dispatchEvent(new Event('storage'));
          return `SUCCESS: Court ID ${facilityId} maintenance toggled successfully.`;
        }

        case 'update_sport_capacity': {
          if (user.role !== 'admin') {
            return "ERROR: Access Denied. Only Administrators can change capacities.";
          }
          const { sport, capacity } = args;
          const canonical = matchLocationSport(sport, sports);
          if (!canonical) {
            return `ERROR: "${sport || ''}" is not in ${userLocation}'s sport list. Available sports: ${sportsLabel}.`;
          }
          const caps = await db.getSportCapacities(userLocation);
          const newCaps = { ...caps, [canonical]: capacity };
          await db.saveSportCapacities(newCaps, userLocation);
          return `SUCCESS: Updated ${canonical} capacity to ${capacity} players/slot at ${userLocation}.`;
        }

        default:
          return `ERROR: Unknown tool function "${name}".`;
      }
    } catch (e: any) {
      return `ERROR: Tool execution failed: ${e.message}`;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    const newMsg: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const sports =
        locationSports.length > 0 ? locationSports : await refreshLocationSports();
      const sportsLabel = sportsLabelFrom(sports);
      const systemPrompt: Message = {
        role: 'system',
        content: `You are the TCS PlaySmart AI Assistant helping user: ${user.name} (Role: ${user.role}, ID: ${user.employeeId}, Email: ${user.email}, Location: ${userLocation}).

CAMPUS SPORTS (use ONLY these — do not invent sports from other campuses):
${sportsLabel}

AVAILABLE TOOLS:
1. get_available_slots(sport) - Check slot availability for a sport at this campus only
2. get_user_bookings(employeeId) - View all bookings for a user (current and past)
3. get_facility_status() - Get facility status for this campus
4. create_booking(facilityId, slotTime, employeeId, email, sport, courtName) - Book a slot at this campus
5. cancel_booking(bookingId) - Cancel an existing booking
6. toggle_court_maintenance(facilityId) - Admin only: Toggle facility maintenance status
7. update_sport_capacity(sport, capacity) - Admin only: Change player capacity per slot for a campus sport

BOOKING INSTRUCTIONS:
- Only use sports from the CAMPUS SPORTS list above
- When user asks for a sport not in that list, tell them the available campus sports
- When user says "book <Sport> Court 1 from 6-7 PM", extract sport, courtName, slotTime from that request
- Always use create_booking with sport and courtName parameters for natural language requests
- The system will auto-resolve the facility ID from sport + court name at ${userLocation}
- Valid slot format: "6-7 PM", "8-9 AM", "11-12 PM", etc.
- Always confirm booking success with the booking ID

RESPONSE GUIDELINES:
- Use tools proactively to fetch real-time data from the database
- For "my bookings" queries, call get_user_bookings automatically
- For "which courts are free", call get_available_slots for that campus sport
- Show booking IDs so users can reference them
- Be conversational, helpful, and concise
- Refuse admin-only operations if user role is not 'admin'`
      };

      let currentHistory: Message[] = [systemPrompt, ...messages.slice(-8), newMsg];
      let apiResult = await callGroqAPI(currentHistory, sports);
      let newTurnMessages: Message[] = [];

      // Handle Tool Calls (up to 3 sequential loops to prevent infinite runs)
      for (let loop = 0; loop < 3; loop++) {
        if (apiResult.choices?.[0]?.message?.tool_calls) {
          const toolCalls = apiResult.choices[0].message.tool_calls;
          
          const assistantToolCallMsg: Message = {
            role: 'assistant',
            content: apiResult.choices[0].message.content || '',
            ...apiResult.choices[0].message
          };
          currentHistory.push(assistantToolCallMsg);
          newTurnMessages.push(assistantToolCallMsg);

          // Run tool calls
          for (const call of toolCalls) {
            const funcName = call.function.name;
            const funcArgs = JSON.parse(call.function.arguments || '{}');
            const toolOutput = await executeTool(funcName, funcArgs);

            const toolOutputMsg: Message = {
              role: 'tool',
              tool_call_id: call.id,
              name: funcName,
              content: toolOutput
            };
            currentHistory.push(toolOutputMsg);
            newTurnMessages.push(toolOutputMsg);
          }

          // Call Groq again with tool results
          apiResult = await callGroqAPI(currentHistory, sports);
        } else {
          break;
        }
      }

      const responseContent = apiResult.choices?.[0]?.message?.content || "I couldn't process that request. Can you try again?";
      const finalAssistantMsg: Message = { role: 'assistant', content: responseContent };
      setMessages(prev => [...prev, ...newTurnMessages, finalAssistantMsg]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error communicating with Groq API: ${err.message || 'Please check your connection.'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const callGroqAPI = async (chatMessages: Message[], sports: string[]) => {
    const sportsLabel = sportsLabelFrom(sports);
    const formattedMessages = chatMessages.map(m => {
      const formatted: any = { role: m.role, content: m.content };
      if (m.name) formatted.name = m.name;
      if (m.tool_call_id) formatted.tool_call_id = m.tool_call_id;
      if ((m as any).tool_calls) formatted.tool_calls = (m as any).tool_calls;
      return formatted;
    });

    const sportDescription =
      sports.length > 0
        ? `Sport category at this campus only. One of: ${sportsLabel}`
        : `Sport category at ${userLocation}. No sports configured yet — tell the user to ask their location admin.`;

    const tools = [
          {
            type: 'function',
            function: {
              name: 'get_available_slots',
              description: `Get real-time free slots and court statuses for a sport at ${userLocation}.`,
              parameters: {
                type: 'object',
                properties: {
                  sport: { type: 'string', description: sportDescription }
                },
                required: ['sport']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_user_bookings',
              description: 'Retrieve all bookings (active and past) for a specific employee. Shows booking IDs, status, and slot details.',
              parameters: {
                type: 'object',
                properties: {
                  employeeId: { type: 'string', description: 'Employee ID to check bookings for (optional, defaults to current user)' }
                }
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_facility_status',
              description: `Get overview of facilities at ${userLocation}, including sports list, maintenance, capacities, and active bookings.`,
              parameters: {
                type: 'object',
                properties: {}
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'create_booking',
              description: `Book a court at ${userLocation}. Use sport + courtName OR exact facilityId. Sport must be one of the campus sports.`,
              parameters: {
                type: 'object',
                properties: {
                  facilityId: { type: 'string', description: 'Exact facility ID (optional if sport+courtName provided)' },
                  sport: { type: 'string', description: sportDescription },
                  courtName: { type: 'string', description: 'Court name like "Court 1", "Court 2", "Board 1", etc. (optional, defaults to first available)' },
                  slotTime: { type: 'string', description: 'Time slot like "6-7 PM", "8-9 AM", "11-12 PM"' },
                  employeeId: { type: 'string', description: 'Employee ID (defaults to current user)' },
                  email: { type: 'string', description: 'Email address (defaults to current user)' }
                },
                required: ['slotTime']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'cancel_booking',
              description: 'Cancel a reservation using booking ID.',
              parameters: {
                type: 'object',
                properties: {
                  bookingId: { type: 'string', description: 'Unique booking ID to cancel' }
                },
                required: ['bookingId']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'toggle_court_maintenance',
              description: 'Toggle facility maintenance status (active/offline). Admin only.',
              parameters: {
                type: 'object',
                properties: {
                  facilityId: { type: 'string', description: 'Facility ID to toggle' }
                },
                required: ['facilityId']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'update_sport_capacity',
              description: `Modify player capacity per slot for a sport at ${userLocation}. Admin only.`,
              parameters: {
                type: 'object',
                properties: {
                  sport: { type: 'string', description: sportDescription },
                  capacity: { type: 'integer', description: 'New capacity (players per slot)' }
                },
                required: ['sport', 'capacity']
              }
            }
          }
    ];

    const response = await apiFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: formattedMessages,
        temperature: 0.1,
        tools
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`AI proxy error (${response.status}): ${errBody}`);
    }

    return response.json();
  };

  const getThemeColor = () => {
    if (theme === 'dark') return 'bg-slate-900 border-slate-800 text-slate-100';
    if (theme === 'green') return 'bg-emerald-900 border-emerald-800 text-emerald-50';
    if (theme === 'purple') return 'bg-purple-900 border-purple-800 text-purple-50';
    return 'bg-[#003366] border-blue-900 text-white';
  };

  const getBtnColor = () => {
    if (theme === 'dark') return 'bg-slate-800 hover:bg-slate-700 text-white';
    if (theme === 'green') return 'bg-emerald-600 hover:bg-emerald-700 text-white';
    if (theme === 'purple') return 'bg-purple-600 hover:bg-purple-700 text-white';
    return 'bg-[#003366] hover:bg-[#002244] text-white';
  };

  return (
    <div className="fixed bottom-6 right-4 sm:right-6 z-[9999] font-display">
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer text-white ${
            theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-900/40' :
            theme === 'green' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' :
            theme === 'purple' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/30' :
            'bg-[#003366] hover:bg-blue-950 shadow-blue-900/30'
          }`}
        >
          <Bot className="w-5 h-5 animate-pulse" />
          <span className="text-xs font-bold tracking-wider">PlaySmart AI</span>
          <span className="w-2 h-2 rounded-full bg-emerald-450 animate-ping"></span>
        </button>
      )}

      {/* Slide-out Chat Window — full-screen sheet on small phones */}
      {isOpen && (
        <div className={`fixed inset-3 sm:static sm:inset-auto w-auto sm:w-[400px] h-[calc(100dvh-1.5rem)] sm:h-[min(520px,70vh)] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          {/* Header */}
          <div className={`p-4 flex items-center justify-between shadow-sm ${getThemeColor()}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-bold text-sm leading-tight text-white">PlaySmart Assistant</h4>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-450"></span>
                  <span className="text-[10px] text-white/70 font-medium">Llama 3.1 via Groq API</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className={`flex-1 p-4 overflow-y-auto space-y-4 ${
            theme === 'dark' ? 'bg-slate-900/30' : 'bg-slate-50/50'
          }`}>
            {messages.filter(m => m.role !== 'system' && m.role !== 'tool').map((msg, index) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div key={index} className={`flex items-start gap-2.5 ${!isAssistant ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isAssistant ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800'
                  }`}>
                    {isAssistant ? <Bot className="w-4 h-4 text-[#003366]" /> : <UserIcon className="w-4 h-4 text-slate-650" />}
                  </div>

                  <div className={`max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-line shadow-sm border ${
                    isAssistant ? 
                      (theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-white border-slate-100 text-slate-800') : 
                      (theme === 'dark' ? 'bg-[#003366]/40 border-blue-900/50 text-white' : 'bg-blue-50 border-blue-100 text-slate-900')
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-[#003366] flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className={`p-3 rounded-2xl text-xs shadow-sm border flex items-center gap-2 ${
                  theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-400' : 'bg-white border-slate-100 text-slate-400'
                }`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#003366]" />
                  <span>Analyzing booking schedule...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-slate-100 flex gap-2 items-center bg-white dark:bg-slate-950">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                locationSports[0]
                  ? `Ask for ${locationSports[0]} slots, create a booking...`
                  : 'Ask about slots or bookings at your campus...'
              }
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isLoading || !input.trim() ? 'bg-slate-100 text-slate-400' : getBtnColor()
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
