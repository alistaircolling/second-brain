import { classifyMessage } from '@/lib/openai';
import { createNotionRecord, createInboxLogEntry, findInboxLogBySlackTs, updateInboxLogEntry, searchItems, updateNotionItem, queryDatabase } from '@/lib/notion';
import { sendSlackReply } from '@/lib/slack';
import { ClassificationResult } from '@/types';

export const processCapture = async (
  text: string,
  slackTs: string,
  channel: string
): Promise<void> => {
  // Classify the message
  const result = await classifyMessage(text);

  // Handle query actions
  if (result.action === 'query' && result.query) {
    await handleQueryRequest(result, slackTs, channel);
    return;
  }

  // Handle update actions
  if (result.action === 'update' && result.update) {
    await handleUpdateRequest(result, text, slackTs, channel);
    return;
  }

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

  // Build confirmation message
  const priorityLabel = result.data.priority ? ` [P${result.data.priority}]` : '';
  let message = `✓ Filed to *${result.destination}*${priorityLabel}: ${result.data.title}`;
  if (result.data.due_date) message += ` (due: ${result.data.due_date})`;
  message += `\nReply \`fix: <category>\` if wrong.`;

  // Ask follow-up question if needed
  if (result.data.needs_clarification && result.data.clarification_question) {
    message += `\n\n💬 ${result.data.clarification_question}`;
  }

  await sendSlackReply(channel, slackTs, message);
};

const handleUpdateRequest = async (
  result: ClassificationResult,
  originalText: string,
  slackTs: string,
  channel: string
): Promise<void> => {
  const { search_query, field, value } = result.update!;
  
  // Search for matching items
  const matches = await searchItems(search_query);
  
  if (matches.length === 0) {
    await sendSlackReply(
      channel,
      slackTs,
      `I couldn't find any items matching "${search_query}". Try a different search term.`
    );
    return;
  }
  
  // Store pending update in inbox log
  const pendingData = JSON.stringify({ matches, field, value });
  await createInboxLogEntry({
    originalText: originalText,
    destination: 'tasks', // placeholder
    confidence: result.confidence,
    slackTs,
    status: 'Pending Update',
    filedToId: pendingData, // store update data here temporarily
  });
  
  // Build confirmation message
  const fieldLabel = field === 'status' ? 'status' : 'due date';
  
  if (matches.length === 1) {
    const match = matches[0];
    const priorityLabel = match.priority ? ` [P${match.priority}]` : '';
    const dueLabel = match.dueDate ? ` (due: ${match.dueDate})` : '';
    
    await sendSlackReply(
      channel,
      slackTs,
      `Found: *${match.title}*${priorityLabel}${dueLabel} in _${match.database}_\n` +
      `Update ${fieldLabel} to *${value}*?\n` +
      `Reply *yes* to confirm or *no* to cancel.`
    );
  } else {
    const list = matches
      .slice(0, 5)
      .map((m, i) => {
        const priorityLabel = m.priority ? ` [P${m.priority}]` : '';
        return `${i + 1}. ${m.title}${priorityLabel} _(${m.database})_`;
      })
      .join('\n');
    
    await sendSlackReply(
      channel,
      slackTs,
      `Found ${matches.length} items matching "${search_query}":\n${list}\n\n` +
      `Reply with a number (1-${Math.min(matches.length, 5)}) to update ${fieldLabel} to *${value}*, or *no* to cancel.`
    );
  }
};

export const handleUpdateConfirmation = async (event: any): Promise<void> => {
  const reply = event.text.trim().toLowerCase();
  
  // Find the pending update
  const inboxEntry = await findInboxLogBySlackTs(event.thread_ts);
  if (!inboxEntry) return;
  
  const status = inboxEntry.properties.Status?.select?.name;
  if (status !== 'Pending Update') return;
  
  // Parse the pending update data
  const pendingData = inboxEntry.properties['Filed To ID']?.rich_text?.[0]?.text?.content;
  if (!pendingData) return;
  
  const { matches, field, value } = JSON.parse(pendingData);
  
  // Handle cancellation
  if (reply === 'no' || reply === 'cancel') {
    await updateInboxLogEntry(inboxEntry.id, {
      Status: { select: { name: 'Cancelled' } },
    });
    await sendSlackReply(event.channel, event.thread_ts, 'Update cancelled.');
    return;
  }
  
  // Determine which item to update
  let itemToUpdate;
  
  if (reply === 'yes' && matches.length === 1) {
    itemToUpdate = matches[0];
  } else {
    const num = parseInt(reply);
    if (!isNaN(num) && num >= 1 && num <= matches.length) {
      itemToUpdate = matches[num - 1];
    }
  }
  
  if (!itemToUpdate) {
    await sendSlackReply(
      event.channel,
      event.thread_ts,
      `Please reply with *yes*, a number (1-${matches.length}), or *no* to cancel.`
    );
    return;
  }
  
  // Perform the update
  await updateNotionItem(itemToUpdate.id, field, value);
  
  // Update inbox log
  await updateInboxLogEntry(inboxEntry.id, {
    Status: { select: { name: 'Updated' } },
    'Filed To ID': { rich_text: [{ text: { content: itemToUpdate.id } }] },
  });
  
  const fieldLabel = field === 'status' ? 'Status' : 'Due date';
  await sendSlackReply(
    event.channel,
    event.thread_ts,
    `✓ Updated *${itemToUpdate.title}*: ${fieldLabel} → *${value}*`
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

const handleQueryRequest = async (
  result: ClassificationResult,
  slackTs: string,
  channel: string
): Promise<void> => {
  const { database, filter } = result.query!;
  const today = new Date().toISOString().split('T')[0];
  
  // Build filter based on query type
  const notDoneFilter = {
    property: 'Status',
    select: { does_not_equal: 'Done' },
  };
  
  const buildFilter = () => {
    const conditions: any[] = [notDoneFilter];
    
    if (filter === 'due_today') {
      conditions.push({ property: 'Due Date', date: { equals: today } });
    } else if (filter === 'overdue') {
      conditions.push({ property: 'Due Date', date: { before: today } });
    } else if (filter === 'high_priority') {
      conditions.push({ property: 'Priority', number: { equals: 1 } });
    }
    
    return conditions.length === 1 ? conditions[0] : { and: conditions };
  };
  
  // Determine which databases to query
  const databasesToQuery = database === 'all' 
    ? ['tasks', 'work', 'people', 'admin'] as const
    : [database] as const;
  
  // Query and collect results
  const allResults: { db: string; items: any[] }[] = [];
  
  for (const db of databasesToQuery) {
    const items = await queryDatabase(db, buildFilter());
    if (items.length > 0) {
      allResults.push({ db, items });
    }
  }
  
  // Format response
  if (allResults.every(r => r.items.length === 0)) {
    await sendSlackReply(channel, slackTs, `No items found.`);
    return;
  }
  
  const titleProp = (db: string) => db === 'people' ? 'Name' : 'Title';
  
  const formatItem = (item: any, db: string) => {
    const props = item.properties;
    const title = props[titleProp(db)]?.title?.[0]?.text?.content || 'Untitled';
    const priority = props.Priority?.number;
    const dueDate = props['Due Date']?.date?.start;
    const followUp = props['Follow-up']?.rich_text?.[0]?.text?.content;
    
    let line = `• ${title}`;
    if (priority) line += ` [P${priority}]`;
    if (dueDate) line += ` _(${dueDate})_`;
    if (followUp) line += ` - ${followUp}`;
    return line;
  };
  
  let message = '';
  for (const { db, items } of allResults) {
    message += `*${db.charAt(0).toUpperCase() + db.slice(1)}:*\n`;
    message += items.slice(0, 10).map(item => formatItem(item, db)).join('\n');
    if (items.length > 10) message += `\n_(+${items.length - 10} more)_`;
    message += '\n\n';
  }
  
  await sendSlackReply(channel, slackTs, message.trim());
};
