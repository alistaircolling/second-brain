import { classifyMessage } from '@/lib/openai';
import { createNotionRecord, createInboxLogEntry, findInboxLogBySlackTs, updateInboxLogEntry } from '@/lib/notion';
import { sendSlackReply } from '@/lib/slack';
import { ClassificationResult } from '@/types';

export const processCapture = async (
  text: string,
  slackTs: string,
  channel: string
): Promise<void> => {
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
};

export const handleFix = async (event: any): Promise<void> => {
  const fixMatch = event.text.match(/^fix:\s*(\w+)/i);
  if (!fixMatch) return;

  const newDestination = fixMatch[1].toLowerCase() as ClassificationResult['destination'];
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
};
