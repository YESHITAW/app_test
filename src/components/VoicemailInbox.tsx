import React, { useState, useRef, useEffect } from 'react';
import {
  Voicemail,
  MachineSettings,
  CallUrgency,
  CallSentiment,
} from '../types';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Phone,
  Clock,
  Download,
  Trash2,
  Bookmark,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Disc,
  Gauge,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';

interface VoicemailInboxProps {
  voicemails: Voicemail[];
  settings: MachineSettings;
  onUpdateSettings: (newSettings: Partial<MachineSettings>) => void;
  selectedVoicemailId: string | null;
  onSelectVoicemail: (id: string | null) => void;
  onToggleFlag: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onPlayOnTapeDeck: (id: string) => void;
}

export const VoicemailInbox: React.FC<VoicemailInboxProps> = ({
  voicemails,
  settings,
  onUpdateSettings,
  selectedVoicemailId,
  onSelectVoicemail,
  onToggleFlag,
  onToggleStatus,
  onDelete,
  onPlayOnTapeDeck,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'new' | 'flagged' | 'urgent'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(voicemails[0]?.id || null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [currentTimes, setCurrentTimes] = useState<{ [id: string]: number }>({});
  const [durations, setDurations] = useState<{ [id: string]: number }>({});

  // Post-playback delete prompt
  const [finishedPromptVm, setFinishedPromptVm] = useState<Voicemail | null>(null);
  const [countdown, setCountdown] = useState<number>(5);
  const countdownTimerRef = useRef<number | null>(null);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up
  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  // Filtered list
  const filtered = voicemails.filter((vm) => {
    const matchesSearch =
      vm.callerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.callerNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.transcript.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.summary.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'new') return vm.status === 'new';
    if (filterType === 'flagged') return Boolean(vm.isFlagged);
    if (filterType === 'urgent') return vm.urgency === 'High' || vm.urgency === 'Emergency';
    return true;
  });

  // Handle Play / Pause
  const handlePlayToggle = (vm: Voicemail) => {
    // If clicking same track that is already playing
    if (playingId === vm.id) {
      if (!isPaused) {
        // Pause
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
        }
        setIsPaused(true);
      } else {
        // Resume
        if (activeAudioRef.current) {
          activeAudioRef.current.play().catch(() => {});
        }
        setIsPaused(false);
      }
      return;
    }

    // New track selected
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
    }

    if (vm.audioUrl) {
      const audio = new Audio(vm.audioUrl);
      activeAudioRef.current = audio;
      audio.playbackRate = playbackSpeed;
      audio.currentTime = currentTimes[vm.id] || 0;
      audio.play().catch(() => {});
      setPlayingId(vm.id);
      setIsPaused(false);

      if (vm.status === 'new') {
        onToggleStatus(vm.id);
      }

      audio.onloadedmetadata = () => {
        setDurations((prev) => ({ ...prev, [vm.id]: audio.duration || vm.duration || 30 }));
      };

      audio.ontimeupdate = () => {
        setCurrentTimes((prev) => ({
          ...prev,
          [vm.id]: audio.currentTime,
        }));
        setDurations((prev) => ({
          ...prev,
          [vm.id]: audio.duration || vm.duration || 30,
        }));
      };

      audio.onended = () => {
        handleTrackFinished(vm);
      };
    } else {
      // Simulation for demo messages without audio blob
      setPlayingId(vm.id);
      setIsPaused(false);
      const total = vm.duration || 20;
      setDurations((prev) => ({ ...prev, [vm.id]: total }));

      const interval = setInterval(() => {
        setCurrentTimes((prev) => {
          const current = (prev[vm.id] || 0) + 1 * playbackSpeed;
          if (current >= total) {
            clearInterval(interval);
            handleTrackFinished(vm);
            return { ...prev, [vm.id]: 0 };
          }
          return { ...prev, [vm.id]: current };
        });
      }, 1000);
    }
  };

  // Track finished playing
  const handleTrackFinished = (vm: Voicemail) => {
    setPlayingId(null);
    setIsPaused(false);
    setCurrentTimes((prev) => ({ ...prev, [vm.id]: 0 }));
    setFinishedPromptVm(vm);

    // If autoDeleteAfterPlayback is enabled, start 5s countdown
    if (settings.autoDeleteAfterPlayback) {
      setCountdown(5);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      let c = 5;
      countdownTimerRef.current = window.setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          onDelete(vm.id);
          setFinishedPromptVm(null);
        }
      }, 1000);
    }
  };

  // Rewind
  const handleRewind = (vm: Voicemail, secs = 10) => {
    if (activeAudioRef.current && playingId === vm.id) {
      const newTime = Math.max(0, activeAudioRef.current.currentTime - secs);
      activeAudioRef.current.currentTime = newTime;
      setCurrentTimes((prev) => ({ ...prev, [vm.id]: newTime }));
    } else {
      setCurrentTimes((prev) => ({
        ...prev,
        [vm.id]: Math.max(0, (prev[vm.id] || 0) - secs),
      }));
    }
  };

  // Fast-Forward
  const handleFastForward = (vm: Voicemail, secs = 10) => {
    const total = durations[vm.id] || vm.duration || 30;
    if (activeAudioRef.current && playingId === vm.id) {
      const newTime = Math.min(total, activeAudioRef.current.currentTime + secs);
      activeAudioRef.current.currentTime = newTime;
      setCurrentTimes((prev) => ({ ...prev, [vm.id]: newTime }));
    } else {
      setCurrentTimes((prev) => ({
        ...prev,
        [vm.id]: Math.min(total, (prev[vm.id] || 0) + secs),
      }));
    }
  };

  // Draggable timeline scrubber seek
  const handleSeek = (vm: Voicemail, newTime: number) => {
    setCurrentTimes((prev) => ({ ...prev, [vm.id]: newTime }));
    if (activeAudioRef.current && playingId === vm.id) {
      activeAudioRef.current.currentTime = newTime;
    }
  };

  // Speed change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (activeAudioRef.current) {
      activeAudioRef.current.playbackRate = speed;
    }
  };

  const handleCancelDeletePrompt = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setFinishedPromptVm(null);
  };

  const handleConfirmDeletePrompt = () => {
    if (!finishedPromptVm) return;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    onDelete(finishedPromptVm.id);
    setFinishedPromptVm(null);
  };

  const handleDownloadAudio = (vm: Voicemail) => {
    if (!vm.audioUrl) return;
    const a = document.createElement('a');
    a.href = vm.audioUrl;
    a.download = `Voicemail_${vm.callerName.replace(/\s+/g, '_')}_${new Date(vm.timestamp).toISOString().slice(0, 10)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Today at ${timeStr}`;
    }
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  };

  const getUrgencyBadge = (urgency: CallUrgency) => {
    switch (urgency) {
      case 'Emergency':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'High':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'Low':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      default:
        return 'bg-neutral-800 text-neutral-400 border-neutral-700';
    }
  };

  const getSentimentColor = (sentiment: CallSentiment) => {
    switch (sentiment) {
      case 'Positive':
      case 'Friendly':
        return 'text-emerald-400';
      case 'Urgent':
      case 'Frustrated':
        return 'text-red-400';
      case 'Formal':
        return 'text-cyan-400';
      default:
        return 'text-neutral-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Search Bar & Auto-Delete Preference Strip */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search voicemails by caller, phone, or transcript keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-4 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 font-sans"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono-code transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              All ({voicemails.length})
            </button>

            <button
              onClick={() => setFilterType('new')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono-code transition-all cursor-pointer ${
                filterType === 'new'
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              New ({voicemails.filter((v) => v.status === 'new').length})
            </button>

            <button
              onClick={() => setFilterType('urgent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono-code transition-all cursor-pointer ${
                filterType === 'urgent'
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              Urgent ({voicemails.filter((v) => v.urgency === 'High' || v.urgency === 'Emergency').length})
            </button>

            <button
              onClick={() => setFilterType('flagged')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono-code transition-all cursor-pointer ${
                filterType === 'flagged'
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              Flagged ({voicemails.filter((v) => v.isFlagged).length})
            </button>
          </div>
        </div>

        {/* Global Playback & Delete Options Strip */}
        <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">PLAYBACK SPEED:</span>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  playbackSpeed === s
                    ? 'bg-amber-500 text-neutral-950 font-bold shadow'
                    : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-400'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Auto-Delete Toggle Option */}
          <div className="flex items-center gap-2">
            <span>Delete after playback:</span>
            <button
              onClick={() =>
                onUpdateSettings({ autoDeleteAfterPlayback: !settings.autoDeleteAfterPlayback })
              }
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                settings.autoDeleteAfterPlayback
                  ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800'
              }`}
              title="Automatically delete message or prompt when playback ends"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{settings.autoDeleteAfterPlayback ? 'AUTO-DELETE: ON' : 'AUTO-DELETE: OFF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* POST PLAYBACK DIALOG ALERT BANNER */}
      {finishedPromptVm && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <span>Playback finished: "{finishedPromptVm.callerName}"</span>
                {settings.autoDeleteAfterPlayback && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono-code font-bold bg-red-500/30 text-red-300 animate-pulse">
                    Auto-deleting in {countdown}s
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                {settings.autoDeleteAfterPlayback
                  ? 'Message will be automatically deleted from answering machine memory.'
                  : 'Playback finished. Choose whether to delete this message or preserve it.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCancelDeletePrompt}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono-code font-semibold border border-neutral-700 cursor-pointer"
            >
              Keep Message
            </button>

            <button
              onClick={handleConfirmDeletePrompt}
              className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono-code font-bold shadow-md shadow-red-950/50 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Now</span>
            </button>
          </div>
        </div>
      )}

      {/* Voicemails Listing */}
      {filtered.length === 0 ? (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
          <Disc className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-base font-semibold text-neutral-300">No Voicemails Found</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            {searchQuery
              ? `No messages matched "${searchQuery}". Try clearing your search.`
              : 'Your answering machine inbox is clear. Simulate an incoming call to record your first message!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((vm) => {
            const isExpanded = expandedId === vm.id;
            const isPlaying = playingId === vm.id && !isPaused;
            const isThisPaused = playingId === vm.id && isPaused;
            const currentT = currentTimes[vm.id] || 0;
            const totalT = durations[vm.id] || vm.duration || 30;

            return (
              <div
                key={vm.id}
                className={`bg-neutral-900/90 border transition-all rounded-2xl overflow-hidden shadow-md ${
                  vm.status === 'new'
                    ? 'border-amber-500/40 shadow-amber-950/20'
                    : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {/* Header Row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Caller Info & Play / Pause Button */}
                  <div className="flex items-start md:items-center gap-3.5">
                    {/* Play / Pause Toggle Button */}
                    <button
                      onClick={() => handlePlayToggle(vm)}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-md ${
                        isPlaying
                          ? 'bg-amber-500 text-neutral-950 shadow-amber-500/30'
                          : isThisPaused
                          ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700'
                      }`}
                      title={isPlaying ? 'Pause' : isThisPaused ? 'Resume' : 'Play Voicemail Audio'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-100 text-base">{vm.callerName}</span>

                        {vm.status === 'new' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            NEW
                          </span>
                        )}

                        {vm.status === 'intercepted' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            INTERCEPTED
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code border ${getUrgencyBadge(
                            vm.urgency
                          )}`}
                        >
                          {vm.urgency} Urgency
                        </span>

                        {vm.callerIntent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code bg-neutral-800 text-neutral-400 border border-neutral-700">
                            {vm.callerIntent}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono-code mt-1 flex-wrap">
                        <span className="text-amber-400 font-medium">{vm.callerNumber}</span>
                        <span>•</span>
                        <span>{formatTimestamp(vm.timestamp)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-neutral-500" />
                          <span>{vm.duration}s</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    {/* Load on Machine Deck */}
                    <button
                      onClick={() => onPlayOnTapeDeck(vm.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs flex items-center gap-1.5 border border-neutral-700 transition-all cursor-pointer"
                      title="Load this message onto physical tape deck console"
                    >
                      <Disc className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Deck</span>
                    </button>

                    {/* Bookmark / Flag */}
                    <button
                      onClick={() => onToggleFlag(vm.id)}
                      className={`p-2 rounded-lg border transition-all cursor-pointer ${
                        vm.isFlagged
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 border-neutral-700'
                      }`}
                      title="Bookmark message"
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${vm.isFlagged ? 'fill-current' : ''}`} />
                    </button>

                    {/* Expand details toggle */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : vm.id)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono-code flex items-center gap-1 border border-neutral-700 transition-all cursor-pointer"
                    >
                      <span>{isExpanded ? 'Less' : 'Controls & Transcript'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Interactive Audio Scrubber Bar (always visible when playing or expanded) */}
                <div className="px-4 py-2 bg-neutral-950/60 border-t border-neutral-800/60 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-code text-neutral-400">
                    <span className="text-amber-400 font-bold">{formatSeconds(currentT)}</span>
                    <span className="text-neutral-500">
                      {isPlaying ? 'PLAYING' : isThisPaused ? 'PAUSED' : 'POSITION'}
                    </span>
                    <span>{formatSeconds(totalT)}</span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max={totalT}
                    step="0.5"
                    value={currentT}
                    onChange={(e) => handleSeek(vm, parseFloat(e.target.value))}
                    className="w-full accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer h-1.5"
                    title="Seek to exact position"
                  />
                </div>

                {/* Summary Snapshot */}
                <div className="px-4 pb-3 pt-1">
                  <p className="text-xs text-neutral-300 line-clamp-1">
                    <span className="font-semibold text-amber-400 font-mono-code mr-1.5">AI SUMMARY:</span>
                    {vm.summary}
                  </p>
                </div>

                {/* Expanded Details Section: Full Playback Controls + Transcript */}
                {isExpanded && (
                  <div className="border-t border-neutral-800 bg-neutral-950/70 p-4 space-y-4">
                    {/* COMPLETE PLAYBACK CONTROLS STRIP */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                      {/* Left: Play, Pause, Rewind 10s, FFWD 10s */}
                      <div className="flex items-center gap-1.5">
                        {/* Rewind 10s */}
                        <button
                          onClick={() => handleRewind(vm, 10)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-mono-code font-bold flex items-center gap-1 border border-neutral-700 cursor-pointer"
                          title="Rewind 10 seconds"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>-10s</span>
                        </button>

                        {/* Play / Pause Toggle */}
                        <button
                          onClick={() => handlePlayToggle(vm)}
                          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold font-mono-code flex items-center gap-1.5 cursor-pointer shadow"
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5 fill-current" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{isThisPaused ? 'Resume' : 'Play'}</span>
                            </>
                          )}
                        </button>

                        {/* Fast-Forward 10s */}
                        <button
                          onClick={() => handleFastForward(vm, 10)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 text-xs font-mono-code font-bold flex items-center gap-1 border border-neutral-700 cursor-pointer"
                          title="Fast-forward 10 seconds"
                        >
                          <span>+10s</span>
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Speed Dial Buttons */}
                        <div className="flex items-center gap-1 font-mono-code text-xs text-neutral-400 ml-2">
                          <span className="hidden sm:inline">Speed:</span>
                          {[0.75, 1.0, 1.25, 1.5].map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSpeedChange(s)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                playbackSpeed === s
                                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                  : 'text-neutral-500 hover:text-neutral-300'
                              }`}
                            >
                              {s}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Right: Download, Delete, Mark Status */}
                      <div className="flex items-center gap-2">
                        {vm.audioUrl && (
                          <button
                            onClick={() => handleDownloadAudio(vm)}
                            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs flex items-center gap-1.5 border border-neutral-700 cursor-pointer"
                            title="Download audio recording file"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        )}

                        <button
                          onClick={() => onToggleStatus(vm.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs flex items-center gap-1.5 border border-neutral-700 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{vm.status === 'new' ? 'Mark Listened' : 'Mark Unread'}</span>
                        </button>

                        <button
                          onClick={() => onDelete(vm.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-red-950/60 text-red-400 font-mono-code text-xs flex items-center gap-1.5 border border-neutral-800 hover:border-red-800/40 cursor-pointer"
                          title="Delete message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Automated Transcript Box */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono-code text-neutral-400">
                        <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AUTOMATED VOICE TRANSCRIPT</span>
                        </span>
                        <span className={`text-[11px] font-semibold ${getSentimentColor(vm.sentiment)}`}>
                          Tone: {vm.sentiment}
                        </span>
                      </div>

                      <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 text-sm leading-relaxed text-neutral-200 font-sans shadow-inner selection:bg-amber-500/30">
                        {vm.transcript}
                      </div>
                    </div>

                    {/* Key Takeaways & Callback Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {vm.keyPoints && vm.keyPoints.length > 0 && (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-1.5">
                          <span className="text-[11px] font-mono-code text-neutral-400 font-semibold uppercase">
                            Key Points Extracted:
                          </span>
                          <ul className="space-y-1 text-xs text-neutral-300">
                            {vm.keyPoints.map((pt, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-amber-500 font-bold">•</span>
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2">
                        <span className="text-[11px] font-mono-code text-neutral-400 font-semibold uppercase">
                          Action Required:
                        </span>
                        <p className="text-xs text-neutral-300">
                          {vm.actionRequired || 'No immediate action stated.'}
                        </p>

                        {vm.callbackNumber && (
                          <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                            <span className="text-xs text-neutral-400 font-mono-code">Call back:</span>
                            <a
                              href={`tel:${vm.callbackNumber.replace(/\D/g, '')}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono-code text-xs font-semibold shadow transition-all cursor-pointer"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{vm.callbackNumber}</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
