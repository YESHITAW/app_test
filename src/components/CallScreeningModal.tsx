import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  PhoneForwarded,
  Volume2,
  VolumeX,
  Mic,
  Disc,
  Radio,
  Sparkles,
  AlertCircle,
  AudioWaveform as Waveform,
  CheckCircle2,
} from 'lucide-react';
import { Greeting, MachineSettings, Voicemail, CallScenario } from '../types';
import { audioEngine } from '../services/audioEngine';
import { LiveSpeechRecognizer, transcribeVoicemailAudio } from '../services/transcriptionService';

export const CALL_SCENARIOS: CallScenario[] = [
  {
    id: 'sc-clinic',
    callerName: 'Dr. Clara Vance (Westside Clinic)',
    callerNumber: '+1 (555) 349-8201',
    callerLocation: 'San Francisco, CA',
    category: 'Medical / Appointment',
    urgency: 'Normal',
    expectedIntent: 'Appointment / Meeting',
    script:
      "Hello! This is Dr. Vance's office calling to confirm your annual cardiology checkup scheduled for Thursday at 2:30 PM. Please bring your latest lab results with you. Please call us back at 555-349-8201 if you need to adjust this appointment. Thank you and have a wonderful day!",
  },
  {
    id: 'sc-courier',
    callerName: 'Dispatch Courier (Priority Express)',
    callerNumber: '+1 (800) 412-9980',
    callerLocation: 'Distribution Center',
    category: 'Package Delivery',
    urgency: 'High',
    expectedIntent: 'Delivery / Courier',
    script:
      'Hi, this is Marco from Priority Couriers. We have a signature-required parcel #PX-9821 out for delivery. Nobody was available at the front door. We will attempt redelivery tomorrow morning between 10 AM and noon. You can also authorize depot release by calling 800-412-9980.',
  },
  {
    id: 'sc-recruiter',
    callerName: 'Sarah Jenkins (Apex Search)',
    callerNumber: '+1 (415) 890-2341',
    callerLocation: 'Palo Alto, CA',
    category: 'Job Opportunity',
    urgency: 'Normal',
    expectedIntent: 'Business Inquiry',
    script:
      "Hi there! Sarah from Apex Search reaching out regarding the Principal Systems Architect opening you applied for. The team reviewed your background and was very impressed. We'd love to schedule a 30-minute introductory sync this week. Please call or text me back at 415-890-2341.",
  },
  {
    id: 'sc-neighbor',
    callerName: 'Dave (Upstairs Neighbor)',
    callerNumber: '+1 (555) 671-8890',
    callerLocation: 'Apartment 4B',
    category: 'Personal / Urgent',
    urgency: 'High',
    expectedIntent: 'Urgent Matter',
    script:
      'Hey, it is Dave from upstairs! Quick heads up, the building superintendent is shutting off water in the main riser for an hour starting at 3 PM for emergency pipe repairs. Just wanted to let you know before it goes off!',
  },
  {
    id: 'sc-emergency',
    callerName: 'Bank Security Fraud Alert',
    callerNumber: '+1 (888) 901-7722',
    callerLocation: 'Fraud Prevention Center',
    category: 'Security / Financial',
    urgency: 'Emergency',
    expectedIntent: 'Billing / Financial',
    script:
      'Urgent notification from Cardholder Protection Services. We detected an unusual transaction of $840 at an electronics merchant on your card ending in 4109. Please call our automated fraud hotline immediately at 888-901-7722 to verify or decline this charge.',
  },
];

interface CallScreeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGreeting: Greeting;
  settings: MachineSettings;
  onVoicemailCompleted: (voicemail: Voicemail) => void;
  initialScenario?: CallScenario | null;
}

type CallPhase =
  | 'ringing'
  | 'answering'
  | 'greeting'
  | 'beep'
  | 'recording'
  | 'intercepted'
  | 'saving';

export const CallScreeningModal: React.FC<CallScreeningModalProps> = ({
  isOpen,
  onClose,
  activeGreeting,
  settings,
  onVoicemailCompleted,
  initialScenario,
}) => {
  const [phase, setPhase] = useState<CallPhase>('ringing');
  const [ringCount, setRingCount] = useState(0);
  const [callerName, setCallerName] = useState(initialScenario?.callerName || 'Incoming Caller');
  const [callerNumber, setCallerNumber] = useState(initialScenario?.callerNumber || '+1 (555) 234-5678');
  const [selectedScenario, setSelectedScenario] = useState<CallScenario | null>(
    initialScenario || CALL_SCENARIOS[0]
  );
  const [inputMode, setInputMode] = useState<'scenario' | 'microphone'>('scenario');

  // Speaker Monitor (Caller Listening)
  const [isSpeakerMonitorMuted, setIsSpeakerMonitorMuted] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveVolume, setLiveVolume] = useState(0);

  const speechRecognizerRef = useRef<LiveSpeechRecognizer | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const audioGreetingRef = useRef<HTMLAudioElement | null>(null);

  // Initialize call when modal opens
  useEffect(() => {
    if (!isOpen) {
      cleanupCall();
      return;
    }

    startIncomingCall();

    return () => {
      cleanupCall();
    };
  }, [isOpen]);

  const cleanupCall = () => {
    audioEngine.stopTelephoneRing();
    audioEngine.stopAllSpeech();
    if (audioGreetingRef.current) {
      audioGreetingRef.current.pause();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (speechRecognizerRef.current) {
      speechRecognizerRef.current.stop();
      speechRecognizerRef.current = null;
    }
  };

  const startIncomingCall = () => {
    setPhase('ringing');
    setRingCount(1);
    setRecordingSeconds(0);
    setLiveTranscript('');
    setIsSpeakerMonitorMuted(false);

    audioEngine.startTelephoneRing();

    // Rings before answering logic
    const ringsToAnswer = settings.ringsBeforeAnswer === 0 ? 2 : settings.ringsBeforeAnswer;
    let currentRings = 1;

    const ringInterval = setInterval(() => {
      currentRings++;
      setRingCount(currentRings);

      if (currentRings >= ringsToAnswer) {
        clearInterval(ringInterval);
        triggerPickup();
      }
    }, 2800);
  };

  // Machine picks up after rings
  const triggerPickup = () => {
    audioEngine.stopTelephoneRing();
    audioEngine.playMechanicalClick('clunk');
    setPhase('answering');

    setTimeout(() => {
      playGreetingPhase();
    }, 600);
  };

  // Machine plays greeting audio to caller
  const playGreetingPhase = () => {
    setPhase('greeting');

    if (activeGreeting.audioUrl) {
      const audio = new Audio(activeGreeting.audioUrl);
      audioGreetingRef.current = audio;
      audio.volume = isSpeakerMonitorMuted ? 0 : settings.speakerMonitorVolume;
      audio.play().catch(() => {});

      audio.onended = () => {
        triggerBeepPhase();
      };
    } else {
      // Offline fallback: speak text or wait duration
      audioEngine.speakTextOffline(activeGreeting.text, activeGreeting.voiceName).then(() => {
        triggerBeepPhase();
      });
    }
  };

  // Answering machine emits beep and opens recording line
  const triggerBeepPhase = async () => {
    setPhase('beep');
    await audioEngine.playBeep(settings.beepType);
    startCallerRecording();
  };

  // Caller starts leaving message (Live Caller Listening!)
  const startCallerRecording = async () => {
    setPhase('recording');
    audioEngine.playMechanicalClick('clunk');

    // Start Live Speech Recognition for real-time live captions
    const recognizer = new LiveSpeechRecognizer();
    speechRecognizerRef.current = recognizer;
    recognizer.start((caption) => {
      setLiveTranscript(caption);
    });

    // Timer for message duration
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((s) => {
        if (s >= settings.maxRecordingSeconds) {
          handleCallerHangup();
          return s;
        }
        return s + 1;
      });
    }, 1000);

    if (inputMode === 'microphone') {
      // Record real user voice from microphone
      try {
        await audioEngine.startMicrophoneRecording((vol) => {
          setLiveVolume(vol);
        });
      } catch (e) {
        console.warn('Mic not available for caller simulator');
      }
    } else if (selectedScenario) {
      // Simulate caller speech using Web Speech synthesis or Gemini TTS
      const scriptToSpeak = selectedScenario.script;
      setLiveTranscript(scriptToSpeak);

      // Play through speaker monitor if not muted
      if (!isSpeakerMonitorMuted) {
        audioEngine.speakTextOffline(scriptToSpeak);
      }

      // Simulate volume fluctuations
      const volInterval = setInterval(() => {
        setLiveVolume(Math.random() * 0.7 + 0.2);
      }, 200);

      // Finish when scenario concludes
      const approxDuration = Math.min(
        settings.maxRecordingSeconds,
        Math.max(10, Math.round(scriptToSpeak.split(' ').length / 2.6))
      );

      setTimeout(() => {
        clearInterval(volInterval);
        setLiveVolume(0);
        handleCallerHangup();
      }, approxDuration * 1000);
    }
  };

  // Caller finishes leaving message & hangs up
  const handleCallerHangup = async () => {
    if (phase === 'saving' || phase === 'intercepted') return;

    cleanupCall();
    setPhase('saving');

    let audioBlob: Blob | undefined;
    if (inputMode === 'microphone') {
      try {
        const res = await audioEngine.stopMicrophoneRecording();
        audioBlob = res.blob;
      } catch (e) {
        // ignore
      }
    }

    const transcriptHint =
      liveTranscript || (selectedScenario ? selectedScenario.script : 'Voicemail recording completed.');

    // Automated transcription & intelligence extraction via Gemini
    try {
      const result = await transcribeVoicemailAudio(audioBlob, undefined, transcriptHint);

      const newVoicemail: Voicemail = {
        id: `vm-${Date.now()}`,
        callerName,
        callerNumber,
        callerLocation: selectedScenario?.callerLocation || 'Unknown Region',
        timestamp: Date.now(),
        duration: recordingSeconds || (selectedScenario ? 20 : 15),
        status: 'new',
        audioBlob,
        audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
        transcript: result.transcript,
        summary: result.summary,
        sentiment: result.sentiment,
        urgency: result.urgency,
        callerIntent: result.callerIntent,
        keyPoints: result.keyPoints,
        callbackNumber: result.callbackNumber || callerNumber,
        actionRequired: result.actionRequired,
      };

      onVoicemailCompleted(newVoicemail);
      onClose();
    } catch (err) {
      console.error(err);
      onClose();
    }
  };

  // "Pick Up / Intercept Handset"
  const handleInterceptCall = () => {
    audioEngine.playMechanicalClick('clunk');
    audioEngine.stopAllSpeech();
    cleanupCall();
    setPhase('intercepted');

    const interceptedVoicemail: Voicemail = {
      id: `vm-intercept-${Date.now()}`,
      callerName,
      callerNumber,
      callerLocation: selectedScenario?.callerLocation || 'Incoming Handset',
      timestamp: Date.now(),
      duration: recordingSeconds,
      status: 'intercepted',
      transcript: `[CALL INTERCEPTED LIVE AT ${recordingSeconds} SECONDS] Caller was speaking: "${liveTranscript}"`,
      summary: `Call intercepted live by user after ${recordingSeconds}s of caller screening.`,
      sentiment: 'Neutral',
      urgency: selectedScenario?.urgency || 'Normal',
      callerIntent: 'Call Handset Intercepted',
      keyPoints: ['Caller screened on speaker', 'Handset picked up to talk live'],
      callbackNumber: callerNumber,
      actionRequired: 'Spoke directly with caller.',
    };

    onVoicemailCompleted(interceptedVoicemail);

    setTimeout(() => {
      onClose();
    }, 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border-2 border-amber-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl shadow-amber-950/40 space-y-6 relative overflow-hidden text-neutral-100">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                phase === 'ringing'
                  ? 'bg-amber-500 text-neutral-950 animate-bounce'
                  : phase === 'recording'
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-neutral-800 text-amber-400'
              }`}
            >
              <Phone className="w-5 h-5 fill-current" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-tech text-base font-bold uppercase tracking-wider">
                  Live Answering Machine Screen
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-code font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  {phase}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-mono-code">Caller Listening & Live Screening</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-1.5 rounded-lg hover:bg-neutral-800 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Caller ID Display (Retro LCD style) */}
        <div className="bg-neutral-950 border-2 border-neutral-800 rounded-2xl p-4 shadow-inner relative overflow-hidden">
          <div className="flex items-center justify-between text-[11px] font-mono-code text-neutral-500 mb-1">
            <span>CALLER IDENTIFICATION</span>
            <span className="text-amber-500">LINE 1 IN USE</span>
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <div className="font-tech text-xl font-bold text-neutral-100">{callerName}</div>
              <div className="font-mono-code text-sm text-amber-400 font-semibold">{callerNumber}</div>
            </div>

            <div className="text-right">
              {phase === 'ringing' && (
                <div className="font-digital text-3xl text-amber-400 text-glow-amber animate-pulse">
                  RINGING... ({ringCount})
                </div>
              )}

              {phase === 'greeting' && (
                <div className="font-digital text-2xl text-cyan-400 text-glow-cyan">
                  PLAYING GREETING
                </div>
              )}

              {phase === 'recording' && (
                <div className="font-digital text-3xl text-red-500 text-glow-red">
                  REC {Math.floor(recordingSeconds / 60)}:
                  {recordingSeconds % 60 < 10 ? '0' : ''}
                  {recordingSeconds % 60}
                </div>
              )}

              {phase === 'intercepted' && (
                <div className="font-digital text-2xl text-emerald-400 text-glow-green">
                  HANDSET PICKED UP!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CALLER LISTENING / LIVE CALL SCREENING INTERFACE */}
        {phase === 'recording' && (
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono-code text-cyan-400 font-bold">
                <Volume2 className="w-4 h-4 animate-pulse" />
                <span>SPEAKER MONITOR (CALL SCREENING ACTIVE)</span>
              </div>

              {/* Mute speaker button */}
              <button
                onClick={() => {
                  setIsSpeakerMonitorMuted(!isSpeakerMonitorMuted);
                  if (isSpeakerMonitorMuted) {
                    audioEngine.speakTextOffline(liveTranscript);
                  } else {
                    audioEngine.stopAllSpeech();
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono-code flex items-center gap-1.5 border transition-all cursor-pointer ${
                  isSpeakerMonitorMuted
                    ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                }`}
              >
                {isSpeakerMonitorMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isSpeakerMonitorMuted ? 'Monitor Muted' : 'Listening Live'}</span>
              </button>
            </div>

            {/* Live Audio Volume Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono-code text-neutral-500">
                <span>INCOMING AUDIO LEVEL</span>
                <span>{Math.round(liveVolume * 100)}%</span>
              </div>
              <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 h-full transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(10, liveVolume * 120))}%` }}
                />
              </div>
            </div>

            {/* Live Automated Transcript Preview */}
            <div className="space-y-1">
              <span className="text-[11px] font-mono-code text-amber-400 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>REAL-TIME CALLER TRANSCRIPT:</span>
              </span>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-200 min-h-[60px] max-h-24 overflow-y-auto italic leading-relaxed">
                {liveTranscript || 'Caller is speaking into the answering machine...'}
              </div>
            </div>
          </div>
        )}

        {/* INTERCEPT / PICK UP CONTROLS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {phase === 'recording' && (
            <>
              {/* The Star Feature: Pick Up / Intercept Handset Button */}
              <button
                onClick={handleInterceptCall}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-tech font-bold text-sm tracking-wider uppercase shadow-xl shadow-emerald-950/60 border border-emerald-400 transition-all active:scale-95 cursor-pointer"
                title="Pick up the telephone handset and talk directly to the caller live"
              >
                <PhoneForwarded className="w-4 h-4" />
                <span>PICK UP / INTERCEPT CALL</span>
              </button>

              {/* Let Go to Voicemail Button */}
              <button
                onClick={handleCallerHangup}
                className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono-code text-xs font-semibold border border-neutral-700 transition-all cursor-pointer"
                title="Caller hangs up and saves message"
              >
                <span>Caller Hang Up (Save Voicemail)</span>
              </button>
            </>
          )}

          {phase === 'ringing' && (
            <div className="w-full flex items-center justify-between text-xs font-mono-code text-neutral-400">
              <span>Answering machine will pick up after ring {settings.ringsBeforeAnswer}...</span>
              <button
                onClick={triggerPickup}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs cursor-pointer"
              >
                Pick Up Now
              </button>
            </div>
          )}

          {phase === 'saving' && (
            <div className="w-full text-center py-2 text-xs font-mono-code text-amber-400 flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Transcribing audio & saving to local IndexedDB storage...</span>
            </div>
          )}

          {phase === 'intercepted' && (
            <div className="w-full text-center py-2 text-xs font-mono-code text-emerald-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Handset active. Logged as intercepted call.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
