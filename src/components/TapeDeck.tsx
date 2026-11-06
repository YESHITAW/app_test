import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  RotateCcw,
  RotateCw,
  Trash2,
  Volume2,
  VolumeX,
  Radio,
  PhoneCall,
  Mic,
  Disc,
  Headphones,
  Sliders,
  Sparkles,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Voicemail, MachineSettings } from '../types';
import { audioEngine } from '../services/audioEngine';

interface TapeDeckProps {
  voicemails: Voicemail[];
  settings: MachineSettings;
  activeGreetingTitle: string;
  onUpdateSettings: (newSettings: Partial<MachineSettings>) => void;
  onSimulateCall: () => void;
  onOpenRecordGreeting: () => void;
  onDeleteCurrent: (id: string) => void;
  selectedVoicemailId: string | null;
  onSelectVoicemail: (id: string | null) => void;
}

export const TapeDeck: React.FC<TapeDeckProps> = ({
  voicemails,
  settings,
  activeGreetingTitle,
  onUpdateSettings,
  onSimulateCall,
  onOpenRecordGreeting,
  onDeleteCurrent,
  selectedVoicemailId,
  onSelectVoicemail,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [vuLevels, setVuLevels] = useState<number[]>([1, 1, 1, 1, 1, 1, 1, 1]);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  // Auto-delete countdown notification state
  const [deletePromptVoicemail, setDeletePromptVoicemail] = useState<Voicemail | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(5);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const newCount = voicemails.filter((v) => v.status === 'new').length;
  const currentVoicemail = voicemails[currentTrackIndex] || null;

  // Sync selectedVoicemailId from parent
  useEffect(() => {
    if (selectedVoicemailId) {
      const idx = voicemails.findIndex((v) => v.id === selectedVoicemailId);
      if (idx !== -1 && idx !== currentTrackIndex) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setCurrentTrackIndex(idx);
        setCurrentTime(0);
        setIsPlaying(false);
        setIsPaused(false);
      }
    }
  }, [selectedVoicemailId, voicemails]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Update speed on active audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle Playback Ended: Auto-delete or Post-playback prompt
  const handlePlaybackFinished = (finishedVm: Voicemail) => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);

    // If auto-delete is enabled in settings, start 5s countdown prompt
    if (settings.autoDeleteAfterPlayback) {
      setDeletePromptVoicemail(finishedVm);
      setCountdownSeconds(5);

      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      let count = 5;
      countdownIntervalRef.current = window.setInterval(() => {
        count--;
        setCountdownSeconds(count);
        if (count <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          onDeleteCurrent(finishedVm.id);
          setDeletePromptVoicemail(null);
          // Auto advance to next message if available
          if (currentTrackIndex < voicemails.length - 1) {
            setCurrentTrackIndex((prev) => prev);
          }
        }
      }, 1000);
    } else {
      // Show manual post-playback prompt: Delete or Keep
      setDeletePromptVoicemail(finishedVm);
    }
  };

  // Setup / Load audio when track or playing state changes
  useEffect(() => {
    if (!currentVoicemail) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    if (isPlaying && !isPaused) {
      const audioUrl = currentVoicemail.audioUrl;
      if (audioUrl) {
        // Reuse existing audio element if already loaded
        let audio = audioRef.current;
        if (!audio || audio.src !== audioUrl) {
          if (audio) audio.pause();
          audio = new Audio(audioUrl);
          audioRef.current = audio;
        }

        audio.volume = settings.speakerMonitorVolume;
        audio.playbackRate = playbackSpeed;

        audio.onloadedmetadata = () => {
          setDuration(audio?.duration || currentVoicemail.duration || 30);
        };

        audio.ontimeupdate = () => {
          if (audio) {
            setCurrentTime(audio.currentTime);
            setDuration(audio.duration || currentVoicemail.duration || 30);
          }
        };

        audio.onended = () => {
          handlePlaybackFinished(currentVoicemail);
        };

        audio.play().catch(() => {
          setIsPlaying(false);
          setIsPaused(true);
        });
      } else {
        // Simulated timer if audio element unavailable
        const total = currentVoicemail.duration || 24;
        setDuration(total);
        const timer = setInterval(() => {
          setCurrentTime((prev) => {
            if (prev >= total) {
              clearInterval(timer);
              handlePlaybackFinished(currentVoicemail);
              return 0;
            }
            return prev + 1 * playbackSpeed;
          });
        }, 1000);
        return () => clearInterval(timer);
      }
    } else if (isPaused && audioRef.current) {
      audioRef.current.pause();
    }

    return () => {
      // don't completely destroy on simple pause
    };
  }, [currentTrackIndex, isPlaying, isPaused, currentVoicemail, settings.speakerMonitorVolume]);

  // Animated VU meters while playing
  useEffect(() => {
    if (isPlaying && !isPaused) {
      const updateVu = () => {
        setVuLevels([
          Math.min(10, Math.floor(Math.random() * 5 + 4)),
          Math.min(10, Math.floor(Math.random() * 6 + 3)),
          Math.min(10, Math.floor(Math.random() * 7 + 3)),
          Math.min(10, Math.floor(Math.random() * 8 + 2)),
          Math.min(10, Math.floor(Math.random() * 7 + 2)),
          Math.min(10, Math.floor(Math.random() * 5 + 2)),
          Math.min(10, Math.floor(Math.random() * 4 + 1)),
          Math.min(10, Math.floor(Math.random() * 3 + 1)),
        ]);
        animRef.current = requestAnimationFrame(updateVu);
      };
      animRef.current = requestAnimationFrame(updateVu);
    } else {
      setVuLevels([1, 1, 1, 1, 1, 1, 1, 1]);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    }
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [isPlaying, isPaused]);

  // Play / Pause Toggle
  const handlePlayPause = () => {
    audioEngine.playMechanicalClick('clunk');
    if (voicemails.length === 0) return;

    if (isPlaying && !isPaused) {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPaused(true);
    } else if (isPaused) {
      // Resume from paused position
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      setIsPaused(false);
      setIsPlaying(true);
    } else {
      // Start playing
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  // Stop Playback and Rewind to start
  const handleStop = () => {
    audioEngine.playMechanicalClick('click');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
  };

  // Rewind: Jump back by seconds (default 10s)
  const handleRewindSeconds = (secs = 10) => {
    audioEngine.playMechanicalClick('click');
    setIsRewinding(true);
    setTimeout(() => setIsRewinding(false), 300);

    if (audioRef.current) {
      const newTime = Math.max(0, audioRef.current.currentTime - secs);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    } else {
      setCurrentTime((prev) => Math.max(0, prev - secs));
    }
  };

  // Fast Forward: Jump ahead by seconds (default 10s)
  const handleFastForwardSeconds = (secs = 10) => {
    audioEngine.playMechanicalClick('click');
    setIsFastForwarding(true);
    setTimeout(() => setIsFastForwarding(false), 300);

    if (audioRef.current) {
      const newTime = Math.min(duration, audioRef.current.currentTime + secs);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    } else {
      setCurrentTime((prev) => Math.min(duration, prev + secs));
    }
  };

  // Next Track
  const handleNextTrack = () => {
    audioEngine.playMechanicalClick('click');
    if (currentTrackIndex < voicemails.length - 1) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const nextIdx = currentTrackIndex + 1;
      setCurrentTrackIndex(nextIdx);
      onSelectVoicemail(voicemails[nextIdx].id);
      setCurrentTime(0);
      setIsPaused(false);
    }
  };

  // Previous Track
  const handlePrevTrack = () => {
    audioEngine.playMechanicalClick('click');
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else if (currentTrackIndex > 0) {
      const prevIdx = currentTrackIndex - 1;
      setCurrentTrackIndex(prevIdx);
      onSelectVoicemail(voicemails[prevIdx].id);
      setCurrentTime(0);
      setIsPaused(false);
    }
  };

  // Draggable timeline scrubber seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Speed selector
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Delete message handler
  const handleDeleteCurrentMessage = () => {
    if (!currentVoicemail) return;
    audioEngine.playMechanicalClick('click');
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setIsPaused(false);
    onDeleteCurrent(currentVoicemail.id);
    setDeletePromptVoicemail(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
  };

  const cancelAutoDelete = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setDeletePromptVoicemail(null);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 border-2 border-neutral-800 rounded-3xl p-6 shadow-2xl overflow-hidden text-neutral-200">
      {/* Metallic Chassis Highlights */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-neutral-700 via-neutral-400 to-neutral-700 opacity-60" />

      {/* Header Deck Branding & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/30 border border-amber-500/40">
            <Radio className="w-5 h-5 text-neutral-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-tech text-lg font-bold tracking-wider text-neutral-100 uppercase">
                EchoTape
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-code font-bold uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30">
                SOLID-STATE DECK
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-mono-code">Tape Deck Playback Engine with Auto-Delete</p>
          </div>
        </div>

        {/* LED Indicator Lamps */}
        <div className="flex items-center gap-4 bg-neutral-950/80 px-4 py-2 rounded-xl border border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span className="text-[11px] font-mono-code font-semibold uppercase text-neutral-400">POWER</span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                newCount > 0
                  ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)] animate-pulse'
                  : 'bg-amber-950 border border-amber-800'
              }`}
            />
            <span className="text-[11px] font-mono-code font-semibold uppercase text-neutral-400">
              MSG WAITING {newCount > 0 ? `(${newCount})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                isPlaying && !isPaused
                  ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-pulse'
                  : isPaused
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                  : 'bg-neutral-800'
              }`}
            />
            <span className="text-[11px] font-mono-code font-semibold uppercase text-neutral-400">
              {isPlaying && !isPaused ? 'PLAYING' : isPaused ? 'PAUSED' : 'STANDBY'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: 7-Segment LED Counter & Speed Dial (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
          {/* 7-Segment LED Digital Readout Box */}
          <div className="bg-neutral-950 border-2 border-neutral-800 rounded-2xl p-4 shadow-inner relative overflow-hidden">
            <div className="tape-stripes absolute inset-0 opacity-20 pointer-events-none" />

            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono-code tracking-wider text-amber-500/80 uppercase font-semibold">
                MESSAGE COUNTER
              </span>
              <span className="text-[10px] font-mono-code text-neutral-500 uppercase">
                {isPlaying && !isPaused ? 'RUNNING' : isPaused ? 'PAUSED' : 'READY'}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              {/* Massive Glowing 7-Segment Display */}
              <div className="font-digital text-6xl text-amber-500 text-glow-amber tracking-wider leading-none">
                {voicemails.length > 0
                  ? `${currentTrackIndex + 1 < 10 ? '0' : ''}${currentTrackIndex + 1}`
                  : '00'}
              </div>

              <div className="text-right">
                <div className="font-digital text-3xl text-emerald-400 text-glow-green leading-none">
                  {formatSeconds(currentTime)}
                </div>
                <div className="text-[10px] font-mono-code text-neutral-400 mt-1">
                  TOTAL {formatSeconds(duration || currentVoicemail?.duration || 0)}
                </div>
              </div>
            </div>

            {/* LCD Info Strip with Speed and Auto-Delete status */}
            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="text-neutral-400 font-mono-code truncate">
                <span className="text-neutral-500">SPEED:</span>{' '}
                <span className="text-amber-400 font-bold">{playbackSpeed}x</span>
              </div>
              <span
                className={`text-[10px] font-mono-code px-2 py-0.5 rounded border ${
                  settings.autoDeleteAfterPlayback
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                }`}
              >
                AUTO-DEL: {settings.autoDeleteAfterPlayback ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Playback Speed Adjustment Deck */}
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
            <div className="text-[11px] font-mono-code text-neutral-400 uppercase font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>Tape Playback Speed</span>
              </span>
              <span className="text-amber-400 text-[11px] font-bold">{playbackSpeed}x</span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`py-1.5 rounded-lg text-xs font-mono-code font-bold transition-all cursor-pointer ${
                    playbackSpeed === speed
                      ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-950/40 border border-amber-400'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Auto Delete Toggle on Deck */}
            <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-mono-code text-[11px]">Delete after play:</span>
              <button
                onClick={() =>
                  onUpdateSettings({ autoDeleteAfterPlayback: !settings.autoDeleteAfterPlayback })
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono-code font-semibold border transition-all cursor-pointer ${
                  settings.autoDeleteAfterPlayback
                    ? 'bg-red-500/20 text-red-300 border-red-500/50 shadow'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                }`}
                title="Automatically delete message or prompt immediately when message completes playback"
              >
                {settings.autoDeleteAfterPlayback ? 'Auto-Delete: ON' : 'Auto-Delete: OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Center Column: Cassette Tape Well & Timeline Scrubber (5 Cols) */}
        <div className="lg:col-span-5 bg-neutral-950 border-2 border-neutral-800 rounded-2xl p-4 shadow-inner relative flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono-code text-neutral-500 mb-2">
            <span>CASSETTE COMPARTMENT</span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <Disc className="w-3.5 h-3.5" />
              <span>
                {isPlaying && !isPaused ? 'TAPE MOTOR RUNNING' : isPaused ? 'TAPE PAUSED' : 'HEAD DISENGAGED'}
              </span>
            </span>
          </div>

          {/* Cassette Shell Container */}
          <div className="relative h-44 bg-neutral-900 border-2 border-neutral-700 rounded-xl p-3 shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* Cassette Label Header */}
            <div className="h-6 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 rounded-md px-3 flex items-center justify-between text-[11px] font-mono-code font-bold text-neutral-950 shadow">
              <span className="truncate">
                {currentVoicemail
                  ? `TRACK ${currentTrackIndex + 1}: ${currentVoicemail.callerName}`
                  : 'ECHOTAPE AUTOVOICE CASSETTE 60'}
              </span>
              <span>SIDE A</span>
            </div>

            {/* Tape Window with Dual Rotating Spools */}
            <div className="relative h-24 bg-neutral-950/90 border border-neutral-700/80 rounded-lg p-2 flex items-center justify-around shadow-inner overflow-hidden">
              {/* Magnetic tape band between spools */}
              <div className="absolute top-1/2 left-16 right-16 h-4 -translate-y-1/2 bg-amber-950/70 border-y border-amber-900/50" />

              {/* Left Spool */}
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-14 h-14 rounded-full border-4 border-amber-500/80 bg-neutral-800 flex items-center justify-center shadow-lg ${
                    isPlaying && !isPaused
                      ? isFastForwarding
                        ? 'animate-spin-tape-fast'
                        : isRewinding
                        ? 'animate-spin-tape-reverse'
                        : 'animate-spin-tape'
                      : ''
                  }`}
                >
                  <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-neutral-950 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                  </div>
                  <div className="absolute w-12 h-1 bg-amber-500/60" />
                  <div className="absolute w-1 h-12 bg-amber-500/60" />
                </div>
                <span className="text-[9px] font-mono-code text-neutral-500 mt-1">SUPPLY</span>
              </div>

              {/* Center Tape Window Status */}
              <div className="relative z-10 w-24 flex flex-col items-center">
                <div className="text-[10px] font-mono-code text-amber-400 font-bold uppercase tracking-wider text-center">
                  {isPlaying && !isPaused
                    ? isFastForwarding
                      ? 'FFWD >>'
                      : isRewinding
                      ? '<< REW'
                      : 'PLAYING'
                    : isPaused
                    ? 'PAUSED'
                    : 'STOPPED'}
                </div>
                <div className="text-[9px] font-mono-code text-neutral-500 mt-0.5">
                  {formatSeconds(currentTime)} / {formatSeconds(duration || currentVoicemail?.duration || 0)}
                </div>
              </div>

              {/* Right Spool */}
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-14 h-14 rounded-full border-4 border-amber-500/80 bg-neutral-800 flex items-center justify-center shadow-lg ${
                    isPlaying && !isPaused
                      ? isFastForwarding
                        ? 'animate-spin-tape-fast'
                        : isRewinding
                        ? 'animate-spin-tape-reverse'
                        : 'animate-spin-tape'
                      : ''
                  }`}
                >
                  <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-neutral-950 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                  </div>
                  <div className="absolute w-12 h-1 bg-amber-500/60" />
                  <div className="absolute w-1 h-12 bg-amber-500/60" />
                </div>
                <span className="text-[9px] font-mono-code text-neutral-500 mt-1">TAKE-UP</span>
              </div>
            </div>

            {/* Tape Detail */}
            <div className="flex items-center justify-between px-1">
              <div className="w-2 h-2 rounded-full bg-neutral-700 border border-neutral-600" />
              <span className="text-[9px] font-mono-code text-neutral-500">HI-BIAS 70μs EQ</span>
              <div className="w-2 h-2 rounded-full bg-neutral-700 border border-neutral-600" />
            </div>
          </div>

          {/* Interactive Timeline Scrubber Slider */}
          <div className="mt-3 space-y-1.5 bg-neutral-900/60 p-2.5 rounded-xl border border-neutral-800/80">
            <div className="flex items-center justify-between text-[11px] font-mono-code text-neutral-400">
              <span className="text-amber-400 font-semibold">{formatSeconds(currentTime)}</span>
              <span className="text-neutral-500">SEEK POSITION</span>
              <span>{formatSeconds(duration || currentVoicemail?.duration || 0)}</span>
            </div>

            <input
              type="range"
              min="0"
              max={duration || currentVoicemail?.duration || 1}
              step="0.5"
              value={currentTime}
              onChange={handleSeek}
              disabled={!currentVoicemail}
              className="w-full accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer h-2 disabled:opacity-40"
              title="Click or drag to seek to any position in message"
            />
          </div>
        </div>

        {/* Right Column: Speaker Monitor & Quick Action Dialog (3 Cols) */}
        <div className="lg:col-span-3 bg-neutral-950 border-2 border-neutral-800 rounded-2xl p-4 shadow-inner flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-mono-code text-neutral-500 mb-2">
              <span>SPEAKER MONITOR</span>
              <Headphones className="w-3.5 h-3.5 text-cyan-400" />
            </div>

            {/* Speaker Grille with VU Level Indicators */}
            <div className="speaker-grille h-24 rounded-xl border border-neutral-800 bg-neutral-900/80 p-3 flex items-end justify-center gap-1.5 shadow-inner">
              {vuLevels.map((lvl, i) => (
                <div key={i} className="flex flex-col gap-0.5 items-center w-2">
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((bar) => {
                    const isLit = lvl >= bar;
                    let colorClass = 'bg-neutral-800';
                    if (isLit) {
                      if (bar >= 9) colorClass = 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]';
                      else if (bar >= 7) colorClass = 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]';
                      else colorClass = 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]';
                    }
                    return <div key={bar} className={`w-2 h-1 rounded-xs transition-colors duration-75 ${colorClass}`} />;
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Volume Knob & Analog Filter Toggle */}
          <div className="space-y-3 pt-3 border-t border-neutral-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono-code text-neutral-400 flex items-center gap-1.5">
                {settings.speakerMonitorVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-neutral-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-neutral-300" />
                )}
                <span>Volume</span>
              </span>
              <span className="font-mono-code text-xs text-amber-400 font-bold">
                {Math.round(settings.speakerMonitorVolume * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.speakerMonitorVolume}
              onChange={(e) => onUpdateSettings({ speakerMonitorVolume: parseFloat(e.target.value) })}
              className="w-full accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer h-1.5"
            />

            <div className="flex items-center justify-between text-[11px] font-mono-code">
              <button
                onClick={() => onUpdateSettings({ tapeFilterEffect: !settings.tapeFilterEffect })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  settings.tapeFilterEffect
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                }`}
                title="Toggle analog telephone bandpass and tape warmth"
              >
                <Sparkles className="w-3 h-3" />
                <span>POTS Filter: {settings.tapeFilterEffect ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={onSimulateCall}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40 transition-all cursor-pointer"
                title="Simulate incoming call test"
              >
                Call Sim
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* POST-PLAYBACK AUTO-DELETE / MANUAL DELETE DIALOG BANNER */}
      {deletePromptVoicemail && (
        <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center shrink-0 border border-red-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <span>Message playback finished: "{deletePromptVoicemail.callerName}"</span>
                {settings.autoDeleteAfterPlayback && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono-code font-bold bg-red-500/30 text-red-300 animate-pulse">
                    Auto-deleting in {countdownSeconds}s
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                {settings.autoDeleteAfterPlayback
                  ? 'Auto-delete is armed. Click Cancel to preserve this voicemail in your inbox.'
                  : 'Would you like to delete this recorded message now, or keep it stored?'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={cancelAutoDelete}
              className="px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono-code font-semibold border border-neutral-700 cursor-pointer"
            >
              Keep Message
            </button>

            <button
              onClick={handleDeleteCurrentMessage}
              className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono-code font-bold shadow-md shadow-red-950/50 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Now</span>
            </button>
          </div>
        </div>
      )}

      {/* COMPLETE PLAYBACK CONTROLS ROW */}
      <div className="mt-6 pt-4 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-950/70 p-3 rounded-2xl border border-neutral-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous Track button */}
          <button
            onClick={handlePrevTrack}
            disabled={voicemails.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 disabled:opacity-40 font-mono-code text-xs font-semibold border border-neutral-700 shadow transition-all cursor-pointer"
            title="Previous Voicemail Track"
          >
            <SkipBack className="w-4 h-4" />
            <span className="hidden sm:inline">PREV</span>
          </button>

          {/* Quick Rewind 10 Seconds */}
          <button
            onClick={() => handleRewindSeconds(10)}
            disabled={voicemails.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-amber-400 disabled:opacity-40 font-mono-code text-xs font-semibold border border-neutral-700 shadow transition-all cursor-pointer"
            title="Rewind 10 seconds"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>-10s</span>
          </button>

          {/* Big Play / Pause Button */}
          <button
            onClick={handlePlayPause}
            disabled={voicemails.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-tech font-bold text-sm tracking-wider uppercase shadow-lg transition-all active:scale-95 cursor-pointer ${
              isPlaying && !isPaused
                ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-amber-950/60 border border-amber-400'
                : isPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 border border-emerald-400'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 shadow-amber-950/60 border border-amber-400'
            } disabled:opacity-40`}
            title={isPlaying && !isPaused ? 'Pause Playback' : isPaused ? 'Resume Playback' : 'Play Message'}
          >
            {isPlaying && !isPaused ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>PAUSE</span>
              </>
            ) : isPaused ? (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>RESUME</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY</span>
              </>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            disabled={!isPlaying && !isPaused && currentTime === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 disabled:opacity-40 font-mono-code text-xs font-semibold border border-neutral-700 shadow transition-all cursor-pointer"
            title="Stop playback and rewind to beginning"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>STOP</span>
          </button>

          {/* Quick Fast-Forward 10 Seconds */}
          <button
            onClick={() => handleFastForwardSeconds(10)}
            disabled={voicemails.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-amber-400 disabled:opacity-40 font-mono-code text-xs font-semibold border border-neutral-700 shadow transition-all cursor-pointer"
            title="Fast-forward 10 seconds"
          >
            <span>+10s</span>
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Next Track button */}
          <button
            onClick={handleNextTrack}
            disabled={voicemails.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 disabled:opacity-40 font-mono-code text-xs font-semibold border border-neutral-700 shadow transition-all cursor-pointer"
            title="Next Voicemail Track"
          >
            <span className="hidden sm:inline">NEXT</span>
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Manual Delete Active Message Button */}
          <button
            onClick={handleDeleteCurrentMessage}
            disabled={!currentVoicemail}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-300 disabled:opacity-30 font-mono-code text-xs font-medium border border-neutral-800 hover:border-red-800/40 transition-all cursor-pointer ml-1"
            title="Delete currently selected message"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>DELETE</span>
          </button>
        </div>

        {/* Track counter indicator */}
        <div className="flex items-center gap-2 text-xs font-mono-code text-neutral-400">
          <span className="text-neutral-500">VOICEMAILS:</span>
          <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-amber-400 font-bold">
            {voicemails.length > 0 ? `${currentTrackIndex + 1} of ${voicemails.length}` : '0 of 0'}
          </span>
        </div>
      </div>
    </div>
  );
};
