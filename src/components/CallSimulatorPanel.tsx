import React, { useState } from 'react';
import { PhoneCall, Mic, Sparkles, User, Hash, Play, ShieldAlert, Truck, Stethoscope, Briefcase, Users } from 'lucide-react';
import { CallScenario } from '../types';
import { CALL_SCENARIOS } from './CallScreeningModal';

interface CallSimulatorPanelProps {
  onStartSimulation: (scenario: CallScenario | null, mode: 'scenario' | 'microphone') => void;
}

export const CallSimulatorPanel: React.FC<CallSimulatorPanelProps> = ({ onStartSimulation }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(CALL_SCENARIOS[0].id);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customName, setCustomName] = useState('Alex Mercer');
  const [customNumber, setCustomNumber] = useState('+1 (555) 789-0123');
  const [customLocation, setCustomLocation] = useState('Austin, TX');
  const [customScript, setCustomScript] = useState(
    'Hey, Alex here! Leaving a quick message regarding the project plans we discussed yesterday. Give me a call back when you get a chance!'
  );

  const getScenarioIcon = (cat: string) => {
    if (cat.includes('Medical')) return <Stethoscope className="w-4 h-4 text-emerald-400" />;
    if (cat.includes('Delivery')) return <Truck className="w-4 h-4 text-amber-400" />;
    if (cat.includes('Job')) return <Briefcase className="w-4 h-4 text-cyan-400" />;
    if (cat.includes('Security')) return <ShieldAlert className="w-4 h-4 text-red-400" />;
    return <Users className="w-4 h-4 text-blue-400" />;
  };

  const handleLaunchScenario = () => {
    if (isCustomMode) {
      const customScenario: CallScenario = {
        id: `sc-custom-${Date.now()}`,
        callerName: customName || 'Custom Caller',
        callerNumber: customNumber || '+1 (555) 000-0000',
        callerLocation: customLocation || 'Local Line',
        category: 'Custom Call',
        urgency: 'Normal',
        expectedIntent: 'General',
        script: customScript,
      };
      onStartSimulation(customScenario, 'scenario');
    } else {
      const scenario = CALL_SCENARIOS.find((s) => s.id === selectedScenarioId) || CALL_SCENARIOS[0];
      onStartSimulation(scenario, 'scenario');
    }
  };

  const handleLaunchMicrophone = () => {
    const micScenario: CallScenario = {
      id: `sc-mic-${Date.now()}`,
      callerName: 'Live Microphone Caller',
      callerNumber: '+1 (555) MIC-LIVE',
      callerLocation: 'Direct Microphone',
      category: 'Live Voice Test',
      urgency: 'Normal',
      expectedIntent: 'Live Voice',
      script: '',
    };
    onStartSimulation(micScenario, 'microphone');
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
      <div>
        <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
          <PhoneCall className="w-5 h-5 text-amber-500" />
          <span>Call Screening & Caller Listening Simulator</span>
        </h3>
        <p className="text-xs text-neutral-400 mt-1">
          Trigger an incoming phone call to test the entire answering machine lifecycle: telephone rings, automated
          greeting playback, recording beep tone, live caller screening over the speaker, live captions, and AI transcription.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Preset Scenarios */}
        <button
          onClick={() => setIsCustomMode(false)}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            !isCustomMode
              ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow'
              : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <div className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Realistic Call Scenarios</span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Choose from doctor clinics, courier delivery, recruiters, urgent neighbors, or bank security.
          </p>
        </button>

        {/* Custom Caller Setup */}
        <button
          onClick={() => setIsCustomMode(true)}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            isCustomMode
              ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow'
              : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <div className="font-semibold text-sm text-neutral-100 flex items-center gap-2">
            <User className="w-4 h-4 text-cyan-400" />
            <span>Custom Script / Caller ID</span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Type custom caller name, telephone number, and custom speech script for the caller.
          </p>
        </button>
      </div>

      {/* Preset Scenario Cards */}
      {!isCustomMode ? (
        <div className="space-y-2.5">
          <label className="text-xs font-mono-code text-neutral-400 font-semibold block">
            Select Incoming Scenario:
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CALL_SCENARIOS.map((sc) => (
              <div
                key={sc.id}
                onClick={() => setSelectedScenarioId(sc.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  selectedScenarioId === sc.id
                    ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-neutral-100 flex items-center gap-1.5">
                      {getScenarioIcon(sc.category)}
                      <span>{sc.callerName}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono-code uppercase bg-neutral-800 text-neutral-400">
                      {sc.category}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono-code text-amber-400 mb-1.5">{sc.callerNumber}</div>

                  <p className="text-xs text-neutral-300 line-clamp-2 italic leading-relaxed">
                    "{sc.script}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Custom Caller Entry Form */
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-mono-code text-neutral-400 block mb-1">Caller Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-mono-code text-neutral-400 block mb-1">Telephone Number</label>
              <input
                type="text"
                value={customNumber}
                onChange={(e) => setCustomNumber(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono-code text-neutral-400 block mb-1">
              Caller Speech Script (Spoken via TTS)
            </label>
            <textarea
              rows={3}
              value={customScript}
              onChange={(e) => setCustomScript(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-xs text-neutral-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      )}

      {/* Action Launch Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800">
        <button
          onClick={handleLaunchMicrophone}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono-code text-xs font-semibold border border-neutral-700 transition-all cursor-pointer"
          title="Speak into your own microphone live as the caller"
        >
          <Mic className="w-4 h-4 text-red-400" />
          <span>Act as Caller (Use Microphone)</span>
        </button>

        <button
          onClick={handleLaunchScenario}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-tech font-bold text-sm tracking-wider uppercase shadow-lg shadow-emerald-950/60 border border-emerald-400 transition-all active:scale-95 cursor-pointer"
        >
          <PhoneCall className="w-4 h-4" />
          <span>Trigger Incoming Call Now</span>
        </button>
      </div>
    </div>
  );
};
