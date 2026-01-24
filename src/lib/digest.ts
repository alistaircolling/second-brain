import { getActiveItems, getCompletedToday } from '@/lib/notion';
import { sendSlackDM } from '@/lib/slack';

type ReviewType = 'morning' | 'evening' | 'weekly' | 'review';

const getTitle = (item: any): string => {
  // For People items, show "Follow-up Name" format (e.g., "Call HMRC")
  const name = item.properties.Name?.title?.[0]?.text?.content;
  const followUp = item.properties['Follow-up']?.rich_text?.[0]?.text?.content;
  if (name && followUp) {
    // Strip action verb from name if it starts with the same verb as followUp to avoid duplication
    const followUpLower = followUp.toLowerCase().trim();
    const nameLower = name.toLowerCase();
    if (nameLower.startsWith(followUpLower + ' ')) {
      const cleanName = name.substring(followUpLower.length + 1).trim();
      return `${followUp} ${cleanName}`;
    }
    return `${followUp} ${name}`;
  }
  
  return item.properties.Title?.title?.[0]?.text?.content 
    || name 
    || 'Untitled';
};

const getDueDate = (item: any): string | null => 
  item.properties['Due Date']?.date?.start || null;

const getPriority = (item: any): number | null => 
  item.properties.Priority?.number || null;

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear().toString().slice(-2);
  return `${days[date.getDay()]} ${day}.${month}.${year}`;
};

const getGreeting = (type: ReviewType, completedCount: number): string => {
  if (type === 'morning') {
    return 'Good morning Alistair,\n\nLet\'s plan your day ahead.';
  }
  
  if (type === 'evening') {
    const praise = completedCount >= 3 ? 'you\'ve got lots done today!' 
      : completedCount >= 1 ? 'nice progress today!' 
      : 'let\'s see where we\'re at.';
    return `Good evening Alistair, ${praise}\n\nLet's go over your tasks.`;
  }
  
  if (type === 'weekly') {
    const praise = completedCount >= 5 ? 'Great week!' 
      : completedCount >= 1 ? 'Some good progress this week.' 
      : '';
    return `Good afternoon Alistair,${praise ? ' ' + praise : ''}\n\nLet's go over what we got done this week and plan what's happening next week.`;
  }
  
  return 'Hey Alistair,\n\nHere\'s a quick look at your tasks.';
};

const buildReview = (
  allItems: any[],
  completedItems: any[],
  type: ReviewType
): string => {
  const today = new Date().toISOString().split('T')[0];
  const sections: string[] = [getGreeting(type, completedItems.length)];

  // 🤗 COMPLETED - only evening and weekly
  if ((type === 'evening' || type === 'weekly') && completedItems.length > 0) {
    sections.push('', '', '🤗 *COMPLETED*');
    completedItems.forEach(item => sections.push(`- ${getTitle(item)}`));
  }

  // Categorize active items
  const overdue: any[] = [];
  const dueToday: any[] = [];
  const priorityItems: any[] = [];

  allItems.forEach(item => {
    const dueDate = getDueDate(item);
    const priority = getPriority(item);

    if (dueDate && dueDate < today) {
      overdue.push(item);
    } else if (dueDate === today) {
      dueToday.push(item);
    } else if (priority && priority <= 3) {
      priorityItems.push(item);
    }
  });

  // 🧟‍♂️ OVERDUE - most overdue first
  if (overdue.length > 0) {
    overdue.sort((a, b) => (getDueDate(a) || '').localeCompare(getDueDate(b) || ''));
    sections.push('', '', '🧟‍♂️ *OVERDUE*');
    overdue.forEach(item => {
      const dueDate = getDueDate(item);
      sections.push(`- ${getTitle(item)}${dueDate ? ` (${formatDate(dueDate)})` : ''}`);
    });
  }

  // 🌅 TODAY - with priority numbers
  if (dueToday.length > 0) {
    dueToday.sort((a, b) => (getPriority(a) || 99) - (getPriority(b) || 99));
    sections.push('', '', '🌅 *TODAY*');
    dueToday.forEach(item => {
      const priority = getPriority(item);
      sections.push(`${priority || '-'} - ${getTitle(item)}`);
    });
  }

  // 🦄 PRIORITY ITEMS - exclude items already in today
  const todayIds = new Set(dueToday.map(i => i.id));
  const filteredPriority = priorityItems.filter(i => !todayIds.has(i.id));
  if (filteredPriority.length > 0) {
    filteredPriority.sort((a, b) => (getPriority(a) || 99) - (getPriority(b) || 99));
    sections.push('', '', '🦄 *PRIORITY ITEMS*');
    filteredPriority.forEach(item => {
      const priority = getPriority(item);
      const dueDate = getDueDate(item);
      const dueSuffix = dueDate === today ? ' (due today)' : '';
      sections.push(`${priority} - ${getTitle(item)}${dueSuffix}`);
    });
  }

  sections.push('', 'Have a great day, let me know if we need to make any updates!');
  return sections.join('\n');
};

export const sendMorningDigest = async (): Promise<void> => {
  const items = await getActiveItems();
  const allItems = [...items.tasks, ...items.work, ...items.people, ...items.admin];
  const digest = buildReview(allItems, [], 'morning');
  await sendSlackDM(digest);
};

export const sendEveningDigest = async (): Promise<void> => {
  const [items, completedToday] = await Promise.all([
    getActiveItems(),
    getCompletedToday(),
  ]);
  const allItems = [...items.tasks, ...items.work, ...items.people, ...items.admin];
  const digest = buildReview(allItems, completedToday, 'evening');
  await sendSlackDM(digest);
};

export const sendWeeklyReview = async (): Promise<void> => {
  const [items, completedToday] = await Promise.all([
    getActiveItems(),
    getCompletedToday(),
  ]);
  const allItems = [...items.tasks, ...items.work, ...items.people, ...items.admin];
  const digest = buildReview(allItems, completedToday, 'weekly');
  await sendSlackDM(digest);
};

export const generateReviewMessage = async (): Promise<string> => {
  const items = await getActiveItems();
  const allItems = [...items.tasks, ...items.work, ...items.people, ...items.admin];
  return buildReview(allItems, [], 'review');
};
