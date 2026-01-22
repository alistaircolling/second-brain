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
- priority: 1 (high), 2 (medium), or 3 (low) - infer from urgency words like "urgent", "asap", "when I get a chance"
- notes: Any additional context
- needs_clarification: true if the input is vague and would benefit from a follow-up question (e.g., missing deadline, unclear action, ambiguous context)
- clarification_question: If needs_clarification is true, provide a brief follow-up question to ask

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
    morning: `You are a personal assistant. Given the following tasks and items, create a brief morning planning message (under 150 words).

Start with: "Good morning! Here's what's on your plate:"

Then list the most essential tasks in order of priority (priority 1 first, then 2, then 3). 
Highlight anything due today or overdue.

End with: "What are your top 3 priorities today? Reply to set your focus."

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

export const generateReview = async (context: string): Promise<string> => {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are a personal assistant. Given the following tasks and items, create a quick review (under 200 words).

Group by priority (P1 first, then P2, then P3, then unprioritized).
Show due dates where relevant.
Highlight anything overdue or due today.
Be concise and scannable.` 
      },
      { role: 'user', content: context }
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || '';
};
