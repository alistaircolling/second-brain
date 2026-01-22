import OpenAI from 'openai';
import { ClassificationResult } from '@/types';

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CLASSIFICATION_PROMPT = `You are a classification system for a personal task manager. 
Analyze the input and return JSON only, no markdown.

Categories:
- "tasks": General to-do items, DIY tasks, things to order, online admin
- "work": Work-related thoughts, meeting proposals, project tasks. Projects: Mintstars (main job), Rak (side project), Other (specify)
- "people": Follow-ups with specific people, meetings to arrange with someone
- "admin": Appointments, bills, scheduled events

Extract:
- title: Brief, actionable title
- project: (work only) "Mintstars", "Rak", or other project name
- category: (admin only) "Appointments", "Bills", or "Orders"
- person_name: (people only) The person's name
- follow_up: (people only) What action to take
- due_date: ISO date if mentioned or implied (e.g., "tomorrow" = calculate date)
- notes: Any additional context

Return JSON:
{
  "destination": "tasks" | "work" | "people" | "admin",
  "confidence": 0.0-1.0,
  "data": { ... }
}`;

export const classifyMessage = async (text: string): Promise<ClassificationResult> => {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CLASSIFICATION_PROMPT },
      { role: 'user', content: text }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content!);
};

export const transcribeAudio = async (audioUrl: string): Promise<string> => {
  // Fetch audio from Slack (requires bot token for private URLs)
  const response = await fetch(audioUrl, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  const audioBuffer = await response.arrayBuffer();

  // Create a File object for the API
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

  const transcription = await getOpenAI().audio.transcriptions.create({
    model: 'whisper-1',
    file,
  });

  return transcription.text;
};

export const generateDigest = async (
  type: 'morning' | 'evening' | 'weekly',
  context: string
): Promise<string> => {
  const prompts = {
    morning: `You are a personal assistant. Given the following tasks and items, create a brief morning briefing (under 150 words). Focus on:
- Top 3 priorities for today
- Any due dates today or overdue
- One thing that might be blocked or needs attention
Be concise and actionable.`,
    evening: `You are a personal assistant. Given the following tasks and items, create a brief evening review (under 150 words). Focus on:
- What was captured today
- Any items that need attention tomorrow
- One small win or progress to acknowledge
Be concise and encouraging.`,
    weekly: `You are a personal assistant. Given the following tasks and items, create a weekly review (under 300 words). Focus on:
- Overview of active projects (Mintstars, Rak, etc.)
- Items that have been sitting too long
- People you haven't followed up with
- Suggested priorities for the coming week
Be thorough but actionable.`,
  };

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompts[type] },
      { role: 'user', content: context }
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || '';
};
