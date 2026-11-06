import React, { useState, useEffect } from 'react';
import {
  Voicemail,
  Greeting,
  MachineSettings,
  CallScenario,
} from './types';
import {
  getVoicemails,
  getGreetings,
  getSettings,
  saveSettings,
  saveVoicemail,
  updateVoicemail,
  deleteVoicemail,
  saveGreeting,
  deleteGreeting,
  initializeSeedData,
  DEFAULT_SETTINGS,
} from './services/storage';
import { TapeDeck } from './components/TapeDeck';
import { VoicemailInbox } from './components/VoicemailInbox';
import { GreetingsStudio } from './components/GreetingsStudio';
import { CallScreeningModal, CALL_SCENARIOS } from './components/CallScreeningModal';
import { CallSimulatorPanel } from './components/CallSimulatorPanel';
import { OfflineStorageManager } from './components/OfflineStorageManager';
import {
  Radio,
  Inbox,
  Mic,
  PhoneCall,
  HardDrive,
  ShieldCheck,
  Disc,
  Headphones,
  Sparkles,
} from 'lucide-react';

export default function App() {
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [greetings, setGreetings] = useState<Greeting[]>([]);
  const [settings, setSettings] = useState<MachineSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'console' | 'inbox' | 'greetings' | 'simulator' | 'storage'>('console');
  const [isLoading, setIsLoading] = useState(true);

  // Call Screening Modal state
  const [isScreeningModalOpen, setIsScreeningModalOpen] = useState(false);
  const [activeCallScenario, setActiveCallScenario] = useState<CallScenario | null>(null);

  // Selected voicemail on TapeDeck
  const [selectedVoicemailId, setSelectedVoicemailId] = useState<string | null>(null);

  // Initial Load from IndexedDB
  useEffect(() => {
    async function loadData() {
      try {
        await initializeSeedData();
        const vms = await getVoicemails();
        const grs = await getGreetings();
        const cfg = await getSettings();

        setVoicemails(vms);
        setGreetings(grs);
        setSettings(cfg);
        if (vms.length > 0) {
          setSelectedVoicemailId(vms[0].id);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const refreshVoicemails = async () => {
    const vms = await getVoicemails();
    setVoicemails(vms);
  };

  const refreshGreetings = async () => {
    const grs = await getGreetings();
    setGreetings(grs);
  };

  const handleUpdateSettings = async (newSettings: Partial<MachineSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSaveGreeting = async (newGreeting: Greeting) => {
    await saveGreeting(newGreeting);
    await refreshGreetings();
  };

  const handleDeleteGreeting = async (id: string) => {
    await deleteGreeting(id);
    await refreshGreetings();
  };

  const handleSetActiveGreeting = async (id: string) => {
    await handleUpdateSettings({ activeGreetingId: id });
  };

  const handleToggleFlag = async (id: string) => {
    const vm = voicemails.find((v) => v.id === id);
    if (!vm) return;
    const isFlagged = !vm.isFlagged;
    await updateVoicemail(id, { isFlagged });
    setVoicemails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isFlagged } : item))
    );
  };

  const handleToggleStatus = async (id: string) => {
    const vm = voicemails.find((v) => v.id === id);
    if (!vm) return;
    const newStatus = vm.status === 'new' ? 'listened' : 'new';
    await updateVoicemail(id, { status: newStatus });
    setVoicemails((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleDeleteVoicemail = async (id: string) => {
    await deleteVoicemail(id);
    setVoicemails((prev) => prev.filter((item) => item.id !== id));
    if (selectedVoicemailId === id) {
      setSelectedVoicemailId(null);
    }
  };

  const handlePlayOnTapeDeck = (id: string) => {
    setSelectedVoicemailId(id);
    setActiveTab('console');
  };

  // Trigger Incoming Call Simulation
  const handleLaunchCall = (scenario: CallScenario | null, _mode: 'scenario' | 'microphone') => {
    setActiveCallScenario(scenario);
    setIsScreeningModalOpen(true);
  };

  // Call Completed callback
  const handleVoicemailCompleted = async (newVm: Voicemail) => {
    await saveVoicemail(newVm);
    await refreshVoicemails();
    setSelectedVoicemailId(newVm.id);
  };

  const activeGreeting =
    greetings.find((g) => g.id === settings.activeGreetingId) ||
    greetings[0] || {
      id: 'fallback',
      title: 'Default Greeting',
      category: 'standard',
      text: 'Hello, please leave a message after the beep.',
      voiceType: 'preset',
      createdAt: Date.now(),
    };

  const newMessagesCount = voicemails.filter((v) => v.status === 'new').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 space-y-3 font-mono-code">
        <Radio className="w-10 h-10 text-amber-500 animate-pulse" />
        <p className="text-sm">Powering on EchoTape 2000 Solid-State Memory...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/40 border border-amber-400/50">
              <Radio className="w-5 h-5 text-neutral-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-tech text-lg font-bold tracking-wider text-neutral-100 uppercase">
                  EchoTape
                </h1>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  AUTOVOICE 2000
                </span>
              </div>
              <p className="text-[11px] font-mono-code text-neutral-400 hidden sm:block">
                Smart Answering Machine • Offline IndexedDB Storage
              </p>
            </div>
          </div>

          {/* Quick Header Buttons */}
          <div className="flex items-center gap-3">
            {/* New Voicemails Pill */}
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono-code transition-all cursor-pointer ${
                newMessagesCount > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800'
              }`}
              title="Click to view inbox"
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>
                {newMessagesCount > 0 ? `${newMessagesCount} New Voicemail${newMessagesCount > 1 ? 's' : ''}` : 'No New Msgs'}
              </span>
            </button>

            {/* Quick Simulate Call Button */}
            <button
              onClick={() => handleLaunchCall(CALL_SCENARIOS[0], 'scenario')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-tech font-bold text-xs uppercase tracking-wider shadow-md shadow-emerald-950/50 border border-emerald-400 transition-all active:scale-95 cursor-pointer"
              title="Trigger incoming phone call test"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Simulate Call</span>
              <span className="sm:hidden">Call</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-neutral-800/60 py-1.5">
          {[
            { id: 'console', label: 'Machine Deck', icon: Disc },
            { id: 'inbox', label: `Voicemails (${voicemails.length})`, icon: Inbox },
            { id: 'greetings', label: 'Greetings Studio', icon: Mic },
            { id: 'simulator', label: 'Call Screener Lab', icon: Headphones },
            { id: 'storage', label: 'Offline Storage', icon: HardDrive },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono-code transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-neutral-800 text-amber-400 font-bold border border-neutral-700 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-neutral-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* VIEW 1: MACHINE CONSOLE DECK */}
        {activeTab === 'console' && (
          <div className="space-y-6">
            {/* The Hardware Tape Deck Unit */}
            <TapeDeck
              voicemails={voicemails}
              settings={settings}
              activeGreetingTitle={activeGreeting.title}
              onUpdateSettings={handleUpdateSettings}
              onSimulateCall={() => handleLaunchCall(CALL_SCENARIOS[0], 'scenario')}
              onOpenRecordGreeting={() => setActiveTab('greetings')}
              onDeleteCurrent={handleDeleteVoicemail}
              selectedVoicemailId={selectedVoicemailId}
              onSelectVoicemail={setSelectedVoicemailId}
            />

            {/* Quick Voicemail Preview Strip */}
            <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-200 font-tech uppercase tracking-wider flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-amber-500" />
                  <span>Recent Voicemails On Tape</span>
                </h3>
                <button
                  onClick={() => setActiveTab('inbox')}
                  className="text-xs font-mono-code text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  View All ({voicemails.length}) →
                </button>
              </div>

              {voicemails.length === 0 ? (
                <p className="text-xs text-neutral-500 font-mono-code py-4 text-center">
                  Tape buffer empty. Press "Simulate Call" to test incoming recording!
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {voicemails.slice(0, 3).map((vm) => (
                    <div
                      key={vm.id}
                      onClick={() => setSelectedVoicemailId(vm.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        selectedVoicemailId === vm.id
                          ? 'bg-amber-500/15 border-amber-500 shadow-md'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-neutral-200 truncate">{vm.callerName}</span>
                          {vm.status === 'new' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-code font-bold bg-amber-500/20 text-amber-400">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono-code text-amber-400 mb-1.5">{vm.callerNumber}</div>
                        <p className="text-xs text-neutral-400 line-clamp-2">{vm.summary}</p>
                      </div>
                      <div className="text-[10px] font-mono-code text-neutral-500 mt-2 pt-2 border-t border-neutral-900 flex justify-between">
                        <span>{vm.duration}s</span>
                        <span>{new Date(vm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: VOICEMAILS INBOX & CALLER LISTING */}
        {activeTab === 'inbox' && (
          <VoicemailInbox
            voicemails={voicemails}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            selectedVoicemailId={selectedVoicemailId}
            onSelectVoicemail={setSelectedVoicemailId}
            onToggleFlag={handleToggleFlag}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteVoicemail}
            onPlayOnTapeDeck={handlePlayOnTapeDeck}
          />
        )}

        {/* VIEW 3: GREETINGS STUDIO */}
        {activeTab === 'greetings' && (
          <GreetingsStudio
            greetings={greetings}
            settings={settings}
            onSaveGreeting={handleSaveGreeting}
            onDeleteGreeting={handleDeleteGreeting}
            onSetActiveGreeting={handleSetActiveGreeting}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {/* VIEW 4: CALL SIMULATOR & SCREENING LAB */}
        {activeTab === 'simulator' && (
          <CallSimulatorPanel onStartSimulation={handleLaunchCall} />
        )}

        {/* VIEW 5: OFFLINE STORAGE & DATA EXPORT */}
        {activeTab === 'storage' && (
          <OfflineStorageManager settings={settings} onRefreshData={refreshVoicemails} />
        )}
      </main>

      {/* LIVE CALL SCREENING MODAL */}
      <CallScreeningModal
        isOpen={isScreeningModalOpen}
        onClose={() => setIsScreeningModalOpen(false)}
        activeGreeting={activeGreeting}
        settings={settings}
        onVoicemailCompleted={handleVoicemailCompleted}
        initialScenario={activeCallScenario}
      />

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-4 text-center text-xs text-neutral-500 font-mono-code">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>EchoTape Solid-State System • Local IndexedDB Audio Engine</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>100% Offline Storage Enabled</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
