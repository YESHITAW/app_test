import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser limits for audio blobs (base64)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Health & Status check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// API: Transcribe audio & extract voicemail intelligence
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', rawTextHint } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      // Fallback if no API key is provided
      if (rawTextHint) {
        return res.json({
          transcript: rawTextHint,
          summary: 'Caller left a recorded message.',
          sentiment: 'Neutral',
          callerIntent: 'General Inquiry',
          urgency: 'Normal',
          callbackNumber: null,
          callerNameMentioned: null,
          actionRequired: 'Review voicemail recording.',
          keyPoints: ['Recorded via local machine'],
        });
      }
      return res.status(400).json({
        error: 'Gemini API Key is not configured in Settings > Secrets. Voice transcript requires an API key or Web Speech API.',
      });
    }

    if (!audioBase64 && !rawTextHint) {
      return res.status(400).json({ error: 'Missing audio data or text hint.' });
    }

    // Prepare contents
    const parts: any[] = [];
    if (audioBase64) {
      // Clean base64 header if included
      const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: mimeType.split(';')[0] || 'audio/webm',
          data: cleanBase64,
        },
      });
    }

    const promptText = `
You are the AI brain of an automated telephone answering machine.
Transcribe the audio voicemail precisely and provide structured call analysis.
${rawTextHint ? `(Note: Web Speech hint from caller: "${rawTextHint}")` : ''}

Analyze and return JSON matching the schema:
- transcript: exact verbatim transcript of what the caller said
- summary: concise 1-2 sentence overview of the message
- keyPoints: list of key facts, dates, reasons for call
- callerIntent: one of "Personal", "Business Inquiry", "Urgent Matter", "Appointment / Meeting", "Delivery / Courier", "Billing / Financial", "Spam / Telemarketer", "Follow Up"
- sentiment: one of "Positive", "Neutral", "Frustrated", "Urgent", "Friendly", "Formal"
- urgency: one of "Low", "Normal", "High", "Emergency"
- callbackNumber: any phone number mentioned to call back (or null)
- callerNameMentioned: name the caller identified themselves as (or null)
- actionRequired: specific next step needed by the recipient (or null)
`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING, description: 'Verbatim transcript of the voicemail' },
            summary: { type: Type.STRING, description: 'Concise summary of the voicemail' },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key takeaways and mentioned items',
            },
            callerIntent: { type: Type.STRING, description: 'Reason for calling' },
            sentiment: { type: Type.STRING, description: 'Emotional tone' },
            urgency: { type: Type.STRING, description: 'Urgency rating' },
            callbackNumber: { type: Type.STRING, description: 'Phone number to call back, or empty if none', nullable: true },
            callerNameMentioned: { type: Type.STRING, description: 'Name of the caller if stated', nullable: true },
            actionRequired: { type: Type.STRING, description: 'Action item for the recipient', nullable: true },
          },
          required: ['transcript', 'summary', 'keyPoints', 'callerIntent', 'sentiment', 'urgency'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Transcription error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to process audio voicemail transcription',
    });
  }
});

// API: Generate Voice Greeting or Simulated Caller using Gemini 3.8 Flash Lite TTS
app.post('/api/generate-speech', async (req, res) => {
  try {
    const { text, voiceName = 'Kore', style = 'Friendly, professional telephone answering machine greeting' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text prompt is required.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(400).json({
        error: 'Gemini API Key is not configured. You can also record your voice directly with your microphone!',
      });
    }

    // Allowed prebuilt voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = validVoices.includes(voiceName) ? voiceName : 'Kore';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('No audio returned by TTS model');
    }

    // Return complete audio/wav base64 string
    res.json({
      audioUrl: `data:audio/wav;base64,${base64Audio}`,
      base64Audio,
      voiceName: chosenVoice,
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate voice speech',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Answering Machine server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
