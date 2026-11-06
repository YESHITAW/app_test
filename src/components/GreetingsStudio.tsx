import React, { useState, useRef } from 'react';
import { Greeting, MachineSettings } from '../types';
import {
  Mic,
  Square,
  Play,
  Pause,
  Sparkles,
  Volume2,
  Trash2,
  Check,
  Radio,
  Sliders,
  Bell,
  Clock,
  AudioWaveform as Waveform,
  Save,
  RotateCcw,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface GreetingsStudioProps {
  greetings: Greeting[];
  settings: MachineSettings;
  onSaveGreeting: (greeting: Greeting) => void;
  onDeleteGreeting: (id: string) => void;
  onSetActiveGreeting: (id: string) => void;
  onUpdateSettings: (newSettings: Partial<MachineSettings>) => void;
}

export const GreetingsStudio: React.FC<GreetingsStudioProps> = ({
  greetings,
  settings,
  onSaveGreeting,
  onDeleteGreeting,
  onSetActiveGreeting,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'record' | 'ai-voice' | 'library' | 'settings'>('record');

  // Mic Recording State
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micSeconds, setMicSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [greetingTitle, setGreetingTitle] = useState('');
  const [liveVolume, setLiveVolume] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // AI TTS Generation State
  const [ttsScript, setTtsScript] = useState(
    "Hello! You've reached my answering machine. I'm currently unable to take your call. Please leave your name, phone number, and a brief message after the tone, and I will get back to you promptly."
  );
  const [ttsVoice, setTtsVoice] = useState<'Kore' | 'Fenrir' | 'Puck' | 'Zephyr' | 'Charon'>('Kore');
  const [ttsStyle, setTtsStyle] = useState('Clear, friendly, professional telephone answering machine greeting');
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsGeneratedUrl, setTtsGeneratedUrl] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);

  // Playback state
  const [playingGreetingId, setPlayingGreetingId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Beep test
  const [isPlayingBeep, setIsPlayingBeep] = useState(false);

  // Start Mic Recording
  const handleStartMic = async () => {
    try {
      setMicError(null);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setMicSeconds(0);

      audioEngine.playMechanicalClick('click');

      await audioEngine.startMicrophoneRecording((vol) => {
        setLiveVolume(vol);
      });

      setIsRecordingMic(true);

      timerRef.current = window.setInterval(() => {
        setMicSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setMicError(err.message || 'Microphone access denied. Please allow microphone permission.');
    }
  };

  // Stop Mic Recording
  const handleStopMic = async () => {
    if (!isRecordingMic) return;
    audioEngine.playMechanicalClick('click');

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      const { blob } = await audioEngine.stopMicrophoneRecording();
      setIsRecordingMic(false);
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
    } catch (err: any) {
      setIsRecordingMic(false);
      setMicError(err.message || 'Failed to finish recording');
    }
  };

  // Save Recorded Greeting
  const handleSaveRecordedGreeting = () => {
    if (!recordedBlob) return;
    const title = greetingTitle.trim() || `Custom Greeting (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    const newGreeting: Greeting = {
      id: `greeting-rec-${Date.now()}`,
      title,
      category: 'custom',
      text: 'Custom voice recorded greeting.',
      voiceType: 'recorded',
      audioBlob: recordedBlob,
      audioUrl: recordedUrl || undefined,
      duration: micSeconds,
      createdAt: Date.now(),
    };

    onSaveGreeting(newGreeting);
    onSetActiveGreeting(newGreeting.id);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setGreetingTitle('');
    setActiveTab('library');
  };

  // Generate Voice via Server Gemini TTS
  const handleGenerateAiVoice = async () => {
    try {
      setIsGeneratingTts(true);
      setTtsError(null);

      const res = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsScript,
          voiceName: ttsVoice,
          style: ttsStyle,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to synthesize speech');
      }

      const data = await res.json();
      setTtsGeneratedUrl(data.audioUrl);
    } catch (err: any) {
      console.warn('TTS error, falling back to Web Speech:', err);
      setTtsError(`${err.message} (You can also audition with browser speech synthesis below)`);
      // Web Speech audition fallback
      audioEngine.speakTextOffline(ttsScript, ttsVoice);
    } finally {
      setIsGeneratingTts(false);
    }
  };

  // Save AI Generated Greeting
  const handleSaveAiGreeting = () => {
    if (!ttsGeneratedUrl && !ttsScript) return;
    const newGreeting: Greeting = {
      id: `greeting-ai-${Date.now()}`,
      title: `${ttsVoice} - ${ttsScript.slice(0, 30)}...`,
      category: 'custom',
      text: ttsScript,
      voiceType: 'tts',
      voiceName: ttsVoice,
      audioUrl: ttsGeneratedUrl || undefined,
      duration: Math.max(8, Math.round(ttsScript.split(' ').length / 2.5)),
      createdAt: Date.now(),
    };

    onSaveGreeting(newGreeting);
    onSetActiveGreeting(newGreeting.id);
    setActiveTab('library');
  };

  // Play / Stop Greeting Preview
  const handleTogglePlayGreeting = (g: Greeting) => {
    if (playingGreetingId === g.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      audioEngine.stopAllSpeech();
      setPlayingGreetingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    audioEngine.stopAllSpeech();

    if (g.audioUrl) {
      const audio = new Audio(g.audioUrl);
      audioPlayerRef.current = audio;
      audio.volume = settings.speakerMonitorVolume;
      audio.play().catch(() => {});
      setPlayingGreetingId(g.id);
      audio.onended = () => setPlayingGreetingId(null);
    } else {
      // Offline browser TTS playback
      setPlayingGreetingId(g.id);
      audioEngine.speakTextOffline(g.text, g.voiceName).then(() => {
        setPlayingGreetingId(null);
      });
    }
  };

  // Test Beep Tone
  const handleTestBeep = async (toneType: string) => {
    setIsPlayingBeep(true);
    await audioEngine.playBeep(toneType);
    setIsPlayingBeep(false);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('record')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono-code transition-all cursor-pointer ${
              activeTab === 'record'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Record Voice</span>
          </button>

          <button
            onClick={() => setActiveTab('ai-voice')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono-code transition-all cursor-pointer ${
              activeTab === 'ai-voice'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Voice Synthesizer</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono-code transition-all cursor-pointer ${
              activeTab === 'library'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Greetings Library ({greetings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono-code transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Machine Tone & Pickup</span>
          </button>
        </div>

        {/* Active Greeting Indicator */}
        <div className="text-xs font-mono-code text-neutral-400 px-3 py-1 bg-neutral-950 rounded-xl border border-neutral-800">
          <span>Active: </span>
          <span className="text-amber-400 font-bold">
            {greetings.find((g) => g.id === settings.activeGreetingId)?.title || 'Standard'}
          </span>
        </div>
      </div>

      {/* TAB 1: RECORD CUSTOM VOICE WITH MICROPHONE */}
      {activeTab === 'record' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
              <Mic className="w-5 h-5 text-amber-500" />
              <span>Record Custom Voice Greeting</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Speak into your microphone to record an authentic outgoing answering machine greeting. Your audio is
              stored securely offline in local IndexedDB.
            </p>
          </div>

          {micError && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300">
              {micError}
            </div>
          )}

          {/* Recording Studio Booth */}
          <div className="bg-neutral-950 border-2 border-neutral-800 rounded-2xl p-6 text-center space-y-5">
            {/* Real-time VU Waveform / Volume Circle */}
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              {/* Outer pulsing ring for live volume */}
              <div
                className={`absolute inset-0 rounded-full border-2 transition-all duration-75 ${
                  isRecordingMic
                    ? 'border-red-500/80 shadow-[0_0_25px_rgba(239,68,68,0.5)]'
                    : 'border-neutral-800'
                }`}
                style={{
                  transform: isRecordingMic ? `scale(${1 + liveVolume * 0.4})` : 'scale(1)',
                }}
              />

              {/* Big Record / Stop Button */}
              {!isRecordingMic ? (
                <button
                  onClick={handleStartMic}
                  className="w-24 h-24 rounded-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white flex flex-col items-center justify-center gap-1 shadow-2xl shadow-red-950/80 border-2 border-red-400 transition-all active:scale-95 cursor-pointer"
                >
                  <Mic className="w-8 h-8" />
                  <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider">REC</span>
                </button>
              ) : (
                <button
                  onClick={handleStopMic}
                  className="w-24 h-24 rounded-full bg-neutral-900 text-red-500 flex flex-col items-center justify-center gap-1 shadow-2xl border-2 border-red-500 animate-pulse transition-all active:scale-95 cursor-pointer"
                >
                  <Square className="w-8 h-8 fill-current" />
                  <span className="text-[10px] font-mono-code font-bold uppercase tracking-wider">STOP</span>
                </button>
              )}
            </div>

            {/* Timer Readout */}
            <div className="font-digital text-4xl text-amber-500 text-glow-amber">
              {Math.floor(micSeconds / 60)}:{micSeconds % 60 < 10 ? '0' : ''}
              {micSeconds % 60}
            </div>

            <p className="text-xs text-neutral-400 font-mono-code">
              {isRecordingMic
                ? 'RECORDING IN PROGRESS... Click STOP when finished.'
                : recordedUrl
                ? 'Recording ready! Audition below or save to your greetings.'
                : 'Click the RED button to begin recording.'}
            </p>

            {/* Audition & Save Bar */}
            {recordedUrl && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 max-w-md mx-auto space-y-3 text-left">
                <div className="text-xs font-mono-code text-neutral-300 font-semibold flex items-center justify-between">
                  <span>Audition Greeting Audio</span>
                  <span className="text-amber-400">{micSeconds}s recorded</span>
                </div>

                <audio controls src={recordedUrl} className="w-full h-8" />

                <div>
                  <label className="text-[11px] font-mono-code text-neutral-400 block mb-1">Greeting Title</label>
                  <input
                    type="text"
                    placeholder="e.g., Summer 2026 Voice Greeting"
                    value={greetingTitle}
                    onChange={(e) => setGreetingTitle(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setRecordedBlob(null);
                      setRecordedUrl(null);
                      setMicSeconds(0);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Discard</span>
                  </button>

                  <button
                    onClick={handleSaveRecordedGreeting}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono-code text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save & Set Active</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI VOICE SYNTHESIZER (GEMINI TTS) */}
      {activeTab === 'ai-voice' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>AI Voice Persona Generator</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Compose custom greeting text and synthesize high-fidelity telephone speech using Gemini 3.8 Flash Lite TTS.
            </p>
          </div>

          {ttsError && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300">
              {ttsError}
            </div>
          )}

          <div className="space-y-4">
            {/* Script Textarea */}
            <div>
              <label className="text-xs font-mono-code text-neutral-300 block mb-1 font-semibold">
                Greeting Script Text
              </label>
              <textarea
                rows={3}
                value={ttsScript}
                onChange={(e) => setTtsScript(e.target.value)}
                placeholder="Type the message your callers will hear..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Preset Script Quick Buttons */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] font-mono-code text-neutral-500 self-center">Templates:</span>
              {[
                { label: 'Standard Office', text: "Thank you for calling. We are currently assisting other callers. Please leave your name and number, and we'll call you back as soon as possible." },
                { label: 'Out of Office', text: "Hello! I am currently out of the office with delayed access to voicemail. For urgent requests, please contact dispatch. Otherwise leave a message." },
                { label: 'Retro 80s Casual', text: "Hey! You've reached our tape deck. You know the drill: wait for the beep, leave your digits, and have a radical day." },
              ].map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => setTtsScript(tmpl.text)}
                  className="px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-xs font-mono-code cursor-pointer transition-all"
                >
                  {tmpl.label}
                </button>
              ))}
            </div>

            {/* Voice Persona Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
              {[
                { name: 'Kore', label: 'Kore (Warm & Friendly)', desc: 'Clear, natural feminine tone' },
                { name: 'Fenrir', label: 'Fenrir (Authoritative)', desc: 'Deeper masculine presence' },
                { name: 'Puck', label: 'Puck (Upbeat & Energetic)', desc: 'Bright, cheerful pacing' },
                { name: 'Zephyr', label: 'Zephyr (Calm & Soothing)', desc: 'Relaxed, polite tone' },
                { name: 'Charon', label: 'Charon (Formal Studio)', desc: 'Corporate & professional' },
              ].map((v) => (
                <button
                  key={v.name}
                  onClick={() => setTtsVoice(v.name as any)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    ttsVoice === v.name
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow'
                      : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="font-bold text-xs font-mono-code text-neutral-200">{v.name}</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{v.desc}</div>
                </button>
              ))}
            </div>

            {/* Style Prompt */}
            <div>
              <label className="text-xs font-mono-code text-neutral-400 block mb-1">
                Vocal Direction & Style Prompt
              </label>
              <input
                type="text"
                value={ttsStyle}
                onChange={(e) => setTtsStyle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 font-mono-code"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => audioEngine.speakTextOffline(ttsScript, ttsVoice)}
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono-code flex items-center gap-1.5 cursor-pointer"
                title="Preview using local browser speech synthesizer immediately"
              >
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Local TTS Audition</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateAiVoice}
                  disabled={isGeneratingTts || !ttsScript.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-mono-code text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-950/50 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingTts ? 'Synthesizing Audio...' : 'Generate Voice with Gemini'}</span>
                </button>

                {ttsGeneratedUrl && (
                  <button
                    onClick={handleSaveAiGreeting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono-code text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save to Library</span>
                  </button>
                )}
              </div>
            </div>

            {/* Audio Preview if generated */}
            {ttsGeneratedUrl && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center justify-between">
                <div className="text-xs font-mono-code text-amber-400">Gemini TTS Audio Ready:</div>
                <audio controls src={ttsGeneratedUrl} className="h-8 max-w-xs" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GREETINGS LIBRARY */}
      {activeTab === 'library' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
                <Radio className="w-5 h-5 text-amber-500" />
                <span>Greetings Library</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Select which greeting is currently armed on your answering machine deck.
              </p>
            </div>

            <button
              onClick={() => setActiveTab('record')}
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 font-mono-code text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record New</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {greetings.map((g) => {
              const isActive = g.id === settings.activeGreetingId;
              const isPlaying = playingGreetingId === g.id;

              return (
                <div
                  key={g.id}
                  className={`bg-neutral-950 border rounded-2xl p-4 transition-all relative overflow-hidden flex flex-col justify-between ${
                    isActive ? 'border-amber-500 shadow-md shadow-amber-950/30' : 'border-neutral-800'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-neutral-950 font-mono-code text-[10px] font-bold px-3 py-0.5 rounded-bl-lg">
                      CURRENTLY ACTIVE
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-semibold text-neutral-100 text-sm">{g.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono-code uppercase bg-neutral-800 text-neutral-400 border border-neutral-700">
                        {g.category}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 line-clamp-3 mb-3 leading-relaxed">
                      "{g.text}"
                    </p>
                  </div>

                  <div className="border-t border-neutral-800/80 pt-3 flex items-center justify-between">
                    <button
                      onClick={() => handleTogglePlayGreeting(g)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-mono-code text-xs flex items-center gap-1.5 border border-neutral-700 cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlaying ? 'Stop' : 'Audition'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {!isActive && (
                        <button
                          onClick={() => onSetActiveGreeting(g.id)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono-code text-xs font-semibold border border-amber-500/40 cursor-pointer"
                        >
                          Arm This Greeting
                        </button>
                      )}

                      {!g.isDefault && (
                        <button
                          onClick={() => onDeleteGreeting(g.id)}
                          className="p-1.5 rounded-lg bg-neutral-900 hover:bg-red-950/60 text-neutral-500 hover:text-red-400 border border-neutral-800 cursor-pointer"
                          title="Delete greeting"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: MACHINE TONE & HARDWARE BEHAVIOR CUSTOMIZATION */}
      {activeTab === 'settings' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2 font-tech">
              <Sliders className="w-5 h-5 text-amber-500" />
              <span>Machine Tone & Pickup Customization</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Configure answering ring count, recording prompt tone, tape filters, and maximum recording duration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tone Selector */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-code text-neutral-200 font-semibold flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recording Prompt Beep</span>
                </span>
                <span className="text-[10px] font-mono-code text-neutral-500">PLAYED TO CALLER</span>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'classic-1000hz', name: 'Classic 1000Hz Phone Beep', desc: 'Standard telco answering tone' },
                  { id: 'high-chirp', name: 'High-Pitch Chirp', desc: 'Crisp, modern alert frequency' },
                  { id: 'double-tone', name: 'Dual-Tone Blip', desc: 'Two-tone 880Hz + 1200Hz cadence' },
                  { id: 'retro-80s', name: 'Vintage 1980s Tape Beep', desc: 'Harmonic analog tape buzz' },
                  { id: 'soft-chime', name: 'Musical Chime', desc: 'Pleasant gentle chord' },
                ].map((tone) => (
                  <div
                    key={tone.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                      settings.beepType === tone.id
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                    onClick={() => onUpdateSettings({ beepType: tone.id as any })}
                  >
                    <div>
                      <div className="text-xs font-semibold text-neutral-200">{tone.name}</div>
                      <div className="text-[10px] text-neutral-500">{tone.desc}</div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestBeep(tone.id);
                      }}
                      className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-mono-code cursor-pointer"
                    >
                      Test Beep
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rings & Duration Controls */}
            <div className="space-y-4">
              {/* Rings Before Pickup */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5">
                <span className="text-xs font-mono-code text-neutral-200 font-semibold block">
                  Rings Before Answering
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { rings: 1, label: '1 Ring' },
                    { rings: 2, label: '2 Rings' },
                    { rings: 4, label: '4 Rings' },
                    { rings: 0, label: 'Toll Saver' },
                  ].map((r) => (
                    <button
                      key={r.rings}
                      onClick={() => onUpdateSettings({ ringsBeforeAnswer: r.rings })}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer font-mono-code text-xs ${
                        settings.ringsBeforeAnswer === r.rings
                          ? 'bg-amber-500 text-neutral-950 font-bold border-amber-400 shadow'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-neutral-500 font-mono-code">
                  Toll Saver answers in 2 rings if new messages are waiting, or 4 rings if none!
                </p>
              </div>

              {/* Max Recording Time */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5">
                <span className="text-xs font-mono-code text-neutral-200 font-semibold block">
                  Max Voicemail Recording Limit
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { sec: 30, label: '30 Sec' },
                    { sec: 60, label: '60 Sec' },
                    { sec: 120, label: '2 Min' },
                    { sec: 180, label: '3 Min' },
                  ].map((m) => (
                    <button
                      key={m.sec}
                      onClick={() => onUpdateSettings({ maxRecordingSeconds: m.sec })}
                      className={`p-2 rounded-lg border text-center transition-all cursor-pointer font-mono-code text-xs ${
                        settings.maxRecordingSeconds === m.sec
                          ? 'bg-amber-500 text-neutral-950 font-bold border-amber-400 shadow'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Tape Filters */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono-code text-neutral-200 font-semibold">
                    Analog Tape & POTS Telephone Filter
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.tapeFilterEffect}
                    onChange={(e) => onUpdateSettings({ tapeFilterEffect: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 leading-relaxed font-mono-code">
                  Applies genuine 300Hz-3400Hz telephone bandwidth bandpass and subtle tape warmth to caller playback.
                </p>
              </div>

              {/* Auto Delete After Playback Option */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono-code text-neutral-200 font-semibold flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Auto-Delete After Playback</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.autoDeleteAfterPlayback}
                    onChange={(e) => onUpdateSettings({ autoDeleteAfterPlayback: e.target.checked })}
                    className="accent-red-500 w-4 h-4 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 leading-relaxed font-mono-code">
                  When enabled, recorded voicemails will display an automatic 5-second countdown prompt to delete immediately after finishing playback.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
