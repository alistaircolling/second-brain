# Second Brain

A personal capture system that lets you drop thoughts/tasks into Slack (text or voice), automatically classifies and files them to Notion, sends you digests, and allows corrections via reply.

## Features

- **Text capture** — Send messages to Slack, auto-filed to Notion
- **Voice capture** — Send voice notes, transcribed via Whisper and filed
- **Smart classification** — GPT-4o-mini routes to Tasks, Work, People, or Admin
- **Priority detection** — "urgent" → P1, casual → P3
- **Follow-up questions** — Bot asks for clarification on vague captures
- **Fix flow** — Reply `fix: work` to reclassify
- **Morning planning** — 9:30am GMT digest with priorities
- **Evening review** — 8pm UTC summary
- **Weekly review** — Sunday 3pm UTC deep dive
- **On-demand review** — `/review` command anytime

## Architecture

```
Slack (text/voice) → Vercel API → OpenAI (classify/transcribe) → Notion
                         ↓
                   Slack (confirm + follow-up)
```

## Setup

### 1. Notion Databases

Create these 5 databases in Notion:

**Tasks Database**
| Property | Type | Notes |
|----------|------|-------|
| Title | Title | |
| Status | Select | To Do, In Progress, Done |
| Priority | Number | 1, 2, or 3 |
| Due Date | Date | |
| Notes | Rich Text | |

**Work Database**
| Property | Type | Notes |
|----------|------|-------|
| Title | Title | |
| Project | Select | Mintstars, Rak, Other |
| Status | Select | To Do, In Progress, Done |
| Priority | Number | 1, 2, or 3 |
| Due Date | Date | |
| Notes | Rich Text | |

**People Database**
| Property | Type | Notes |
|----------|------|-------|
| Name | Title | |
| Follow-up | Rich Text | |
| Status | Select | To Do, In Progress, Done |
| Priority | Number | 1, 2, or 3 |
| Due Date | Date | |
| Notes | Rich Text | |

**Admin Database**
| Property | Type | Notes |
|----------|------|-------|
| Title | Title | |
| Category | Select | Appointments, Bills, Orders |
| Status | Select | To Do, In Progress, Done |
| Priority | Number | 1, 2, or 3 |
| Due Date | Date | |
| Notes | Rich Text | |

**Inbox Log Database**
| Property | Type | Notes |
|----------|------|-------|
| Original Text | Title | |
| Destination | Select | Tasks, Work, People, Admin |
| Confidence | Number | 0.0 - 1.0 |
| Slack TS | Rich Text | |
| Status | Select | Filed, Fixed, Needs Review |
| Filed To ID | Rich Text | |

Get each database ID from the URL: `notion.so/DATABASE_ID?v=...`

### 2. Slack App

1. Create app at https://api.slack.com/apps
2. **OAuth & Permissions** — Add scopes:
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `files:read`
   - `im:write`
   - `commands`
3. **Event Subscriptions** — Enable and set URL to:
   ```
   https://your-app.vercel.app/api/slack/events
   ```
4. Subscribe to bot events:
   - `message.channels`
   - `file_shared`
5. **Slash Commands** — Create `/review`:
   - Command: `/review`
   - URL: `https://your-app.vercel.app/api/slack/commands`
6. Install to workspace
7. Create a private channel (e.g. `#second-brain`) and invite the bot

### 3. Environment Variables

Create `.env.local` locally or add to Vercel:

```env
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_INBOX_CHANNEL_ID=C0YOUR_CHANNEL_ID
SLACK_USER_ID=U0YOUR_USER_ID

# Notion
NOTION_API_KEY=ntn_your_api_key
NOTION_TASKS_DB_ID=your_tasks_db_id
NOTION_WORK_DB_ID=your_work_db_id
NOTION_PEOPLE_DB_ID=your_people_db_id
NOTION_ADMIN_DB_ID=your_admin_db_id
NOTION_INBOX_LOG_DB_ID=your_inbox_log_db_id

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Cron (generate a random string)
CRON_SECRET=your-random-secret
```

### 4. Deploy

```bash
# Install dependencies
yarn install

# Deploy to Vercel
vercel --prod

# Add env vars to Vercel
vercel env add SLACK_BOT_TOKEN production
# ... repeat for all env vars

# Redeploy to pick up env vars
vercel --prod
```

## Usage

### Capture

Send messages to your Slack channel:

| Message | Filed to | Priority |
|---------|----------|----------|
| "Buy milk" | Tasks | P3 |
| "urgent: fix login bug on mintstars" | Work | P1 |
| "Call Sarah about the project" | People | P2 |
| "Dentist appointment Friday 2pm" | Admin | P2 |

Voice notes work the same — just record and send.

### Commands

| Command | Action |
|---------|--------|
| `fix: work` | Reply in thread to reclassify to Work |
| `fix: tasks` | Reclassify to Tasks |
| `fix: people` | Reclassify to People |
| `fix: admin` | Reclassify to Admin |
| `/review` | Get an on-demand summary DM |

### Digests

| Time | What |
|------|------|
| 9:30am GMT | Morning planning — priorities + "What's your focus today?" |
| 8pm UTC | Evening review — what was captured, what's next |
| Sunday 3pm UTC | Weekly review — projects, stale items, follow-ups |

### Mark Complete

In Notion, change the **Status** field to **Done**. Item won't appear in future digests.

## Development

```bash
# Run locally
yarn dev

# Test Slack webhooks locally (use ngrok)
ngrok http 3000
# Update Slack app URLs to ngrok URL temporarily
```

## Cost Estimate

| Service | Usage | Cost |
|---------|-------|------|
| GPT-4o-mini | ~100 classifications/day | ~$0.02/day |
| Whisper | ~10 min audio/day | ~$0.06/day |
| Digests | 3/day | ~$0.01/day |
| **Total** | | **~$3/month** |

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Next.js 14 (App Router)
- **Hosting**: Vercel
- **Storage**: Notion
- **AI**: OpenAI (GPT-4o-mini, Whisper)
- **Messaging**: Slack
