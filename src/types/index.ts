export type CallUrgency = 'Low' | 'Normal' | 'High' | 'Emergency';
export type CallSentiment = 'Positive' | 'Neutral' | 'Frustrated' | 'Urgent' | 'Friendly' | 'Formal' | 'Inquiry';
export type CallStatus = 'new' | 'listened' | 'archived' | 'intercepted';

export interface Voicemail {
  id: string;
  callerName: string;
  callerNumber: string;
  callerLocation?: string;
  timestamp: number;
  duration: number; // in seconds
  status: CallStatus;
  audioBlob?: Blob;
  audioUrl?: string; // base64 or blob URL
  transcript: string;
  summary: string;
  sentiment: CallSentiment;
  urgency: CallUrgency;
  callerIntent?: string;
  keyPoints?: string[];
  callbackNumber?: string | null;
  actionRequired?: string | null;
  isFlagged?: boolean;
}

export interface Greeting {
  id: string;
  title: string;
  category: 'standard' | 'business' | 'after_hours' | 'vacation' | 'retro' | 'custom';
  text: string;
  voiceType: 'recorded' | 'tts' | 'preset';
  voiceName?: string;
  audioBlob?: Blob;
  audioUrl?: string;
  duration?: number;
  createdAt: number;
  isDefault?: boolean;
}

export interface MachineSettings {
  ringsBeforeAnswer: number; // 2, 4, 6, or toll-saver (0)
  maxRecordingSeconds: number; // 30, 60, 120, 180
  beepType: 'classic-1000hz' | 'high-chirp' | 'double-tone' | 'retro-80s' | 'soft-chime';
  speakerMonitorVolume: number; // 0 to 1
  tapeFilterEffect: boolean; // simulated analog tape hiss & bandpass
  activeGreetingId: string;
  callScreeningEnabled: boolean;
  autoTranscribe: boolean;
  offlineModeOnly: boolean;
  autoDeleteAfterPlayback: boolean;
}

export interface StorageStats {
  usedBytes: number;
  totalQuotaBytes: number;
  percentageUsed: number;
  messageCount: number;
  greetingCount: number;
}

export interface CallScenario {
  id: string;
  callerName: string;
  callerNumber: string;
  callerLocation: string;
  category: string;
  script: string;
  urgency: CallUrgency;
  expectedIntent: string;
}
