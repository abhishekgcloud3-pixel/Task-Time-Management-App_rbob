"use client";

import React from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Enums, Tables } from "@/database.types";

type TaskState = Enums<"task_state">;
type Priority = Enums<"priority">;

type Category = Tables<"categories">;
type Task = Tables<"tasks">;
type Reminder = Tables<"reminders">;

const APP_PASSWORD = "Tikur@12345";

// Add a small local id generator for offline/fallback use
function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

// Detect presence of Supabase env to avoid ECONNRESET undefined
const hasSupabaseEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function Home(): JSX.Element {
  // Gate
  const [password, setPassword] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const [isUnlocked, setIsUnlocked] = React.useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [isShaking, setIsShaking] = React.useState<boolean>(false);
  const [showPassword, setShowPassword] = React.useState<boolean>(false);

  // Theme
  const [isDark, setIsDark] = React.useState<boolean>(false);
  // Focus mode
  const [isFocus, setIsFocus] = React.useState<boolean>(false);

  // App state
  const [activeTab, setActiveTab] = React.useState<"overview" | "categories">("overview");
  const [showMobileNav, setShowMobileNav] = React.useState<boolean>(false);
  const [collapsedGroupsebaGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

  // Data from Supabase
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [isLoadingData, setIsLoadingData] = React.useState<boolean>(false);

  // CRUD modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState<boolean>(false);
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [formTitle, setFormTitle] = React.useState<string>("");
  const [formCategoryId, setFormCategoryId] = React.useState<string>("");
  const [formPriority, setFormPriority] = React.useState<Priority>("medium");
  const [formState, setFormState] = React.useState<TaskState>("todo");
  const [formDueAt, setFormDueAt] = React.useState<string>("");
  const [formNotes, setFormNotes] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string>("");

  // Drag and drop
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);
  const [dragOverState, setDragOverState] = React.useState<TaskState | null>(null);

  // Notifications
  const reminderTimers = React.useRef<Record<string, number>>({});
  const supabase = React.useMemo(() => (hasSupabaseEnv ? createSupabaseClient() : null), []);

  // Suppress network aborted/ECONNRESET noise to avoid crashing logs
  React.useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { code?: string; name?: string; message?: string } | unknown;
      if (
        typeof reason === "object" &&
        reason !== null &&
        (
          (reason as { code?: string }).code === "ECONNRESET" ||
          (reason as { name?: string }).name === "AbortError" ||
          ((reason as { message?: string }).message?.toLowerCase().includes("aborted") ?? false)
        )
      ) {
        event.preventDefault();
      }
    };
    const onErrorEvent = (event: ErrorEvent) => {
      const code = (event.error as { code?: string } | undefined)?.code;
      const msg = event.message?.toLowerCase() ?? "";
      if (code === "ECONNRESET" || msg.includes("aborted")) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onErrorEvent);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onErrorEvent);
    };
  }, []);

  const requestNotificationPermission = async () => {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {
      // ignore
    }
  };

  const scheduleReminder = (rem: Reminder, associatedTask?: Task) => {
    // Clear previous
    const prev = reminderTimers.current[rem.id];
    if (prev) {
      window.clearTimeout(prev);
      delete reminderTimers.current[rem.id];
    }
    const remindTime = new Date(rem.remind_at).getTime();
    const now = Date.now();
    const delay = remindTime - now;
    if (delay <= 0) {
      return; // past reminders not scheduled here
    }
    const title = associatedTask?.title ?? "Task Reminder";
    const timeoutId = window.setTimeout(async () => {
      try {
        if (Notification.permission === "granted") {
          const body = `Reminder: ${title}`;
          new Notification("Nimbus Tasks", {
            body,
          });
        }
      } catch {
        // ignore notification errors
      }

      // Handle simple recurrence scheduling
      const rec = rem.recurrence;
      if (rec && rec !== "none" && supabase) {
        try {
          const base = new Date(rem.remind_at);
          let next: Date = new Date(base);
          if (rec === "daily") next.setDate(base.getDate() + 1);
          else if (rec === "weekly") next.setDate(base.getDate() + 7);
          else if (rec === "monthly") next.setMonth(base.getMonth() + 1);
          await supabase.from("reminders").update({ remind_at: next.toISOString() }).eq("id", rem.id);
        } catch (err: unknown) {
          // ignore network aborts/ECONNRESET
        }
      }
      delete reminderTimers.current[rem.id];
    }, delay);
    reminderTimers.current[rem.id] = timeoutId;
  };

  const clearAllReminderTimers = () => {
    Object.values(reminderTimers.current).forEach((id) => window.clearTimeout(id));
    reminderTimers.current = {};
  };

  // Gate submit
  const onSubmitGate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    window.setTimeout(() => {
      const ok = password === APP_PASSWORD;
      if (ok) {
        try {
          if (navigator?.vibrate) navigator.vibrate(30);
        } catch {
          // ignore
        }
        setIsUnlocked(true);
      } else {
        try {
          if (navigator?.vibrate) navigator.vibrate([20, 30, 20]);
        } catch {
          // ignore
        }
        setError("Incorrect password. Please try again.");
        setIsShaking(true);
        window.setTimeout(() => setIsShaking(false), 600);
      }
      setIsSubmitting(false);
    }, 350);
  };

  const onEnterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const form = e.currentTarget.closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
  };

  // Fetch data on unlock
  React.useEffect(() => {
    const init = async () => {
      if (!isUnlocked) return;
      setIsLoadingData(true);
      await requestNotificationPermission();

      // Categories
      const { data: catData, error: catErr } = await supabase.from("categories").select("*").order("created_at", { ascending: true });
      if (catErr) {
        // fallback: start with defaults
        setCategories([]);
      } else {
        if (!catData || catData.length === 0) {
          // Seed defaults
          const defaults: Omit<Category, "id" | "created_at">[] = [
            { name: "Personal", color: "from-blue-500 to-cyan-500", icon: "🏠" },
            { name: "Work", color: "from-violet-500 to-fuchsia-500", icon: "💼" },
          ];
          const inserts = await supabase.from("categories").insert(defaults).select("*");
          if (inserts.data) setCategories(inserts.data as Category[]);
        } else {
          setCategories(catData as Category[]);
        }
      }

      // Tasks
      const { data: taskData } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      setTasks((taskData ?? []) as Task[]);

      // Reminders
      const { data: remData } = await supabase.from("reminders").select("*").order("remind_at", { ascending: true });
      setReminders((remData ?? []) as Reminder[]);

      setIsLoadingData(false);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  // Real-time subscriptions
  React.useEffect(() => {
    if (!isUnlocked) return;
    const channel = supabase
      .channel("realtime-tasks-categories-reminders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCategories((prev) => [payload.new as Category, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setCategories((prev) => prev.map((c) => (c.id === (payload.new as Category).id ? (payload.new as Category) : c)));
          } else if (payload.eventType === "DELETE") {
            setCategories((prev) => prev.filter((c) => c.id !== (payload.old as Category).id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTasks((prev) => [payload.new as Task, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setTasks((prev) => prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t)));
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== (payload.old as Task).id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRem = payload.new as Reminder;
            setReminders((prev) => [newRem, ...prev]);
            const task = tasks.find((t) => t.idd === newRem.task_id);
            scheduleReminder(newRem, task);
          } else if (payload.eventType === "UPDATE") {
            const upd = payload.new as Reminder;
            setReminders((prev) => prev.map((r) => (r.id === upd.id ? upd : r)));
            const task = tasks.find((t) => t.id === upd.task_id);
            scheduleReminder(upd, task);
          } else if (payload.eventType === "DELETE") {
            const oldRem = payload.old as Reminder;
            setReminders((prev) => prev.filter((r) => r.id !== oldRem.id));
            const prevTimer = reminderTimers.current[oldRem.id];
            if (prevTimer) {
              window.clearTimeout(prevTimer);
              delete reminderTimers.current[oldRem.id];
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearAllReminderTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, tasks]);

  // Schedule reminders when data changes
  React.useEffect(() => {
    if (!isUnlocked) return;
    clearAllReminderTimers();
    reminders.forEach((rem) => {
      const task = tasks.find((t) => t.id === rem.task_id);
      scheduleReminder(rem, task);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, tasks, isUnlocked]);

  // Helpers
  const categoryById = React.useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const tasksByState = React.useMemo(() => {
    return {
      todo: tasks.filter((t) => t.state === "todo"),
      inprogress: tasks.filter((t) => t.state === "inprogress"),
      done: tasks.filter((t) => t.state === "done"),
    };
  }, [tasks]);

  const groupTasksByCategory = (list: Task[]) => {
    const groups = new Map<string, Task[]>();
    for (const t of list) {
      const arr = groups.get(t.category_id ?? "") ?? [];
      arr.push(t);
      groups.set(t.category_id ?? "", arr);
    }
    // sort by category name
    return Array.from(groups.entries()).sort((a, b) => {
      const an = categoryById.get(a[0])?.name ?? "";
      const bn = categoryById.get(b[0])?.name ?? "";
      return an.localeCompare(bn);
    });
  };

  const toggleCollapse = (state: TaskState, categoryId: string) => {
    const key = `${state}:${categoryId}`;
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const moveTaskState = async (taskId: string, next: TaskState) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state: next } : t)));
    await supabase.from("tasks").update({ state: next, updated_at: new Date().toISOString() }).eq("id", taskId);
  };

  const addCategory = async (name: string) => {
    const palette = [
      "from-emerald-500 to-teal-500",
      "from-rose-500 to-orange-500",
      "from-indigo-500 to-blue-500",
      "from-cyan-500 to-sky-500",
      "from-amber-500 to-yellow-500",
    ];
    const pick = palette[Math.floor(Math.random() * palette.length)];
    const { data } = await supabase
      .from("categories")
      .insert({ name, color: pick, icon: "🗂️" })
      .select("*")
      .single();
    if (data) {
      setCategories((prev) => [data as Category, ...prev]);
    }
  };

  // CRUD
  const openCreateTask = () => {
    setEditingTaskId(null);
    setFormTitle("");
    setFormCategoryId(categories[0]?.id ?? "");
    setFormPriority("medium");
    setFormState("todo");
    setFormDueAt("");
    setFormNotes("");
    setFormError("");
    setIsTaskModalOpen(true);
  };

  const openEditTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    setEditingTaskId(id);
    setFormTitle(t.title);
    setFormCategoryId(t.category_id ?? "");
    setFormPriority(t.priority);
    setFormState(t.state);
    setFormDueAt(t.due_at ?? "");
    setFormNotes(t.notes ?? "");
    setFormError("");
    setIsTaskModalOpen(true);
  };

  const saveTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    const title = formTitle.trim();
    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (!formCategoryId) {
      setFormError("Please choose a category.");
      return;
    }
    const payload: Omit<Task, "id" | "created_at" | "updated_at"> & Partial<Pick<Task, "id">> = {
      id: editingTaskId ?? undefined,
      title,
      state: formState,
      category_id: formCategoryId,
      priority: formPriority,
      due_at: formDueAt || null,
      notes: formNotes || null,
    };

    if (editingTaskId) {
      setTasks((prev) => prev.map((t) => (t.id === editingTaskId ? { ...t, ...payload, updated_at: new Date().toISOString() } as Task : t)));
      await supabase.from("tasks").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingTaskId);
    } else {
      const { data } = await supabase
        .from("tasks")
        .insert({ ...payload })
        .select("*")
        .single();
      if (data) {
        setTasks((prev) => [data as Task, ...prev]);
      }
    }
    setIsTaskModalOpen(false);
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
    // Also delete reminders for the task for cleanliness
    await supabase.from("reminders").delete().eq("task_id", id);
  };

  // UI subcomponents
  const ThemeToggle = () => (
    <button
      type="button"
      onClick={() => setIsDark((d) => !d)}
      className="rounded-xl px-3 py-2 text-sm bg-white/70 dark:bg-neutral-800/60 border border-white/30 dark:border-neutral-700/60 text-neutral-800 dark:text-neutral-200 hover:shadow-sm focus-ring"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? "Light" : "Dark"}
    </button>
  );

  const Sidebar = () => {
    const NavItem = ({
      label,
      icon,
      active,
      onClick,
    }: {
      label: string;
      icon: string;
      active?: boolean;
      onClick: () => void;
    }) => (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-white/60 dark:hover:bg-neutral-700/50 focus-ring ${
          active
            ? "bg-white/70 dark:bg-neutral-700/60 text-neutral-900 dark:text-neutral-100"
            : "text-neutral-700 dark:text-neutral-300"
        }`}
      >
        <span className="text-base">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
    );

    return (
      <aside
        className={`flex-shrink-0 w-64 p-4 backdrop-blur-sm rounded-2xl border 
        bg-white/70 border-white/30 shadow-xl dark:bg-neutral-800/60 dark:border-neutral-700/50 animate-fade-in`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-teal-400 shadow-md" />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">Nimbus Tasks</span>
          </div>
          <ThemeToggle />
        </div>

        <nav className="space-y-1">
          <NavItem
            label="Overview"
            icon="✨"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <div className="mt-3 px-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Categories</div>
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-1 mt-1">
              <div className={`h-5 w-5 rounded-md bg-gradient-to-r ${c.color}`} />
              <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{c.icon} {c.name}</span>
            </div>
          ))}
          <div className="mt-4">
            <NavItem
              label="Manage Categories"
              icon="⚙️"
              active={activeTab === "categories"}
              onClick={() => setActiveTab("categories")}
            />
          </div>
        </nav>
      </aside>
    );
  };

  const TaskCard = ({ t }: { t: Task }) => {
    const priorityBadge =
      t.priority === "high"
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-400/40"
        : t.priority === "medium"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/40"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-400/40";

    return (
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          setDraggingTaskId(t.id);
          try {
            e.dataTransfer.setData("text/task-id", t.id);
          } catch {
            // ignore
          }
        }}
        onDragEnd={() => setDraggingTaskId(null)}
        onClick={() => openEditTask(t.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") openEditTask(t.id);
        }}
        className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/80 dark:bg-neutral-800/60 border border-white/40 dark:border-neutral-700/60 hover-scale cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-800 dark:text-neutral-100">{t.title}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priorityBadge}`}>{t.priority}</span>
          {t.due_at && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-400/40">
              {new Date(t.due_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {t.state === "todo" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void moveTaskState(t.id, "inprogress");
              }}
              className="text-xs rounded-md px-2 py-1 bg-blue-600 text-white hover:brightness-110 focus-ring"
            >
              Start
            </button>
          )}
          {t.state !== "done" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void moveTaskState(t.id, "done");
              }}
              className="text-xs rounded-md px-2 py-1 bg-emerald-600 text-white hover:brightness-110 focus-ring"
            >
              Complete
            </button>
          )}
          {t.state !== "todo" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void moveTaskState(t.id, "todo");
              }}
              className="text-xs rounded-md px-2 py-1 bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-ring"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void deleteTask(t.id);
            }}
            aria-label="Delete task"
            className="text-xs rounded-md px-2 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 focus-ring"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  const ProductivitySummary = () => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.state === "done").length;
    const inprogress = tasks.filter((t) => t.state === "inprogress").length;
    const todo = tasks.filter((t) => t.state === "todo").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <div className="rounded-2xl p-4 backdrop-blur-sm border bg-white/70 border-white/30 shadow-md dark:bg-neutral-800/60 dark:border-neutral-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Daily Summary</h3>
          <span className="text-xs text-neutral-600 dark:text-neutral-300">{pct}% complete</span>
        </div>
        <div className="h-2 wext-neutral-700 dark:bg-neutral-700 overflow-hidden mb-2">
          <div
            className="h-2 bg-gradient-to-r from-emerald-500 to-teal-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-neutral-700 dark:text-neutral-300">
          {todo} to do • {inprogress} in progress • {done} done
        </div>
      </div>
    );
  };

  const WeeklyCalendar = () => {
    // Show current week (Mon-Sun) with dots for due tasks
    const now = new Date();
    const day = now.getDay(); // 0 Sun - 6 Sat
    const mondayOffset = ((day + 6) % 7); // days since Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const days: Date[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });

    const tasksByDay = (date: Date) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      return tasks.filter((t) => {
        if (!t.due_at) return false;
        const du = new Date(t.due_at);
        return du >= start && du <= end;
      });
    };

    const isToday = (date: Date) => {
      const d = new Date(date);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    };

    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
      <div className="rounded-2xl p-4 backdrop-blur-sm border bg-white/70 border-white/30 shadow-md dark:bg-neutral-800/60 dark:border-neutral-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">This Week</h3>
          <span className="text-xs text-neutral-600 dark:text-neutral-300">
            {days[0].toLocaleDateString()} - {days[6].toLocaleDateString()}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, idx) => {
            const dayTasks = tasksByDay(d);
            const count = dayTasks.length;
            const today = isToday(d);
            return (
              <div
                key={d.toISOString()}
                className={`rounded-xl px-3 py-2 border bg-white/70 dark:bg-neutral-800/60 border-white/30 dark:border-neutral-700/50 ${
                  today ? "ring-2 ring-blue-400" : ""
                }`}
              >
                <div className="text-xs text-neutral-700 dark:text-neutral-300">{weekday[idx]}</div>
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{d.getDate()}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className={`h-2 w-2 rounded-full ${
                        t.state === "done"
                          ? "bg-emerald-500"
                          : t.state === "inprogress"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      }`}
                      title={t.title}
                    />
                  ))}
                  {count > 3 && (
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-300">+{count - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const Overview = () => {
    const Column = ({
      title,
      state,
      description,
      accent,
    }: {
      title: string;
      state: TaskState;
      description: string;
      accent: string; // gradient colors
    }) => {
      const list = tasksByState[state];
      const grouped = groupTasksByCategory(list);
      const isHover = dragOverState === state;

      return (
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverState(state);
          }}
          onDragLeave={() => {
            if (dragOverState === state) setDragOverState(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id =
              ((): string | null => {
                try {
                  return e.dataTransfer.getData("text/task-id") || draggingTaskId;
                } catch {
                  return draggingTaskId;
                }
              })() || null;
            if (id) void moveTaskState(id, state);
            setDragOverState(null);
          }}
          className={`rounded-2xl p-4 backdrop-blur-sm border bg-white/70 border-white/30 shadow-md dark:bg-neutral-800/60 dark:border-neutral-700/50 animate-fade-in ${
            isHover ? "dnd-hover" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-md bg-gradient-to-r ${accent}`} />
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
            </div>
            <span className="text-sm text-neutral-600 dark:text-neutral-300">{description}</span>
          </div>

          {grouped.length === 0 ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-300">No tasks here yet.</div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([catId, items]) => {
                const cat = categoryById.get(catId);
                const key = `${state}:${catId}`;
                const collapsed = !!collapsedGroups[key];

                return (
                  <div
                    key={key}
                    className="rounded-xl border bg-white/60-white/30 dark:bg-neutral-800/50 dark:border-neutral-700/50"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCollapse(state, catId)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/70 dark:hover:bg-neutral-700/50 transition-colors focus-ring"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-5 w-5 rounded-md bg-gradient-to-r ${cat?.color ?? "from-gray-300 to-gray-400"}`} />
                        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                          {cat?.icon} {cat?.name ?? "Unknown"}
                        </span>
                        <span className="text-xs text-neutral-600 dark:text-neutral-300">({items.length})</span>
                      </div>
                      <span className="text-xs text-neutral-600 dark:text-neutral-300">
                        {collapsed ? "Expand" : "Collapse"}
                      </span>
                    </button>

                    {!collapsed && (
                      <div className="px-3 pb-3 space-y-2">
                        {items.map((t) => (
                          <TaskCard key={t.id} t={t} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      );
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column
          title="To Do"
          state="todo"
          description="Plan and queue"
          accent="from-blue-500 to-cyan-500"
        />
        <Column
          title="In Progress"
          state="inprogress"
          description="You're on it"
          accent="from-amber-500 to-orange-500"
        />
        <Column
          title="Done"
          state="done"
          description="Celebrate wins"
          accent="from-emerald-500 to-teal-500"
        />
      </div>
    );
  };

  const CategoryManager = () => {
    const [name, setName] = React.useState<string>("");

    return (
      <section className="rounded-2xl p-4 backdrop-blur-sm border bg-white/70 border-white/30 shadow-md dark:bg-neutral-800/60 dark:border-neutral-700/50 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Manage Categories</h2>
          </div>
          <ThemeToggle />
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">
          Create custom categories to tailor your workflow. Each category has a color and icon.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length === 0) return;
            void addCategory(name.trim());
            setName("");
          }}
          className="flex items-center gap-2 mb-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus-ring"
          />
          <button
            type="submit"
            className="rounded-xl px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:brightness-110 focus-ring"
          >
            Add
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map((c) => (
            <div
              key={c.id}
              className="rounded-xl px-3 py-3 bg-white/80 dark:bg-neutral-800/60 border border-white/40 dark:border-neutral-700/60 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md bg-gradient-to-r ${c.color}`} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {c.icon} {c.name}
                  </span>
                  <span className="text-xs text-neutral-600 dark:text-neutral-300">{c.id}</span>
                </div>
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-300">
                {tasks.filter((t) => t.category_id === c.id).length} tasks
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const TaskModal = () => {
    if (!isTaskModalOpen) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-30 flex items-end md:items-center justify-center px-4 py-6 bg-black/30"
        onClick={() => setIsTaskModalOpen(false)}
      >
        <div
          className="w-full max-w-lg rounded-2xl p-4 md:p-6 backdrop-blur-sm border bg-white/80 border-white/30 shadow-2xl dark:bg-neutral-800/70 dark:border-neutral-700/50 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {editingTaskId ? "Edit Task" : "New Task"}
            </h3>
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="rounded-md px-2 py-1 text-sm bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-ring"
            >
              Close
            </button>
          </div>

          <form onSubmit={saveTask} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Title</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus-ring"
                placeholder="Task title"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Category</label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 focus-ring"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Priority</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as Priority)}
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 focus-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">State</label>
                <select
                  value={formState}
                  onChange={(e) => setFormState(e.target.value as TaskState)}
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 focus-ring"
                >
                  <option value="todo">To Do</option>
                  <option value="inprogress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Due date</label>
                <input
                  type="datetime-local"
                  value={formDueAt}
                  onChange={(e) => setFormDueAt(e.target.value)}
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 focus-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-white/40 dark:border-neutral-700/60 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus-ring"
                placeholder="Optional details..."
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              {editingTaskId && (
                <button
                  type="button"
                  onClick={() => {
                    if (editingTaskId) void deleteTask(editingTaskId);
                    setIsTaskModalOpen(false);
                  }}
                  className="rounded-xl px-4 py-2 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 focus-ring"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="rounded-xl px-4 py-2 bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-ring"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl px-4 py-2 bg-gradient-to-r from-blue-600 via-violet-600 to-teal-500 text-white hover:brightness-110 focus-ring"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen calm-gradient relative overflow-hidden ${isDark ? "dark" : ""}`}>
      {/* Landing Gate */}
      <div
        className={`min-h-screen flex items-center justify-center px-6 transition-all duration-700 ${
          isUnlocked ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100"
        }`}
      >
        <div
          className={`max-w-md w-full animate-slide-up hover-scale backdrop-blur-sm rounded-2xl border 
          bg-white/70 border-white/30 shadow-xl dark:bg-neutral-800/60 dark:border-neutral-700/50`}
        >
          <div className="p-8">
            {/* Logo + App Name */}
            <div className="flex items-center gap-3 mb-6 animate-fade-in">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-teal-400 shadow-md" />
              <div className="flex flex-col">
                <span className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Nimbus Tasks
</span>
                <span className="text-sm text-neutral-600 dark:text-neutral-300">
                  Plan your day, focus deeply, and get more done.
                </span>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-6 text-balance">
              A calming space to organize Personal, Work, and custom tasks with smart reminders.
            </p>

            {/* Password Form */}
            <form onSubmit={onSubmitGate} className="space-y-4">
              <div className={`transition-transform ${isShaking ? "animate-shake" : ""}`}>
                <label
                  htmlFor="app-password"
                  className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2"
                >
                  Enter Access Password
                </label>
                <div className="relative">
                  <input
                    id="app-password"
                    name="app-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onEnterKey}
                    autoComplete="off"
                    className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/60 px-4 py-3 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus-ring"
                    placeholder="Password"
                    aria-invalid={!!error}
                    aria-describedby={error ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-neutral-700/50 focus-ring"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {error && (
                  <p
                    id="password-error"
                    role="alert"
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                    aria-live="polite"
                  >
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-violet-600 to-teal-500 text-white font-medium py-3 shadow-md hover:shadow-lg hover:brightness-105 active:brightness-95 transition-all focus-ring disabled:opacity-60"
              >
                {isSubmitting ? "Checking..." : "Enter App"}
              </button>

              {/* Helper text */}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                This is a simple password gate. You can extend authentication later.
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Main App (revealed after unlock) */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          isUnlocked ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Top bar (mobile) */}
        <div className="md:hidden px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowMobileNav((s) => !s)}
            className="rounded-xl px-3 py-2 bg-white/70 dark:bg-neutral-800/60 border border-white/30 dark:border-neutral-700/60 text-neutral-800 dark:text-neutral-200 focus-ring"
            aria-label="Toggle navigation"
          >
            ☰ Menu
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={openCreateTask}
              className="rounded-xl px-3 py-2 text-sm bg-gradient-to-r from-blue-600 via-violet-600 to-teal-500 text-white hover:brightness-110 focus-ring"
            >
              + New Task
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 pb-10 md:pb-16">
          <div className="pt-4 md:pt-10 grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4 md:gap-6">
            {/* Sidebar (desktop) */}
            <div className="hidden md:block">
              <Sidebar />
            </div>

            {/* Mobile drawer */}
            <div
              className={`md:hidden fixed top-16 left-4 right-4 z-20 transition-all duration-300 ${
                showMobileNav ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
              }`}
            >
              <Sidebar />
            </div>

            {/* Main content */}
            <main className="space-y-4 md:space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-gradient-to-r from-blue-500 via-violet-500 to-teal-400" />
                  <h1 className="text-xl md:text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {activeTab === "overview" ? "All Tasks Overview" : "Category Management"}
                  </h1>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <ThemeToggle />
                  <button
                    type="button"
                    onClick={openCreateTask}
                    className="rounded-xl px-3 py-2 text-sm bg-gradient-to-r from-blue-600 via-violet-600 to-teal-500 text-white hover:brightness-110 focus-ring"
                  >
                    + New Task
                  </button>
                </div>
              </div>

              {isLoadingData && (
                <div className="rounded-2xl p-4 backdrop-blur-sm border bg-white/70 border-white/30 shadow-md dark:bg-neutral-800/60 dark:border-neutral-700/50">
                  <div className="text-sm text-neutral-700 dark:text-neutral-300">Loading your data...</div>
                </div>
              )}

              {!isLoadingData && activeTab === "overview" && (
                <>
                  <ProductivitySummary />
                  <WeeklyCalendar />
                  <Overview />
                </>
              )}
              {!isLoadingData && activeTab === "categories" && <CategoryManager />}
            </main>
          </div>
        </div>

        {/* Task Modal */}
        <TaskModal />
      </div>
    </div>
  );
}
