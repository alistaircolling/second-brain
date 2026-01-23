import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateReviewMessage } from '@/lib/digest';
import { getSlackClient } from '@/lib/slack';
import { previewBackfillTags } from '@/lib/backfillTags';
import { createInboxLogEntry } from '@/lib/notion';
import crypto from 'crypto';

const verifySlackRequest = async (req: NextRequest, body: string): Promise<boolean> => {
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');

  if (!timestamp || !signature) return false;

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
};

const handleReview = async (channelId: string) => {
  try {
    const review = await generateReviewMessage();
    
    await getSlackClient().chat.postMessage({
      channel: channelId,
      text: review,
    });
  } catch (error) {
    console.error('Review command failed:', error);
    await getSlackClient().chat.postMessage({
      channel: channelId,
      text: '❌ Sorry, something went wrong generating your review. Check Vercel logs for details.',
    });
  }
};

const handleBackfill = async (channelId: string) => {
  try {
    const { items } = await previewBackfillTags();
    if (items.length === 0) {
      await getSlackClient().chat.postMessage({
        channel: channelId,
        text: '🏷️ No items to tag. All active items already have tags or no tags could be inferred.',
      });
      return;
    }
    const lines = items.map((i) => `• ${i.title} → [${i.tags.join(', ')}]`);
    const text =
      `🏷️ *Tag backfill preview* — Reply ✅ to apply, 👎 to cancel, or _yes except don't tag 'X'_ to exclude.\n\n` +
      lines.join('\n');
    const res = await getSlackClient().chat.postMessage({ channel: channelId, text });
    await createInboxLogEntry({
      originalText: '/backfill',
      destination: 'tasks',
      confidence: 0,
      slackTs: res.ts!,
      status: 'Pending Backfill',
      filedToId: JSON.stringify({ items }),
    });
  } catch (error) {
    console.error('Backfill command failed:', error);
    await getSlackClient().chat.postMessage({
      channel: channelId,
      text: '❌ Backfill failed. Check Vercel logs.',
    });
  }
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  
  // Verify request
  const isValid = await verifySlackRequest(req, body);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse form data
  const params = new URLSearchParams(body);
  const command = params.get('command');
  const channelId = params.get('channel_id');

  if (command === '/review' && channelId) {
    waitUntil(handleReview(channelId));
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '📋 Generating your review...',
    });
  }

  if (command === '/backfill' && channelId) {
    waitUntil(handleBackfill(channelId));
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '🏷️ Generating backfill preview...',
    });
  }

  return NextResponse.json({ text: 'Unknown command' });
}
