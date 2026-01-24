import { Client } from '@notionhq/client';
import { InboxLogEntry } from '@/types';

const getNotion = () => new Client({ auth: process.env.NOTION_API_KEY });

const DB_IDS = {
  tasks: process.env.NOTION_TASKS_DB_ID!,
  work: process.env.NOTION_WORK_DB_ID!,
  people: process.env.NOTION_PEOPLE_DB_ID!,
  admin: process.env.NOTION_ADMIN_DB_ID!,
  inboxLog: process.env.NOTION_INBOX_LOG_DB_ID!,
};

const buildProperties = (destination: string, data: Record<string, any>) => {
  const base: Record<string, any> = {
    Status: { select: { name: 'To Do' } },
  };

  if (data.due_date) {
    base['Due Date'] = { date: { start: data.due_date } };
  }

  if (data.notes) {
    base['Notes'] = { rich_text: [{ text: { content: data.notes } }] };
  }

  if (data.priority) {
    base['Priority'] = { number: data.priority };
  }

  if (data.tags && data.tags.length > 0) {
    base['Tags'] = { multi_select: data.tags.map((tag: string) => ({ name: tag })) };
  }

  switch (destination) {
    case 'tasks':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        ...base,
      };

    case 'work':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        Project: { select: { name: data.project || 'Other' } },
        ...base,
      };

    case 'people': {
      // Extract person name from title if person_name is missing, removing action verbs
      let personName = data.person_name;
      if (!personName && data.title) {
        const actionVerbs = ['call', 'email', 'text', 'meet', 'message', 'contact', 'reach out'];
        const titleLower = data.title.toLowerCase();
        for (const verb of actionVerbs) {
          if (titleLower.startsWith(verb + ' ')) {
            personName = data.title.substring(verb.length + 1).trim();
            break;
          }
        }
        if (!personName) personName = data.title;
      }
      return {
        Name: { title: [{ text: { content: personName || '' } }] },
        'Follow-up': { rich_text: [{ text: { content: data.follow_up || '' } }] },
        ...base,
      };
    }

    case 'admin':
      return {
        Title: { title: [{ text: { content: data.title } }] },
        Category: { select: { name: data.category || 'Appointments' } },
        ...base,
      };

    default:
      return base;
  }
};

export const createNotionRecord = async (
  destination: keyof typeof DB_IDS,
  data: Record<string, any>
): Promise<string> => {
  const properties = buildProperties(destination, data);

  const page = await getNotion().pages.create({
    parent: { database_id: DB_IDS[destination] },
    properties,
  });

  return page.id;
};

export const createInboxLogEntry = async (entry: InboxLogEntry): Promise<string> => {
  const page = await getNotion().pages.create({
    parent: { database_id: DB_IDS.inboxLog },
    properties: {
      'Original Text': { title: [{ text: { content: entry.originalText } }] },
      Destination: { select: { name: entry.destination } },
      Confidence: { number: entry.confidence },
      'Slack TS': { rich_text: [{ text: { content: entry.slackTs } }] },
      Status: { select: { name: entry.status } },
      'Filed To ID': { rich_text: [{ text: { content: entry.filedToId || '' } }] },
    },
  });

  return page.id;
};

export const queryDatabase = async (
  database: keyof typeof DB_IDS,
  filter?: any
): Promise<any[]> => {
  const response = await getNotion().databases.query({
    database_id: DB_IDS[database],
    filter,
  });

  return response.results;
};

export const getActiveItems = async (): Promise<{
  tasks: any[];
  work: any[];
  people: any[];
  admin: any[];
}> => {
  const notDoneFilter = {
    property: 'Status',
    select: { does_not_equal: 'Done' },
  };

  const [tasks, work, people, admin] = await Promise.all([
    queryDatabase('tasks', notDoneFilter),
    queryDatabase('work', notDoneFilter),
    queryDatabase('people', notDoneFilter),
    queryDatabase('admin', notDoneFilter),
  ]);

  return { tasks, work, people, admin };
};

export const getCompletedToday = async (): Promise<any[]> => {
  const today = new Date().toISOString().split('T')[0];
  
  const completedTodayFilter = {
    and: [
      { property: 'Status', select: { equals: 'Done' } },
      { property: 'Completed Date', date: { equals: today } },
    ],
  };

  const completedLastEditedFilter = {
    and: [
      { property: 'Status', select: { equals: 'Done' } },
      { timestamp: 'last_edited_time', last_edited_time: { on_or_after: today } },
    ],
  };

  // Try with Completed Date field first, fall back to last_edited_time
  const results = await Promise.all([
    queryDatabase('tasks', completedLastEditedFilter).catch(() => []),
    queryDatabase('work', completedLastEditedFilter).catch(() => []),
    queryDatabase('people', completedLastEditedFilter).catch(() => []),
    queryDatabase('admin', completedLastEditedFilter).catch(() => []),
  ]);

  return results.flat();
};

export const findInboxLogBySlackTs = async (slackTs: string): Promise<any | null> => {
  const response = await getNotion().databases.query({
    database_id: DB_IDS.inboxLog,
    filter: {
      property: 'Slack TS',
      rich_text: { equals: slackTs },
    },
  });

  return response.results[0] || null;
};

export const updateInboxLogEntry = async (
  pageId: string,
  updates: Record<string, any>
): Promise<void> => {
  await getNotion().pages.update({
    page_id: pageId,
    properties: updates,
  });
};

export const searchItems = async (
  query: string
): Promise<Array<{ id: string; title: string; database: string; priority?: number; dueDate?: string }>> => {
  const results: Array<{ id: string; title: string; database: string; priority?: number; dueDate?: string }> = [];
  const seen = new Set<string>();
  
  // Map database to its title property name
  const dbConfig: Array<{ db: keyof typeof DB_IDS; titleProp: string }> = [
    { db: 'tasks', titleProp: 'Title' },
    { db: 'work', titleProp: 'Title' },
    { db: 'people', titleProp: 'Name' },
    { db: 'admin', titleProp: 'Title' },
  ];
  
  const addResult = (page: any, props: any, titleProp: string, db: string) => {
    if (seen.has(page.id)) return;
    seen.add(page.id);
    const title = props[titleProp]?.title?.[0]?.text?.content || 'Untitled';
    results.push({
      id: page.id,
      title,
      database: db,
      priority: props.Priority?.number,
      dueDate: props['Due Date']?.date?.start,
    });
  };
  
  // Build search terms: full query + individual words (if multi-word)
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const searchTerms = words.length > 1 ? [query, ...words] : [query];
  
  for (const { db, titleProp } of dbConfig) {
    for (const term of searchTerms) {
      const response = await getNotion().databases.query({
        database_id: DB_IDS[db],
        filter: {
          property: titleProp,
          title: { contains: term },
        },
      });
      
      for (const page of response.results) {
        addResult(page, (page as any).properties, titleProp, db);
      }
    }
  }
  
  return results;
};

export const updateNotionItem = async (
  pageId: string,
  field: 'status' | 'due_date' | 'priority',
  value: string
): Promise<void> => {
  const updates: Record<string, any> = {};
  
  if (field === 'status') {
    updates['Status'] = { select: { name: value } };
  } else if (field === 'due_date') {
    updates['Due Date'] = value === 'remove' ? { date: null } : { date: { start: value } };
  } else if (field === 'priority') {
    updates['Priority'] = { number: parseInt(value) };
  }
  
  await getNotion().pages.update({
    page_id: pageId,
    properties: updates,
  });
};

export const updatePageTags = async (pageId: string, tags: string[]): Promise<void> => {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      Tags: { multi_select: tags.map((t) => ({ name: t })) },
    },
  });
};

export const getTagOptions = async (
  database: keyof typeof DB_IDS
): Promise<string[]> => {
  const response = await getNotion().databases.retrieve({
    database_id: DB_IDS[database],
  });

  const options = (response as any)?.properties?.Tags?.multi_select?.options || [];

  return options.map((option: any) => option.name).filter(Boolean);
};

export const updateItemFields = async (
  pageId: string,
  database: keyof typeof DB_IDS,
  updates: {
    title?: string;
    dueDate?: string | null;
    priority?: number | null;
    tags?: string[];
  }
): Promise<void> => {
  const properties: Record<string, any> = {};

  if (updates.title !== undefined) {
    if (database === 'people') {
      properties.Name = { title: [{ text: { content: updates.title } }] };
    } else {
      properties.Title = { title: [{ text: { content: updates.title } }] };
    }
  }

  if (updates.dueDate !== undefined) {
    properties['Due Date'] = updates.dueDate
      ? { date: { start: updates.dueDate } }
      : { date: null };
  }

  if (updates.priority !== undefined) {
    properties.Priority =
      updates.priority === null ? { number: null } : { number: updates.priority };
  }

  if (updates.tags !== undefined) {
    properties.Tags = {
      multi_select: updates.tags.map((tag) => ({ name: tag })),
    };
  }

  if (Object.keys(properties).length === 0) return;

  await getNotion().pages.update({
    page_id: pageId,
    properties,
  });
};

export const getItemsByTag = async (tag: string): Promise<any[]> => {
  const tagFilter = {
    and: [
      { property: 'Status', select: { does_not_equal: 'Done' } },
      { property: 'Tags', multi_select: { contains: tag } },
    ],
  };

  const results = await Promise.all([
    queryDatabase('tasks', tagFilter).catch(() => []),
    queryDatabase('work', tagFilter).catch(() => []),
    queryDatabase('people', tagFilter).catch(() => []),
    queryDatabase('admin', tagFilter).catch(() => []),
  ]);

  return results.flat();
};
