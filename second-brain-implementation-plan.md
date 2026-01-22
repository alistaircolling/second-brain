# Second Brain Implementation Plan

## Overview

A personal capture system that lets you drop thoughts/tasks into Slack (text or voice), automatically classifies and files them to Notion, sends you digests, and allows corrections via reply.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Slack (text    │ ──── │  Vercel Edge    │ ──── │    Notion       │
│  or voice msg)  │      │  Functions      │      │   Databases     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                │
                                │
                         ┌──────┴──────┐
                         │   OpenAI    │
                         │ GPT-4o-mini │
                         │   Whisper   │
                         └─────────────┘
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Next.js (API routes for Slack webhooks, cron for digests)
- **Hosting**: Vercel
- **Storage**: Notion (via @notionhq/client)
- **AI**: OpenAI (gpt-4o-mini for classification, whisper-1 for transcription)
- **Slack**: @slack/web-api + @slack/events-api

## Notion Setup (One-Time Manual Step)

Create these databases in Notion, then grab their IDs for your env vars.

### 1. Tasks Database
| Property   | Type           | Options/Notes                    |
|------------|----------------|----------------------------------|
| Title      | Title          |                                  |
| Status     | Select         | To Do, In Progress, Done         |
| Due Date   | Date           |                                  |
| Notes      | Rich Text      |                                  |
| Created At | Created Time   | Auto-filled                      |

### 2. Work Database
| Property   | Type           | Options/Notes                    |
|------------|----------------|----------------------------------|
| Title      | Title          |                                  |
| Project    | Select         | Mintstars, Rak, Other            |
| Status     | Select         | To Do, In Progress, Done         |
| Due Date   | Date           |                                  |
| Notes      | Rich Text      |                                  |
| Created At | Created Time   | Auto-filled                      |

### 3. People Database
| Property       | Type           | Options/Notes                |
|----------------|----------------|------------------------------|
| Name           | Title          |                              |
| Follow-up      | Rich Text      |                              |
| Due Date       | Date           |                              |
| Notes          | Rich Text      |                              |
| Created At     | Created Time   | Auto-filled                  |

### 4. Admin Database
| Property   | Type           | Options/Notes                    |
|------------|----------------|----------------------------------|
| Title      | Title          |                                  |
| Category   | Select         | Appointments, Bills, Orders      |
| Due Date   | Date           |                                  |
| Notes      | Rich Text      |                                  |
| Created At | Created Time   | Auto-filled                      |

### 5. Inbox Log Database
| Property       | Type           | Notes                            |
|----------------|----------------|----------------------------------|
| Original Text  | Title          |                                  |
| Destination    | Select         | Tasks, Work, People, Admin       |
| Confidence     | Number         | 0.0 - 1.0                        |
| Slack TS       | Rich Text      | Thread timestamp for fix flow    |
| Status         | Select         | Filed, Fixed, Needs Review       |
| Filed To ID    | Rich Text      | Notion page ID of created record |
| Created At     | Created Time   | Auto-filled                      |

## Project Structure

```
second-brain/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── slack/
│   │       │   └── events/
│   │       │       └── route.ts       # Slack event webhook
│   │       └── cron/
│   │           ├── morning-digest/
│   │           │   └── route.ts       # 8am daily
│   │           ├── evening-digest/
│   │           │   └── route.ts       # 8pm daily
│   │           └── weekly-review/
│   │               └── route.ts       # Sunday 3pm
│   ├── lib/
│   │   ├── slack.ts                   # Slack client + helpers
│   │   ├── notion.ts                  # Notion client + CRUD
│   │   ├── openai.ts                  # Classification + transcription
│   │   ├── classifier.ts              # Main classification logic
│   │   └── digest.ts                  # Digest generation
│   └── types/
│       └── index.ts                   # Shared types
├── .env.local
├── package.json
├── tsconfig.json
└── vercel.json
```

## Environment Variables

```env
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_INBOX_CHANNEL_ID=your-channel-id

# Notion
NOTION_API_KEY=ntn_your-notion-api-key
NOTION_TASKS_DB_ID=your-tasks-db-id
NOTION_WORK_DB_ID=your-work-db-id
NOTION_PEOPLE_DB_ID=your-people-db-id
NOTION_ADMIN_DB_ID=your-admin-db-id
NOTION_INBOX_LOG_DB_ID=your-inbox-log-db-id

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Your Slack user ID (for DMs)
SLACK_USER_ID=your-slack-user-id
```

## Core Implementation

### 1. Slack Event Handler (`src/app/api/slack/events/route.ts`)

Handles two event types:
- `message` — text posted to your inbox channel
- `file_shared` — voice message uploaded

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack';
import { processCapture } from '@/lib/classifier';
import { transcribeAudio } from '@/lib/openai';
import { getSlackClient } from '@/lib/slack';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const payload = JSON.parse(body);

  // Handle Slack URL verification challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Verify request is from Slack
  const isValid = await verifySlackRequest(req, body);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = payload.event;

  // Ignore bot messages and message edits
  if (event.bot_id || event.subtype) {
    return NextResponse.json({ ok: true });
  }

  // Handle fix replies (messages in threads starting with "fix:")
  if (event.thread_ts && event.text?.toLowerCase().startsWith('fix:')) {
    await handleFix(event);
    return NextResponse.json({ ok: true });
  }

  // Handle voice messages
  if (event.type === 'message' && event.files?.[0]?.mimetype?.startsWith('audio/')) {
    const audioUrl = event.files[0].url_private;
    const transcript = await transcribeAudio(audioUrl);
    await processCapture(transcript, event.ts, event.channel);
    return NextResponse.json({ ok: true });
  }

  // Handle text messages
  if (event.type === 'message' && event.channel === process.env.SLACK_INBOX_CHANNEL_ID) {
    await processCapture(event.text, event.ts, event.channel);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
```

### 2. Classification Logic (`src/lib/classifier.ts`)

```typescript
import { classifyMessage } from './openai';
import { createNotionRecord, createInboxLogEntry, updateInboxLogEntry } from './notion';
import { sendSlackReply } from './slack';

interface ClassificationResult {
  destination: 'tasks' | 'work' | 'people' | 'admin';
  confidence: number;
  data: {
    title: string;
    project?: string;        // For work items
    category?: string;       // For admin items
    person_name?: string;    // For people items
    follow_up?: string;
    due_date?: string;       // ISO date if detected
    notes?: string;
  };
}

export async function processCapture(
  text: string,
  slackTs: string,
  channel: string
): Promise<void> {
  // Classify the message
  const result = await classifyMessage(text);

  // If confidence is below threshold, ask for clarification
  if (result.confidence < 0.7) {
    await createInboxLogEntry({
      originalText: text,
      destination: result.destination,
      confidence: result.confidence,
      slackTs,
      status: 'Needs Review',
    });

    await sendSlackReply(
      channel,
      slackTs,
      `I'm not confident about this one (${Math.round(result.confidence * 100)}%). ` +
      `I think it's: *${result.destination}*. Reply with \`fix: <category>\` if wrong.\n` +
      `Categories: tasks, work, people, admin`
    );
    return;
  }

  // Create the record in the appropriate database
  const recordId = await createNotionRecord(result.destination, result.data);

  // Log to inbox
  await createInboxLogEntry({
    originalText: text,
    destination: result.destination,
    confidence: result.confidence,
    slackTs,
    status: 'Filed',
    filedToId: recordId,
  });

  // Confirm in Slack
  await sendSlackReply(
    channel,
    slackTs,
    `✓ Filed to *${result.destination}*: ${result.data.title}` +
    (result.data.due_date ? ` (due: ${result.data.due_date})` : '') +
    `\nReply \`fix: <category>\` if wrong.`
  );
}
```

### 3. OpenAI Integration (`src/lib/openai.ts`)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function classifyMessage(text: string): Promise<ClassificationResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CLASSIFICATION_PROMPT },
      { role: 'user', content: text }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,  // Low temperature for consistent classification
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  // Fetch audio from Slack (requires bot token for private URLs)
  const response = await fetch(audioUrl, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  const audioBuffer = await response.arrayBuffer();

  // Create a File object for the API
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  });

  return transcription.text;
}

export async function generateDigest(
  type: 'morning' | 'evening' | 'weekly',
  context: string
): Promise<string> {
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompts[type] },
      { role: 'user', content: context }
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || '';
}
```

### 4. Notion Integration (`src/lib/notion.ts`)

```typescript
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB_IDS = {
  tasks: process.env.NOTION_TASKS_DB_ID!,
  work: process.env.NOTION_WORK_DB_ID!,
  people: process.env.NOTION_PEOPLE_DB_ID!,
  admin: process.env.NOTION_ADMIN_DB_ID!,
  inboxLog: process.env.NOTION_INBOX_LOG_DB_ID!,
};

export async function createNotionRecord(
  destination: keyof typeof DB_IDS,
  data: Record<string, any>
): Promise<string> {
  const properties = buildProperties(destination, data);

  const page = await notion.pages.create({
    parent: { database_id: DB_IDS[destination] },
    properties,
  });

  return page.id;
}

function buildProperties(destination: string, data: Record<string, any>) {
  const base: Record<string, any> = {
    Status: { select: { name: 'To Do' } },
  };

  if (data.due_date) {
    base['Due Date'] = { date: { start: data.due_date } };
  }

  if (data.notes) {
    base['Notes'] = { rich_text: [{ text: { content: data.notes } }] };
  }

  switch (destination) {
    case 'tasks':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        ...base,
      };

    case 'work':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        Project: { select: { name: data.project || 'Other' } },
        ...base,
      };

    case 'people':
      return {
        Name: { title: [{ text: { content: data.person_name || data.title } }] },
        'Follow-up': { rich_text: [{ text: { content: data.follow_up || '' } }] },
        ...base,
      };

    case 'admin':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        Category: { select: { name: data.category || 'Appointments' } },
        ...base,
      };

    default:
      return base;
  }
}

export async function createInboxLogEntry(entry: {
  originalText: string;
  destination: string;
  confidence: number;
  slackTs: string;
  status: string;
  filedToId?: string;
}): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB_IDS.inboxLog },
    properties: {
      'Original Text': { title: [{ text: { content: entry.originalText } }] },
      Destination: { select: { name: entry.destination } },
      Confidence: { number: entry.confidence },
      'Slack TS': { rich_text: [{ text: { content: entry.slackTs } }] },
      Status: { select: { name: entry.status } },
      'Filed To ID': { rich_text: [{ text: { content: entry.filedToId || '' } }] },
    },
  });

  return page.id;
}

export async function queryDatabase(
  database: keyof typeof DB_IDS,
  filter?: any
): Promise<any[]> {
  const response = await notion.databases.query({
    database_id: DB_IDS[database],
    filter,
  });

  return response.results;
}

export async function getActiveItems(): Promise<{
  tasks: any[];
  work: any[];
  people: any[];
  admin: any[];
}> {
  const notDoneFilter = {
    property: 'Status',
    select: { does_not_equal: 'Done' },
  };

  const [tasks, work, people, admin] = await Promise.all([
    queryDatabase('tasks', notDoneFilter),
    queryDatabase('work', notDoneFilter),
    queryDatabase('people', notDoneFilter),
    queryDatabase('admin', notDoneFilter),
  ]);

  return { tasks, work, people, admin };
}

export async function findInboxLogBySlackTs(slackTs: string): Promise<any | null> {
  const response = await notion.databases.query({
    database_id: DB_IDS.inboxLog,
    filter: {
      property: 'Slack TS',
      rich_text: { equals: slackTs },
    },
  });

  return response.results[0] || null;
}

export async function updateInboxLogEntry(
  pageId: string,
  updates: Record<string, any>
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: updates,
  });
}
```

### 5. Slack Integration (`src/lib/slack.ts`)

```typescript
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export function getSlackClient() {
  return slack;
}

export async function sendSlackReply(
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text,
  });
}

export async function sendSlackDM(text: string): Promise<void> {
  await slack.chat.postMessage({
    channel: process.env.SLACK_USER_ID!,
    text,
  });
}

export async function verifySlackRequest(
  req: Request,
  body: string
): Promise<boolean> {
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestamp || !signature) return false;

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET!)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}
```

### 6. Fix Flow Handler

Add to `src/lib/classifier.ts`:

```typescript
export async function handleFix(event: any): Promise<void> {
  const fixMatch = event.text.match(/^fix:\s*(\w+)/i);
  if (!fixMatch) return;

  const newDestination = fixMatch[1].toLowerCase() as 'tasks' | 'work' | 'people' | 'admin';
  const validDestinations = ['tasks', 'work', 'people', 'admin'];

  if (!validDestinations.includes(newDestination)) {
    await sendSlackReply(
      event.channel,
      event.thread_ts,
      `Invalid category. Use one of: ${validDestinations.join(', ')}`
    );
    return;
  }

  // Find the original inbox log entry
  const inboxEntry = await findInboxLogBySlackTs(event.thread_ts);
  if (!inboxEntry) {
    await sendSlackReply(
      event.channel,
      event.thread_ts,
      `Couldn't find the original message to fix.`
    );
    return;
  }

  // Re-classify with forced destination
  const originalText = inboxEntry.properties['Original Text'].title[0].text.content;
  const result = await classifyMessage(originalText);
  result.destination = newDestination;

  // Create new record in correct database
  const recordId = await createNotionRecord(newDestination, result.data);

  // Update inbox log
  await updateInboxLogEntry(inboxEntry.id, {
    Destination: { select: { name: newDestination } },
    Status: { select: { name: 'Fixed' } },
    'Filed To ID': { rich_text: [{ text: { content: recordId } }] },
  });

  await sendSlackReply(
    event.channel,
    event.thread_ts,
    `✓ Fixed! Moved to *${newDestination}*: ${result.data.title}`
  );
}
```

### 7. Digest Cron Jobs

`src/app/api/cron/morning-digest/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getActiveItems } from '@/lib/notion';
import { generateDigest } from '@/lib/openai';
import { sendSlackDM } from '@/lib/slack';

export async function GET(req: Request) {
  // Verify cron secret (set in Vercel)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const items = await getActiveItems();
  
  const context = `
Tasks (${items.tasks.length}):
${formatItems(items.tasks)}

Work (${items.work.length}):
${formatItems(items.work)}

People to follow up with (${items.people.length}):
${formatItems(items.people)}

Admin (${items.admin.length}):
${formatItems(items.admin)}
  `.trim();

  const digest = await generateDigest('morning', context);
  
  await sendSlackDM(`☀️ *Morning Briefing*\n\n${digest}`);

  return NextResponse.json({ ok: true });
}

function formatItems(items: any[]): string {
  return items
    .slice(0, 10)  // Limit to avoid huge context
    .map(item => {
      const title = item.properties.Title?.title?.[0]?.text?.content 
        || item.properties.Name?.title?.[0]?.text?.content 
        || 'Untitled';
      const dueDate = item.properties['Due Date']?.date?.start;
      return `- ${title}${dueDate ? ` (due: ${dueDate})` : ''}`;
    })
    .join('\n');
}
```

Create similar files for evening and weekly digests.

### 8. Vercel Configuration

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/morning-digest",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/evening-digest",
      "schedule": "0 20 * * *"
    },
    {
      "path": "/api/cron/weekly-review",
      "schedule": "0 15 * * 0"
    }
  ]
}
```

Note: Cron times are in UTC. Adjust for your timezone.

## Slack App Setup

1. Go to https://api.slack.com/apps and create a new app
2. Enable these Bot Token Scopes:
   - `channels:history` (read messages)
   - `channels:read`
   - `chat:write` (post replies)
   - `files:read` (access voice messages)
   - `im:write` (send DMs)
3. Enable Event Subscriptions:
   - Request URL: `https://your-vercel-app.vercel.app/api/slack/events`
   - Subscribe to: `message.channels`, `file_shared`
4. Install to your workspace
5. Create a private channel (e.g., `#second-brain`) and invite the bot

## Cost Estimate

| Service | Usage | Cost |
|---------|-------|------|
| GPT-4o-mini | ~100 classifications/day | ~$0.02/day |
| Whisper | ~10 min audio/day | ~$0.06/day |
| Digests | 3/day | ~$0.01/day |
| **Total** | | **~$3/month** |

## Build Order

1. Set up the Notion databases (manual, one-time)
2. Create the Slack app and get credentials
3. Scaffold Next.js project with TypeScript
4. Implement Notion integration and test CRUD
5. Implement OpenAI classification and test
6. Implement Slack webhook and test text capture
7. Add voice transcription
8. Add fix flow
9. Add digests
10. Deploy to Vercel and configure cron

## Testing Locally

```bash
# Install dependencies
npm install @notionhq/client @slack/web-api openai

# Run locally
npm run dev

# Use ngrok to test Slack webhooks locally
ngrok http 3000
# Then update Slack app's Request URL to ngrok URL
```

## Future Enhancements

- Mobile voice capture via Siri Shortcuts → Slack
- Semantic search across all captured items
- Natural language date parsing improvements
- Project auto-detection from context
- Weekly trends analysis
