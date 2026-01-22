export interface ClassificationResult {
  destination: 'tasks' | 'work' | 'people' | 'admin';
  confidence: number;
  data: {
    title: string;
    project?: string;
    category?: string;
    person_name?: string;
    follow_up?: string;
    due_date?: string;
    notes?: string;
  };
}

export interface InboxLogEntry {
  originalText: string;
  destination: string;
  confidence: number;
  slackTs: string;
  status: string;
  filedToId?: string;
}

export interface ActiveItems {
  tasks: any[];
  work: any[];
  people: any[];
  admin: any[];
}
