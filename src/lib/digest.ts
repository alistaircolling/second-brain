import { getActiveItems } from '@/lib/notion';
import { generateDigest } from '@/lib/openai';
import { sendSlackDM } from '@/lib/slack';

const formatItems = (items: any[]): string => {
  return items
    .slice(0, 10)
    .map(item => {
      const title = item.properties.Title?.title?.[0]?.text?.content 
        || item.properties.Name?.title?.[0]?.text?.content 
        || 'Untitled';
      const dueDate = item.properties['Due Date']?.date?.start;
      return `- ${title}${dueDate ? ` (due: ${dueDate})` : ''}`;
    })
    .join('\n');
};

const buildContext = (items: {
  tasks: any[];
  work: any[];
  people: any[];
  admin: any[];
}): string => {
  return `
Tasks (${items.tasks.length}):
${formatItems(items.tasks)}

Work (${items.work.length}):
${formatItems(items.work)}

People to follow up with (${items.people.length}):
${formatItems(items.people)}

Admin (${items.admin.length}):
${formatItems(items.admin)}
  `.trim();
};

export const sendMorningDigest = async (): Promise<void> => {
  const items = await getActiveItems();
  const context = buildContext(items);
  const digest = await generateDigest('morning', context);
  await sendSlackDM(`☀️ *Morning Briefing*\n\n${digest}`);
};

export const sendEveningDigest = async (): Promise<void> => {
  const items = await getActiveItems();
  const context = buildContext(items);
  const digest = await generateDigest('evening', context);
  await sendSlackDM(`🌙 *Evening Review*\n\n${digest}`);
};

export const sendWeeklyReview = async (): Promise<void> => {
  const items = await getActiveItems();
  const context = buildContext(items);
  const digest = await generateDigest('weekly', context);
  await sendSlackDM(`📅 *Weekly Review*\n\n${digest}`);
};
