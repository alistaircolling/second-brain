import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { verifySlackRequest, getSlackClient } from '@/lib/slack';
import { processCapture, handleFix, handleUpdateConfirmation } from '@/lib/classifier';
import { transcribeAudio } from '@/lib/openai';

// Track processed events to prevent duplicates from Slack retries
const processedEvents = new Set<string>();

// Map emoji reactions to yes/no
const YES_REACTIONS = ['white_check_mark', '+1', 'thumbsup', 'heavy_check_mark'];
const NO_REACTIONS = ['-1', 'thumbsdown', 'x'];

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

  // Handle emoji reactions
  if (event.type === 'reaction_added') {
    const reaction = event.reaction;
    if (YES_REACTIONS.includes(reaction) || NO_REACTIONS.includes(reaction)) {
      // Get the message that was reacted to
      const result = await getSlackClient().conversations.replies({
        channel: event.item.channel,
        ts: event.item.ts,
        limit: 1,
      });
      const message = result.messages?.[0];
      if (message?.thread_ts) {
        const replyText = YES_REACTIONS.includes(reaction) ? 'yes' : 'no';
        waitUntil(handleUpdateConfirmation({
          text: replyText,
          thread_ts: message.thread_ts,
          channel: event.item.channel,
        }));
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Ignore bot messages and edits (but allow file_share for voice notes)
  if (event.bot_id) {
    return NextResponse.json({ ok: true });
  }
  if (event.subtype && event.subtype !== 'file_share') {
    return NextResponse.json({ ok: true });
  }

  // Dedupe using event_id or client_msg_id
  const eventId = payload.event_id || event.client_msg_id || event.ts;
  if (processedEvents.has(eventId)) {
    return NextResponse.json({ ok: true });
  }
  processedEvents.add(eventId);
  
  // Clean up old events after 5 minutes
  setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000);

  // Handle thread replies (fix commands or update confirmations)
  if (event.thread_ts) {
    if (event.text?.toLowerCase().startsWith('fix:')) {
      waitUntil(handleFix(event));
    } else {
      // Could be an update confirmation (yes/no/number)
      waitUntil(handleUpdateConfirmation(event));
    }
    return NextResponse.json({ ok: true });
  }

  // Handle voice messages
  if (event.type === 'message' && event.files?.[0]?.mimetype?.startsWith('audio/')) {
    waitUntil((async () => {
      const audioUrl = event.files[0].url_private;
      const transcript = await transcribeAudio(audioUrl);
      await processCapture(transcript, event.ts, event.channel);
    })());
    return NextResponse.json({ ok: true });
  }

  // Handle text messages
  if (event.type === 'message' && event.channel === process.env.SLACK_INBOX_CHANNEL_ID) {
    waitUntil(processCapture(event.text, event.ts, event.channel));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
