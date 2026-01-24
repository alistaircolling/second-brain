'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Database = 'tasks' | 'work' | 'people' | 'admin';

type Item = {
  id: string;
  title: string;
  status: string;
  database: Database;
  dueDate: string | null;
  priority: number | null;
  tags: string[];
  project: string | null;
  category: string | null;
  followUp: string | null;
};

const DATABASE_LABELS: Record<Database, string> = {
  tasks: 'Tasks',
  work: 'Work',
  people: 'People',
  admin: 'Admin',
};

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<'all' | Database>('all');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<Record<Database, string[]>>({
    tasks: [],
    work: [],
    people: [],
    admin: [],
  });
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{
    title: string;
    destination: Database;
    data: Record<string, any>;
  } | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const loadItems = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/items');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load items.');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const classifyItem = async (value?: string) => {
    const itemTitle = (value ?? title).trim();
    if (!itemTitle) return;

    setIsClassifying(true);
    setError(null);

    try {
      const res = await fetch('/api/items/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: itemTitle }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to classify item.');
      const data = await res.json();

      const isCreate = data.action === 'create' && data.destination && data.data;
      setPendingCreate({
        title: isCreate ? (data.data.title || itemTitle) : itemTitle,
        destination: isCreate ? data.destination : 'tasks',
        data: isCreate ? data.data : { title: itemTitle },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify item.');
    } finally {
      setIsClassifying(false);
    }
  };

  const confirmCreate = async () => {
    if (!pendingCreate) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: pendingCreate.destination,
          data: pendingCreate.data,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to create item.');
      setTitle('');
      setPendingCreate(null);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelCreate = () => {
    if (isSaving) return;
    setPendingCreate(null);
  };

  const markDone = async (id: string) => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Done' }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to update item.');
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item.');
    } finally {
      setIsSaving(false);
    }
  };

  const startVoiceCapture = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser.');
      return;
    }

    setVoiceError(null);
    if (recognitionRef.current) {
      recognitionRef.current.stop?.();
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setVoiceError('Voice input failed. Please try again.');
      setIsListening(false);
    };
    recognition.onnomatch = () => {
      setVoiceError('No speech match found. Please try again.');
    };

    recognition.onresult = (event: any) => {
      const result = event.results?.[event.resultIndex || 0];
      const transcript = result?.[0]?.transcript?.trim();
      if (transcript) {
        setTitle(transcript);
        classifyItem(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const isBusy = useMemo(() => isSaving || isListening, [isSaving, isListening]);

  const openEditor = (item: Item) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditPriority(item.priority ? String(item.priority) : '');
    setEditDueDate(item.dueDate || '');
    setEditTags(item.tags);
  };

  const closeEditor = () => {
    if (isEditing) return;
    setSelectedItem(null);
  };

  const saveEdits = async () => {
    if (!selectedItem) return;

    setIsEditing(true);
    setError(null);

    const priorityValue = editPriority.trim();
    const parsedPriority = priorityValue ? Number(priorityValue) : null;
    const tags = editTags;

    try {
      const res = await fetch(`/api/items/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database: selectedItem.database,
          title: editTitle.trim(),
          dueDate: editDueDate || null,
          priority: Number.isFinite(parsedPriority) ? parsedPriority : null,
          tags,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to update item.');
      await loadItems();
      setSelectedItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item.');
    } finally {
      setIsEditing(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const loadTagOptions = async (database: Database) => {
    if (tagOptions[database].length > 0) return;

    try {
      const res = await fetch(`/api/items/tags?database=${database}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to load tags.');
      const data = await res.json();
      setTagOptions((prev) => ({
        ...prev,
        [database]: Array.isArray(data.tags) ? data.tags : [],
      }));
    } catch {
      setTagOptions((prev) => ({ ...prev, [database]: [] }));
    }
  };

  useEffect(() => {
    if (selectedItem) {
      loadTagOptions(selectedItem.database);
    }
  }, [selectedItem]);

  const loadAllTags = async () => {
    const databases: Database[] = ['tasks', 'work', 'people', 'admin'];
    const requests = databases.map((db) =>
      fetch(`/api/items/tags?database=${db}`)
        .then((res) => (res.ok ? res.json() : { tags: [] }))
        .catch(() => ({ tags: [] }))
    );

    const results = await Promise.all(requests);
    const tags = results
      .flatMap((result) => (Array.isArray(result.tags) ? result.tags : []))
      .filter((tag) => typeof tag === 'string' && tag.trim().length > 0);

    setAllTags(Array.from(new Set(tags)).sort());
  };

  useEffect(() => {
    if (showTagPicker && allTags.length === 0) {
      loadAllTags();
    }
  }, [showTagPicker, allTags.length]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filter !== 'all') {
      result = result.filter((item) => item.database === filter);
    }
    if (tagFilter) {
      result = result.filter((item) => item.tags.includes(tagFilter));
    }
    return result;
  }, [filter, items, tagFilter]);

  const sortByPriority = (a: Item, b: Item) =>
    (a.priority ?? 99) - (b.priority ?? 99);

  const sortByDate = (a: Item, b: Item) =>
    (a.dueDate || '').localeCompare(b.dueDate || '');

  const overdueItems = useMemo(
    () =>
      filteredItems
        .filter((item) => item.dueDate && item.dueDate < today)
        .sort(sortByDate),
    [filteredItems, today]
  );

  const todayItems = useMemo(
    () =>
      filteredItems
        .filter((item) => item.dueDate === today)
        .sort(sortByPriority),
    [filteredItems, today]
  );

  const upcomingItems = useMemo(
    () =>
      filteredItems
        .filter((item) => item.dueDate && item.dueDate > today)
        .sort((a, b) => sortByDate(a, b) || sortByPriority(a, b)),
    [filteredItems, today]
  );

  const noDueItems = useMemo(
    () =>
      filteredItems
        .filter((item) => !item.dueDate)
        .sort(sortByPriority),
    [filteredItems]
  );

  const renderItems = (sectionItems: Item[]) => (
    <ul className="space-y-3">
      {sectionItems.map((item) => {
        const extraLabel = item.project || item.category || item.followUp;
        const priorityClass =
          item.priority === 1
            ? 'font-semibold text-[color:var(--color-chart-1)]'
            : item.priority === 2
              ? 'font-semibold text-[color:var(--color-chart-2)]'
              : item.priority === 3
                ? 'font-semibold text-[color:var(--color-chart-3)]'
                : 'text-muted-foreground';
        const metaParts = [
          item.priority ? `P${item.priority}` : null,
          DATABASE_LABELS[item.database],
          extraLabel,
        ].filter(Boolean);

        return (
          <li
            key={item.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            role="button"
            tabIndex={0}
            onClick={() => openEditor(item)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openEditor(item);
              }
            }}
          >
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {metaParts.map((part, index) => (
                  <span
                    key={`${item.id}-${part}`}
                    className={index === 0 ? priorityClass : undefined}
                  >
                    {index > 0 ? ' • ' : ''}
                    {part}
                  </span>
                ))}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:ml-4">
              {item.dueDate && (
                <span className="text-xs text-muted-foreground">
                  {item.dueDate}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  markDone(item.id);
                }}
                disabled={isBusy}
              >
                Mark done
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Cynthia</h1>
        <p className="text-sm text-muted-foreground">
        What do you want to do?
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Add item</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              classifyItem();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="taskTitle">
                Title
              </label>
              <Input
                id="taskTitle"
                name="taskTitle"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Plan weekly review"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={isBusy || isClassifying}>
                Add item
              </Button>
              <Button type="button" variant="secondary" onClick={startVoiceCapture} disabled={isBusy || isClassifying}>
                {isListening ? 'Listening...' : 'Add with voice'}
              </Button>
            </div>
            {isClassifying && (
              <p className="text-xs text-muted-foreground">
                Classifying destination...
              </p>
            )}
          </form>
          {voiceError && <p className="mt-3 text-sm text-destructive">{voiceError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active items.</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {(['all', 'tasks', 'work', 'people', 'admin'] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={filter === option ? 'default' : 'outline'}
                    onClick={() => setFilter(option)}
                  >
                    {option === 'all'
                      ? 'All'
                      : DATABASE_LABELS[option]}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={showTagPicker ? 'default' : 'outline'}
                  onClick={() => {
                    setShowTagPicker((current) => !current);
                  }}
                >
                  Tags
                </Button>
              </div>

              {showTagPicker && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Tags
                  </h3>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tags found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          variant={tagFilter === tag ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            setTagFilter(tag);
                            setShowTagPicker(false);
                          }}
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tagFilter && (
                <section className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Filtered by tag:</span>
                  <Button type="button" variant="outline" size="sm">
                    {tagFilter}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTagFilter(null)}
                  >
                    Clear
                  </Button>
                </section>
              )}

              {overdueItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Overdue
                  </h3>
                  {renderItems(overdueItems)}
                </section>
              )}

              {todayItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Today
                  </h3>
                  {renderItems(todayItems)}
                </section>
              )}

              {upcomingItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Upcoming
                  </h3>
                  {renderItems(upcomingItems)}
                </section>
              )}

              {noDueItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    No due date
                  </h3>
                  {renderItems(noDueItems)}
                </section>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedItem)} onOpenChange={closeEditor}>
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>
              Update the title, priority, due date, and tags.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="editTitle">
              Title
            </label>
            <Input
              id="editTitle"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder="Item title"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="editPriority">
              Priority
            </label>
            <select
              id="editPriority"
              value={editPriority}
              onChange={(event) => setEditPriority(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">None</option>
              <option value="1">P1</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="editDueDate">
              Due date
            </label>
            <Input
              id="editDueDate"
              type="date"
              value={editDueDate}
              onChange={(event) => setEditDueDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="editTags">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {(selectedItem ? tagOptions[selectedItem.database] : []).map((tag) => {
                const isSelected = editTags.includes(tag);

                return (
                  <Button
                    key={tag}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setEditTags((current) =>
                        current.includes(tag)
                          ? current.filter((value) => value !== tag)
                          : [...current, tag]
                      );
                    }}
                  >
                    {tag}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeEditor} disabled={isEditing}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdits} disabled={isEditing}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingCreate)} onOpenChange={cancelCreate}>
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>Confirm item</DialogTitle>
            <DialogDescription>
              Confirm the destination before creating.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="font-medium">{pendingCreate?.title}</div>
            <div className="text-xs text-muted-foreground">
              {pendingCreate ? DATABASE_LABELS[pendingCreate.destination] : ''}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cancelCreate}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmCreate} disabled={isBusy}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
