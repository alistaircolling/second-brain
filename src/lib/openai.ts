import OpenAI from 'openai';
import { ClassificationResult } from '@/types';

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CLASSIFICATION_PROMPT = `You are a classification system for a personal task manager. 
Analyze the input and return JSON only, no markdown.

First determine the ACTION:
- "create": User wants to add a new item (default)
- "update": User wants to modify an existing item (e.g., "mark X as done", "change due date on X", "complete X", "set X to done")
- "query": User is asking a question about their items or wants to see items by tag/context

Categories:
- "tasks": General to-do items, DIY tasks, things to order, online admin
- "work": Work-related thoughts, meeting proposals, project tasks. Projects: Mintstars (main job), Rak (side project), Other (specify)
- "people": Follow-ups with specific people, meetings to arrange with someone
- "admin": Appointments, bills, scheduled events

For CREATE actions, extract:
- title: Brief, actionable title. Preserve the original action verb (call, email, text, meet, message, etc.)
- project: (work only) "Mintstars", "Rak", or other project name
- category: (admin only) "Appointments", "Bills", or "Orders"
- person_name: (people only) The person's name
- follow_up: (people only) What action to take
- due_date: ISO date if mentioned or implied (e.g., "tomorrow" = calculate date). Today is ${new Date().toISOString().split('T')[0]}.
- priority: 1 (high), 2 (medium), or 3 (low) - infer from urgency words like "urgent", "asap", "when I get a chance"
- tags: Array of context tags. Known tags: "groceries", "phone", "laptop", "home", "office", "errands". Auto-detect from content:
  - Food/grocery items → "groceries"
  - Call/phone tasks → "phone"  
  - Online/computer tasks → "laptop"
  - Household tasks → "home"
  - Work location tasks → "office"
  - Out-of-house tasks → "errands"
- suggested_tag: If a new tag would be useful (not in known tags), suggest it here
- notes: Any additional context
- needs_clarification: true if the input is vague and would benefit from a follow-up question
- clarification_question: If needs_clarification is true, provide a brief follow-up question

For UPDATE actions, extract:
- update.search_query: Keywords to find the item (e.g., "Post laptop", "Vercel")
- update.field: "status", "due_date", or "priority"
- update.value: The new value (e.g., "Done", "2024-01-25", "3"). Use "remove" to clear a due_date.

For QUERY actions, extract ONE of:
- query.tag: Tag to filter by (e.g., "groceries", "phone", "home") - use for tag/context queries like "what's on my groceries list?", "what calls do I need to make?"
- query.database + query.filter: For general queries like "what's due today?", "show me my work items"
  - database: "tasks", "work", "people", "admin", or "all"
  - filter: "due_today", "overdue", "high_priority", "all_active"

Examples of query detection:
- "what's on my groceries list?" → query.tag: "groceries"
- "what calls do I need to make?" → query.tag: "phone"
- "what can I do at home?" → query.tag: "home"
- "what's due today?" → query.database: "all", query.filter: "due_today"
- "show me my work tasks" → query.database: "work"

Return JSON:
{
  "action": "create" | "update" | "query",
  "destination": "tasks" | "work" | "people" | "admin",
  "confidence": 0.0-1.0,
  "data": { ... },
  "update": { "search_query": "...", "field": "...", "value": "..." },  // only for update action
  "query": { "tag": "...", "database": "...", "filter": "..." }  // only for query action
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

Be concise and actionable.

Use Slack formatting (NOT markdown): *bold*, _italic_, - for bullets`,
    evening: `You are a personal assistant. Given the following tasks and items, create a brief evening review (under 150 words). Focus on:
- List ALL items from the "Completed today" section (do not summarize or skip any)
- Highlight any OVERDUE items (due date before today's date) that need urgent attention
- Any items that need attention tomorrow
Be concise and encouraging.

Use Slack formatting (NOT markdown): *bold*, _italic_, - for bullets`,
    weekly: `You are a personal assistant. Given the following tasks and items, create a weekly review (under 300 words). Focus on:
- Overview of active projects (Mintstars, Rak, etc.)
- Items that have been sitting too long
- People you haven't followed up with
- Suggested priorities for the coming week
Be thorough but actionable.

Use Slack formatting (NOT markdown): *bold*, _italic_, - for bullets`,
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

Group by priority (Priority 1 first, then Priority 2, then Priority 3, then unprioritized).
Show due dates where relevant.
Highlight anything overdue or due today.
Be concise and scannable.

Use Slack formatting (NOT markdown):
- Bold: *text* (single asterisks)
- Italic: _text_
- Bullet points: - item` 
      },
      { role: 'user', content: context }
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || '';
};
