import { WebClient } from '@slack/web-api';
import crypto from 'crypto';

const getSlack = () => new WebClient(process.env.SLACK_BOT_TOKEN);

export const getSlackClient = getSlack;

export const sendSlackReply = async (
  channel: string,
  threadTs: string,
  text: string,
  broadcast: boolean = true
): Promise<void> => {
  await getSlack().chat.postMessage({
    channel,
    thread_ts: threadTs,
    text,
    reply_broadcast: broadcast,
  });
};

export const sendSlackDM = async (text: string): Promise<void> => {
  await getSlack().chat.postMessage({
    channel: process.env.SLACK_USER_ID!,
    text,
  });
};

export const verifySlackRequest = async (
  req: Request,
  body: string
): Promise<boolean> => {
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
};
