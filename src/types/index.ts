export interface ClassificationResult {
  action: 'create' | 'update' | 'query';
  destination: 'tasks' | 'work' | 'people' | 'admin';
  confidence: number;
  data: {
    title: string;
    project?: string;
    category?: string;
    person_name?: string;
    follow_up?: string;
    due_date?: string;
    priority?: number;
    tags?: string[];
    suggested_tag?: string;
    notes?: string;
    needs_clarification?: boolean;
    clarification_question?: string;
  };
  update?: {
    search_query: string;
    field: 'status' | 'due_date' | 'priority';
    value: string;
  };
  query?: {
    tag?: string;
    database?: 'tasks' | 'work' | 'people' | 'admin' | 'all';
    filter?: 'due_today' | 'overdue' | 'high_priority' | 'all_active';
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

// Studio types for admin management
export interface Studio {
  id: string;
  name: string;
  hourlyRate?: number;
  dayRate?: number;
  location?: string;
  description?: string;
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStudioInput {
  name: string;
  hourlyRate?: number;
  dayRate?: number;
  location?: string;
  description?: string;
  status?: 'active' | 'inactive';
}

export interface UpdateStudioInput {
  name?: string;
  hourlyRate?: number;
  dayRate?: number;
  location?: string;
  description?: string;
  status?: 'active' | 'inactive';
}
