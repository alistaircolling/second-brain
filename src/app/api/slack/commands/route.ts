import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateReviewMessage } from '@/lib/digest';
import { getSlackClient } from '@/lib/slack';
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
    // Acknowledge immediately, process in background
    waitUntil(handleReview(channelId));
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '📋 Generating your review...',
    });
  }

  return NextResponse.json({ text: 'Unknown command' });
}
