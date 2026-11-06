import { blobToBase64 } from './storage';

export interface TranscriptionResult {
  transcript: string;
  summary: string;
  sentiment: 'Positive' | 'Neutral' | 'Frustrated' | 'Urgent' | 'Friendly' | 'Formal';
  urgency: 'Low' | 'Normal' | 'High' | 'Emergency';
  callerIntent?: string;
  keyPoints?: string[];
  callbackNumber?: string | null;
  callerNameMentioned?: string | null;
  actionRequired?: string | null;
}

// Live client-side speech recognition listener for live call screening captions
export class LiveSpeechRecognizer {
  private recognition: any = null;
  private isListening = false;
  private currentTranscript = '';
  private onUpdateCallback: ((text: string) => void) | null = null;

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        let fullText = '';
        for (let i = 0; i < event.results.length; ++i) {
          fullText += event.results[i][0].transcript;
        }
        this.currentTranscript = fullText;
        if (this.onUpdateCallback) {
          this.onUpdateCallback(fullText);
        }
      };

      this.recognition.onerror = () => {
        // Continue silently
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            // ignore
          }
        }
      };
    }
  }

  start(onUpdate: (text: string) => void) {
    if (!this.recognition) return;
    this.currentTranscript = '';
    this.onUpdateCallback = onUpdate;
    this.isListening = true;
    try {
      this.recognition.start();
    } catch (e) {
      // already started or blocked
    }
  }

  stop(): string {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    return this.currentTranscript;
  }

  getTranscript(): string {
    return this.currentTranscript;
  }
}

// Request AI transcription from server or fallback locally
export async function transcribeVoicemailAudio(
  audioBlob?: Blob,
  audioBase64?: string,
  rawTextHint?: string
): Promise<TranscriptionResult> {
  let b64 = audioBase64;

  if (!b64 && audioBlob) {
    b64 = await blobToBase64(audioBlob);
  }

  const mimeType = audioBlob?.type || 'audio/webm';

  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: b64,
        mimeType,
        rawTextHint,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    return {
      transcript: data.transcript || rawTextHint || 'Audio recorded on answering machine.',
      summary: data.summary || 'Caller left a recorded voicemail message.',
      sentiment: data.sentiment || 'Neutral',
      urgency: data.urgency || 'Normal',
      callerIntent: data.callerIntent || 'General Call',
      keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
      callbackNumber: data.callbackNumber || null,
      callerNameMentioned: data.callerNameMentioned || null,
      actionRequired: data.actionRequired || null,
    };
  } catch (error: any) {
    console.warn('Backend transcription unavailable, using client fallback:', error);
    // Offline / fallback heuristic synthesis
    const fallbackText = rawTextHint || 'Message received. Voice recording preserved in offline storage.';
    return {
      transcript: fallbackText,
      summary: rawTextHint
        ? `Voicemail message: "${rawTextHint.slice(0, 80)}..."`
        : 'Recorded audio voicemail stored in local machine memory.',
      sentiment: 'Neutral',
      urgency: 'Normal',
      callerIntent: 'General Call',
      keyPoints: ['Recorded on answering machine', 'Saved to offline IndexedDB storage'],
      callbackNumber: null,
      callerNameMentioned: null,
      actionRequired: 'Listen to audio message playback.',
    };
  }
}
