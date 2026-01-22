import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getActiveItems } from '@/lib/notion';
import { generateReview } from '@/lib/openai';
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

const formatItems = (items: any[]): string => {
  return items
    .slice(0, 10)
    .map(item => {
      const title = item.properties.Title?.title?.[0]?.text?.content 
        || item.properties.Name?.title?.[0]?.text?.content 
        || 'Untitled';
      const dueDate = item.properties['Due Date']?.date?.start;
      const priority = item.properties['Priority']?.number;
      const priorityLabel = priority ? `[P${priority}]` : '';
      return `- ${priorityLabel} ${title}${dueDate ? ` (due: ${dueDate})` : ''}`;
    })
    .join('\n');
};

const handleReview = async (userId: string) => {
  try {
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

    const review = await generateReview(context);
    
    await getSlackClient().chat.postMessage({
      channel: userId,
      text: `📋 *Your Review*\n\n${review}`,
    });
  } catch (error) {
    console.error('Review command failed:', error);
    // Send error message to user
    await getSlackClient().chat.postMessage({
      channel: userId,
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
  const userId = params.get('user_id');

  if (command === '/review' && userId) {
    // Acknowledge immediately, process in background
    waitUntil(handleReview(userId));
    return NextResponse.json({
      response_type: 'ephemeral',
      text: '📋 Generating your review... Check your DMs in a moment.',
    });
  }

  return NextResponse.json({ text: 'Unknown command' });
}
