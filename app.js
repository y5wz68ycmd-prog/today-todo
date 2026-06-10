const STORAGE_KEY = "simple-todo-list";
const HISTORY_KEY = `${STORAGE_KEY}-history`;
const SETTINGS_KEY = `${STORAGE_KEY}-settings`;
const SYNC_SESSION_KEY = `${STORAGE_KEY}-sync-session`;
const BACKUP_VERSION = 5;
const PRIORITIES = new Set(["high", "medium", "low"]);
const REPEATS = new Set(["none", "daily", "weekly", "monthly"]);
const PRIORITY_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};
const REPEAT_LABELS = {
  none: "",
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};
const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};

const elements = {
  form: document.querySelector("#todo-form"),
  input: document.querySelector("#todo-input"),
  dueDate: document.querySelector("#due-date"),
  priority: document.querySelector("#priority"),
  repeat: document.querySelector("#repeat"),
  reminderTime: document.querySelector("#reminder-time"),
  category: document.querySelector("#category"),
  formMessage: document.querySelector("#form-message"),
  list: document.querySelector("#todo-list"),
  template: document.querySelector("#todo-template"),
  count: document.querySelector("#task-count"),
  emptyState: document.querySelector("#empty-state"),
  clearCompleted: document.querySelector("#clear-completed"),
  syncButton: document.querySelector("#sync-button"),
  notificationButton: document.querySelector("#notification-button"),
  filters: document.querySelectorAll(".filter"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  installButton: document.querySelector("#install-button"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  editText: document.querySelector("#edit-text"),
  editDueDate: document.querySelector("#edit-due-date"),
  editPriority: document.querySelector("#edit-priority"),
  editRepeat: document.querySelector("#edit-repeat"),
  editReminderTime: document.querySelector("#edit-reminder-time"),
  editCategory: document.querySelector("#edit-category"),
  editSubtaskInput: document.querySelector("#edit-subtask-input"),
  editSubtaskAdd: document.querySelector("#edit-subtask-add"),
  editSubtaskList: document.querySelector("#edit-subtask-list"),
  editSubtaskCount: document.querySelector("#subtask-editor-count"),
  editMessage: document.querySelector("#edit-message"),
  editClose: document.querySelector("#edit-close"),
  editCancel: document.querySelector("#edit-cancel"),
  historyButton: document.querySelector("#history-button"),
  historyDialog: document.querySelector("#history-dialog"),
  historyList: document.querySelector("#history-list"),
  historyEmpty: document.querySelector("#history-empty"),
  historyClose: document.querySelector("#history-close"),
  historyDone: document.querySelector("#history-done"),
  clearHistory: document.querySelector("#clear-history"),
  syncDialog: document.querySelector("#sync-dialog"),
  syncClose: document.querySelector("#sync-close"),
  syncDone: document.querySelector("#sync-done"),
  syncStatus: document.querySelector("#sync-status"),
  syncSetup: document.querySelector("#sync-setup"),
  syncAuthForm: document.querySelector("#sync-auth-form"),
  syncEmail: document.querySelector("#sync-email"),
  syncPassword: document.querySelector("#sync-password"),
  syncMessage: document.querySelector("#sync-message"),
  syncSignup: document.querySelector("#sync-signup"),
  syncControls: document.querySelector("#sync-controls"),
  syncUserEmail: document.querySelector("#sync-user-email"),
  syncUpload: document.querySelector("#sync-upload"),
  syncDownload: document.querySelector("#sync-download"),
  syncLogout: document.querySelector("#sync-logout"),
  exportButton: document.querySelector("#export-button"),
  importButton: document.querySelector("#import-button"),
  importInput: document.querySelector("#import-input"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  toastAction: document.querySelector("#toast-action"),
};

let todos = loadTodos();
let history = loadHistory();
let settings = loadSettings();
let currentFilter = "all";
let searchQuery = "";
let currentSort = settings.sort;
let editingId = null;
let toastTimer = null;
let undoAction = null;
let draggedTodoId = null;
let installPrompt = null;
let editingSubtasks = [];
const syncConfig = {
  supabaseUrl: String(window.TODO_SYNC_CONFIG?.supabaseUrl ?? "")
    .replace(/\/+$/, ""),
  supabaseAnonKey: String(
    window.TODO_SYNC_CONFIG?.supabaseAnonKey ?? "",
  ),
};
let syncSession = loadSyncSession();

document.querySelector("#today").textContent = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadSyncSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SYNC_SESSION_KEY));
    return session?.access_token && session?.user ? session : null;
  } catch {
    return null;
  }
}

function saveSyncSession(session) {
  syncSession = session;

  if (session) {
    localStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SYNC_SESSION_KEY);
  }

  updateSyncUI();
}

function isSyncConfigured() {
  return Boolean(syncConfig.supabaseUrl && syncConfig.supabaseAnonKey);
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeDate(value) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeReminderTime(value) {
  const time = String(value ?? "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

function normalizeCategory(value) {
  return normalizeText(value).slice(0, 30) || "未分類";
}

function normalizeTimestamp(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeTodo(todo, index = 0) {
  const fallbackTime = Date.now() - index;
  const completed = Boolean(todo?.completed);

  return {
    id: typeof todo?.id === "string" ? todo.id : createId(),
    text: normalizeText(todo?.text).slice(0, 100),
    dueDate: normalizeDate(todo?.dueDate),
    priority: PRIORITIES.has(todo?.priority) ? todo.priority : "medium",
    repeat: REPEATS.has(todo?.repeat) ? todo.repeat : "none",
    reminderTime: normalizeReminderTime(todo?.reminderTime),
    notifiedFor: typeof todo?.notifiedFor === "string"
      ? todo.notifiedFor
      : "",
    subtasks: Array.isArray(todo?.subtasks)
      ? todo.subtasks
          .map((subtask) => ({
            id: typeof subtask?.id === "string" ? subtask.id : createId(),
            text: normalizeText(subtask?.text).slice(0, 80),
            completed: Boolean(subtask?.completed),
          }))
          .filter((subtask) => subtask.text)
      : [],
    category: normalizeCategory(todo?.category),
    completed,
    createdAt: normalizeTimestamp(todo?.createdAt, fallbackTime),
    updatedAt: normalizeTimestamp(todo?.updatedAt, fallbackTime),
    completedAt: completed
      ? normalizeTimestamp(todo?.completedAt, fallbackTime)
      : null,
    order: Number.isFinite(todo?.order) ? todo.order : index,
  };
}

function loadTodos() {
  return parseStoredArray(STORAGE_KEY)
    .map(normalizeTodo)
    .filter((todo) => todo.text);
}

function loadHistory() {
  return parseStoredArray(HISTORY_KEY)
    .map((entry, index) => ({
      id: typeof entry?.id === "string" ? entry.id : createId(),
      todoId: typeof entry?.todoId === "string" ? entry.todoId : "",
      text: normalizeText(entry?.text).slice(0, 100),
      completedAt: normalizeTimestamp(
        entry?.completedAt,
        Date.now() - index,
      ),
    }))
    .filter((entry) => entry.text);
}

function loadSettings() {
  const defaults = {
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    sort: "newest",
  };

  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    const validSorts = [
      "manual",
      "newest",
      "oldest",
      "due",
      "priority",
      "category",
    ];
    return {
      theme: ["light", "dark"].includes(stored?.theme)
        ? stored.theme
        : defaults.theme,
      sort: validSorts.includes(stored?.sort) ? stored.sort : defaults.sort,
    };
  } catch {
    return defaults;
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOverdue(todo) {
  return Boolean(todo.dueDate) &&
    todo.dueDate < getLocalDateString() &&
    !todo.completed;
}

function formatDueDate(todo) {
  if (!todo.dueDate) {
    return "";
  }

  const today = getLocalDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (todo.dueDate === today) {
    return "期限: 今日";
  }

  if (todo.dueDate === getLocalDateString(tomorrow)) {
    return "期限: 明日";
  }

  const date = new Date(`${todo.dueDate}T00:00:00`);
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);

  return `${isOverdue(todo) ? "期限切れ" : "期限"}: ${formatted}`;
}

function getNextDueDate(todo) {
  let nextDate = todo.dueDate
    ? new Date(`${todo.dueDate}T00:00:00`)
    : new Date(`${getLocalDateString()}T00:00:00`);
  const today = getLocalDateString();

  do {
    if (todo.repeat === "daily") {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (todo.repeat === "weekly") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (todo.repeat === "monthly") {
      const originalDay = nextDate.getDate();
      nextDate.setDate(1);
      nextDate.setMonth(nextDate.getMonth() + 1);
      const lastDay = new Date(
        nextDate.getFullYear(),
        nextDate.getMonth() + 1,
        0,
      ).getDate();
      nextDate.setDate(Math.min(originalDay, lastDay));
    }
  } while (getLocalDateString(nextDate) <= today);

  return getLocalDateString(nextDate);
}

function formatHistoryDate(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getVisibleTodos() {
  const filtered = todos.filter((todo) => {
    if (currentFilter === "active" && todo.completed) {
      return false;
    }

    if (currentFilter === "completed" && !todo.completed) {
      return false;
    }

    if (currentFilter === "overdue" && !isOverdue(todo)) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const searchable = [
      todo.text,
      todo.category,
      ...todo.subtasks.map((subtask) => subtask.text),
    ].join(" ").toLocaleLowerCase("ja");
    return searchable.includes(searchQuery);
  });

  return filtered.sort((a, b) => {
    if (currentSort === "manual") {
      return a.order - b.order;
    }

    if (currentSort === "oldest") {
      return a.createdAt - b.createdAt;
    }

    if (currentSort === "due") {
      if (a.completed !== b.completed) {
        return Number(a.completed) - Number(b.completed);
      }

      return (a.dueDate || "9999-12-31").localeCompare(
        b.dueDate || "9999-12-31",
      );
    }

    if (currentSort === "priority") {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        b.createdAt - a.createdAt;
    }

    if (currentSort === "category") {
      return a.category.localeCompare(b.category, "ja") ||
        b.createdAt - a.createdAt;
    }

    return b.createdAt - a.createdAt;
  });
}

function render() {
  elements.list.replaceChildren();
  const visibleTodos = getVisibleTodos();
  const fragment = document.createDocumentFragment();
  const canReorder =
    currentSort === "manual" &&
    currentFilter === "all" &&
    !searchQuery;
  const orderedTodos = [...todos].sort((a, b) => a.order - b.order);

  visibleTodos.forEach((todo) => {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    const checkbox = item.querySelector(".todo-checkbox");
    const priorityDot = item.querySelector(".priority-dot");
    const text = item.querySelector(".todo-text");
    const category = item.querySelector(".category-badge");
    const dueDate = item.querySelector(".todo-due-date");
    const repeat = item.querySelector(".repeat-badge");
    const reminder = item.querySelector(".reminder-badge");
    const subtaskToggle = item.querySelector(".subtask-toggle");
    const subtaskList = item.querySelector(".subtask-list");
    const dragHandle = item.querySelector(".drag-handle");
    const moveUpButton = item.querySelector(".move-up-button");
    const moveDownButton = item.querySelector(".move-down-button");
    const editButton = item.querySelector(".edit-button");
    const deleteButton = item.querySelector(".delete-button");

    item.dataset.id = todo.id;
    item.dataset.priority = todo.priority;
    item.classList.toggle("completed", todo.completed);
    item.classList.toggle("overdue", isOverdue(todo));
    item.classList.toggle("reorder-enabled", canReorder);
    item.draggable = canReorder;

    checkbox.checked = todo.completed;
    checkbox.setAttribute(
      "aria-label",
      `${todo.text}を${todo.completed ? "未完了" : "完了"}にする`,
    );

    priorityDot.removeAttribute("aria-hidden");
    priorityDot.setAttribute("role", "img");
    priorityDot.setAttribute(
      "aria-label",
      `優先度${PRIORITY_LABELS[todo.priority]}`,
    );
    priorityDot.title = `優先度: ${PRIORITY_LABELS[todo.priority]}`;

    text.textContent = todo.text;
    category.textContent = todo.category;
    category.setAttribute("aria-label", `カテゴリー: ${todo.category}`);
    dueDate.dateTime = todo.dueDate;
    dueDate.textContent = formatDueDate(todo);
    repeat.textContent = todo.repeat === "none"
      ? ""
      : `↻ ${REPEAT_LABELS[todo.repeat]}`;
    repeat.setAttribute(
      "aria-label",
      todo.repeat === "none"
        ? ""
        : `繰り返し: ${REPEAT_LABELS[todo.repeat]}`,
    );
    reminder.textContent = todo.reminderTime
      ? `通知 ${todo.reminderTime}`
      : "";

    if (todo.subtasks.length > 0) {
      const completedSubtasks = todo.subtasks.filter(
        (subtask) => subtask.completed,
      ).length;
      subtaskToggle.hidden = false;
      subtaskToggle.textContent =
        `サブタスク ${completedSubtasks}/${todo.subtasks.length} ▾`;
      subtaskToggle.setAttribute("aria-expanded", "false");
      subtaskToggle.setAttribute(
        "aria-label",
        `${todo.text}のサブタスクを表示`,
      );

      todo.subtasks.forEach((subtask) => {
        const subtaskItem = document.createElement("li");
        const subtaskLabel = document.createElement("label");
        const subtaskCheckbox = document.createElement("input");
        const subtaskText = document.createElement("span");

        subtaskItem.className = "subtask-item";
        subtaskItem.classList.toggle("completed", subtask.completed);
        subtaskCheckbox.type = "checkbox";
        subtaskCheckbox.checked = subtask.completed;
        subtaskCheckbox.setAttribute(
          "aria-label",
          `${subtask.text}を${subtask.completed ? "未完了" : "完了"}にする`,
        );
        subtaskText.textContent = subtask.text;
        subtaskCheckbox.addEventListener("change", () => {
          toggleSubtask(todo.id, subtask.id);
        });
        subtaskLabel.append(subtaskCheckbox, subtaskText);
        subtaskItem.append(subtaskLabel);
        subtaskList.append(subtaskItem);
      });

      subtaskToggle.addEventListener("click", () => {
        const expanded = subtaskToggle.getAttribute("aria-expanded") === "true";
        subtaskToggle.setAttribute("aria-expanded", String(!expanded));
        subtaskToggle.textContent =
          `サブタスク ${completedSubtasks}/${todo.subtasks.length} ` +
          `${expanded ? "▾" : "▴"}`;
        subtaskList.hidden = expanded;
      });
    }

    editButton.setAttribute("aria-label", `${todo.text}を編集`);
    deleteButton.setAttribute("aria-label", `${todo.text}を削除`);
    dragHandle.setAttribute(
      "aria-label",
      `${todo.text}をドラッグして並べ替える`,
    );
    moveUpButton.setAttribute("aria-label", `${todo.text}を上へ移動`);
    moveDownButton.setAttribute("aria-label", `${todo.text}を下へ移動`);

    const orderIndex = orderedTodos.findIndex((itemTodo) => itemTodo.id === todo.id);
    moveUpButton.disabled = !canReorder || orderIndex <= 0;
    moveDownButton.disabled =
      !canReorder || orderIndex === orderedTodos.length - 1;

    checkbox.addEventListener("change", () => toggleTodo(todo.id));
    moveUpButton.addEventListener("click", () => moveTodo(todo.id, -1));
    moveDownButton.addEventListener("click", () => moveTodo(todo.id, 1));
    editButton.addEventListener("click", () => openEditDialog(todo.id));
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    item.addEventListener("dragstart", (event) => {
      if (!canReorder) {
        event.preventDefault();
        return;
      }

      draggedTodoId = todo.id;
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", todo.id);
    });
    item.addEventListener("dragover", (event) => {
      if (!draggedTodoId || draggedTodoId === todo.id) {
        return;
      }

      event.preventDefault();
      item.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      reorderTodo(draggedTodoId, todo.id);
    });
    item.addEventListener("dragend", () => {
      draggedTodoId = null;
      item.classList.remove("dragging");
      document
        .querySelectorAll(".todo-item.drag-over")
        .forEach((dragItem) => dragItem.classList.remove("drag-over"));
    });
    fragment.append(item);
  });

  elements.list.append(fragment);

  const remaining = todos.filter((todo) => !todo.completed).length;
  const overdue = todos.filter(isOverdue).length;
  elements.count.textContent =
    todos.length === 0
      ? "タスクはありません"
      : `${todos.length}件中 ${remaining}件が未完了` +
        (overdue ? `・${overdue}件が期限切れ` : "");

  elements.clearCompleted.disabled = !todos.some((todo) => todo.completed);
  elements.historyButton.textContent = `完了履歴 (${history.length})`;

  elements.emptyState.hidden = visibleTodos.length > 0;
  const emptyTitle = elements.emptyState.querySelector("p");
  const emptyDescription = elements.emptyState.querySelector("span");

  if (todos.length === 0) {
    emptyTitle.textContent = "まだタスクはありません";
    emptyDescription.textContent = "上の入力欄から追加してみましょう";
  } else if (searchQuery) {
    emptyTitle.textContent = "検索結果がありません";
    emptyDescription.textContent = "別の言葉で検索してみてください";
  } else {
    emptyTitle.textContent = "該当するタスクはありません";
    emptyDescription.textContent = "別の表示に切り替えてみてください";
  }
}

function validateTask(text, ignoredId = null) {
  if (!text) {
    return "やることを入力してください。";
  }

  const duplicate = todos.some(
    (todo) =>
      todo.id !== ignoredId &&
      !todo.completed &&
      todo.text.toLocaleLowerCase("ja") === text.toLocaleLowerCase("ja"),
  );

  if (duplicate) {
    return "同じ未完了タスクがすでにあります。";
  }

  return "";
}

function setFieldError(input, messageElement, message) {
  messageElement.textContent = message;
  input.setAttribute("aria-invalid", String(Boolean(message)));

  if (message) {
    input.focus();
  }
}

function addTodo(
  text,
  dueDate,
  priority,
  repeat,
  reminderTime,
  category,
) {
  const now = Date.now();
  const firstOrder = todos.length
    ? Math.min(...todos.map((todo) => todo.order)) - 1
    : 0;
  todos.push({
    id: createId(),
    text,
    dueDate,
    priority,
    repeat,
    reminderTime,
    notifiedFor: "",
    subtasks: [],
    category,
    completed: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    order: firstOrder,
  });
  saveTodos();
  render();
}

function saveManualOrder(orderedTodos) {
  const orderById = new Map(
    orderedTodos.map((todo, index) => [todo.id, index]),
  );
  todos = todos.map((todo) => ({
    ...todo,
    order: orderById.get(todo.id) ?? todo.order,
  }));
  saveTodos();
  render();
}

function toggleSubtask(todoId, subtaskId) {
  todos = todos.map((todo) =>
    todo.id === todoId
      ? {
          ...todo,
          subtasks: todo.subtasks.map((subtask) =>
            subtask.id === subtaskId
              ? { ...subtask, completed: !subtask.completed }
              : subtask,
          ),
          updatedAt: Date.now(),
        }
      : todo,
  );
  saveTodos();
  render();
}

function moveTodo(id, direction) {
  const orderedTodos = [...todos].sort((a, b) => a.order - b.order);
  const currentIndex = orderedTodos.findIndex((todo) => todo.id === id);
  const targetIndex = currentIndex + direction;

  if (
    currentIndex === -1 ||
    targetIndex < 0 ||
    targetIndex >= orderedTodos.length
  ) {
    return;
  }

  const [movedTodo] = orderedTodos.splice(currentIndex, 1);
  orderedTodos.splice(targetIndex, 0, movedTodo);
  saveManualOrder(orderedTodos);
}

function reorderTodo(draggedId, targetId) {
  if (!draggedId || draggedId === targetId) {
    return;
  }

  const orderedTodos = [...todos].sort((a, b) => a.order - b.order);
  const draggedIndex = orderedTodos.findIndex((todo) => todo.id === draggedId);
  const targetIndex = orderedTodos.findIndex((todo) => todo.id === targetId);

  if (draggedIndex === -1 || targetIndex === -1) {
    return;
  }

  const [movedTodo] = orderedTodos.splice(draggedIndex, 1);
  orderedTodos.splice(targetIndex, 0, movedTodo);
  saveManualOrder(orderedTodos);
}

function toggleTodo(id) {
  const now = Date.now();
  let recurringMessage = "";

  todos = todos.map((todo) => {
    if (todo.id !== id) {
      return todo;
    }

    const completed = !todo.completed;

    if (completed) {
      history.unshift({
        id: createId(),
        todoId: todo.id,
        text: todo.text,
        completedAt: now,
      });
      history = history.slice(0, 200);

      if (todo.repeat !== "none") {
        const nextDueDate = getNextDueDate(todo);
        recurringMessage =
          `${REPEAT_LABELS[todo.repeat]}の次回タスクを` +
          `${formatDueDate({ ...todo, dueDate: nextDueDate })}に設定しました。`;

        return {
          ...todo,
          dueDate: nextDueDate,
          completed: false,
          completedAt: null,
          notifiedFor: "",
          subtasks: todo.subtasks.map((subtask) => ({
            ...subtask,
            completed: false,
          })),
          updatedAt: now,
        };
      }
    }

    return {
      ...todo,
      completed,
      completedAt: completed ? now : null,
      updatedAt: now,
    };
  });

  saveTodos();
  saveHistory();
  render();

  if (recurringMessage) {
    showToast(recurringMessage);
  }
}

function deleteTodo(id) {
  const index = todos.findIndex((todo) => todo.id === id);

  if (index === -1) {
    return;
  }

  const [deleted] = todos.splice(index, 1);
  saveTodos();
  render();

  showToast("タスクを削除しました。", () => {
    todos.splice(index, 0, deleted);
    saveTodos();
    render();
    showToast("タスクを元に戻しました。");
  });
}

function openEditDialog(id) {
  const todo = todos.find((item) => item.id === id);

  if (!todo) {
    return;
  }

  editingId = id;
  elements.editText.value = todo.text;
  elements.editDueDate.value = todo.dueDate;
  elements.editPriority.value = todo.priority;
  elements.editRepeat.value = todo.repeat;
  elements.editReminderTime.value = todo.reminderTime;
  elements.editCategory.value =
    todo.category === "未分類" ? "" : todo.category;
  editingSubtasks = todo.subtasks.map((subtask) => ({ ...subtask }));
  renderEditSubtasks();
  elements.editMessage.textContent = "";
  elements.editText.removeAttribute("aria-invalid");
  elements.editDialog.showModal();
  elements.editText.focus();
  elements.editText.select();
}

function closeEditDialog() {
  editingId = null;
  editingSubtasks = [];
  elements.editDialog.close();
}

function renderEditSubtasks() {
  elements.editSubtaskList.replaceChildren();
  elements.editSubtaskCount.textContent = `${editingSubtasks.length}件`;
  const fragment = document.createDocumentFragment();

  editingSubtasks.forEach((subtask) => {
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");
    const removeButton = document.createElement("button");

    item.className = "edit-subtask-item";
    item.classList.toggle("completed", subtask.completed);
    checkbox.type = "checkbox";
    checkbox.checked = subtask.completed;
    checkbox.setAttribute(
      "aria-label",
      `${subtask.text}を${subtask.completed ? "未完了" : "完了"}にする`,
    );
    text.textContent = subtask.text;
    removeButton.className = "edit-subtask-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `${subtask.text}を削除`);

    checkbox.addEventListener("change", () => {
      editingSubtasks = editingSubtasks.map((itemSubtask) =>
        itemSubtask.id === subtask.id
          ? { ...itemSubtask, completed: !itemSubtask.completed }
          : itemSubtask,
      );
      renderEditSubtasks();
    });
    removeButton.addEventListener("click", () => {
      editingSubtasks = editingSubtasks.filter(
        (itemSubtask) => itemSubtask.id !== subtask.id,
      );
      renderEditSubtasks();
    });

    item.append(checkbox, text, removeButton);
    fragment.append(item);
  });

  elements.editSubtaskList.append(fragment);
}

function addEditingSubtask() {
  const text = normalizeText(elements.editSubtaskInput.value).slice(0, 80);

  if (!text) {
    elements.editSubtaskInput.focus();
    return;
  }

  editingSubtasks.push({
    id: createId(),
    text,
    completed: false,
  });
  elements.editSubtaskInput.value = "";
  renderEditSubtasks();
  elements.editSubtaskInput.focus();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  const fragment = document.createDocumentFragment();

  history.forEach((entry) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const time = document.createElement("time");

    item.className = "history-item";
    text.textContent = entry.text;
    time.dateTime = new Date(entry.completedAt).toISOString();
    time.textContent = formatHistoryDate(entry.completedAt);
    item.append(text, time);
    fragment.append(item);
  });

  elements.historyList.append(fragment);
  elements.historyEmpty.hidden = history.length > 0;
  elements.clearHistory.disabled = history.length === 0;
}

function openHistoryDialog() {
  renderHistory();
  elements.historyDialog.showModal();
  elements.historyClose.focus();
}

function closeHistoryDialog() {
  elements.historyDialog.close();
}

function setTheme(theme) {
  settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  elements.themeIcon.textContent = theme === "dark" ? "☀" : "☾";
  elements.themeToggle.setAttribute(
    "aria-label",
    theme === "dark"
      ? "ライトモードに切り替える"
      : "ダークモードに切り替える",
  );
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", theme === "dark" ? "#141b18" : "#edf0e8");
  saveSettings();
}

function showToast(message, action = null) {
  clearTimeout(toastTimer);
  undoAction = action;
  elements.toastMessage.textContent = message;
  elements.toastAction.hidden = !action;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
    undoAction = null;
  }, 5000);
}

async function syncRequest(path, options = {}) {
  if (!isSyncConfigured()) {
    throw new Error("同期設定がありません。");
  }

  const headers = {
    apikey: syncConfig.supabaseAnonKey,
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (syncSession?.access_token) {
    headers.Authorization = `Bearer ${syncSession.access_token}`;
  }

  const response = await fetch(`${syncConfig.supabaseUrl}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401) {
      saveSyncSession(null);
    }

    throw new Error(
      data?.msg ||
        data?.message ||
        data?.error_description ||
        "クラウドとの通信に失敗しました。",
    );
  }

  return data;
}

function updateSyncUI() {
  const configured = isSyncConfigured();
  const loggedIn = configured && Boolean(syncSession?.access_token);

  elements.syncSetup.hidden = configured;
  elements.syncAuthForm.hidden = !configured || loggedIn;
  elements.syncControls.hidden = !loggedIn;
  elements.syncButton.textContent = loggedIn ? "同期済み端末" : "端末間同期";
  elements.syncStatus.textContent = !configured
    ? "同期設定がまだありません。"
    : loggedIn
      ? "クラウドへ保存、または別端末のデータを復元できます。"
      : "アカウントへログインしてください。";
  elements.syncUserEmail.textContent = syncSession?.user?.email || "";
}

async function authenticateSync(mode) {
  const email = normalizeText(elements.syncEmail.value);
  const password = elements.syncPassword.value;

  if (!email || password.length < 8) {
    elements.syncMessage.textContent =
      "メールアドレスと8文字以上のパスワードを入力してください。";
    return;
  }

  elements.syncMessage.textContent = "";

  try {
    const path = mode === "signup"
      ? "/auth/v1/signup"
      : "/auth/v1/token?grant_type=password";
    const data = await syncRequest(path, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const session = data.session || data;

    if (!session?.access_token) {
      elements.syncMessage.textContent =
        "確認メールを送信しました。メール確認後にログインしてください。";
      return;
    }

    saveSyncSession(session);
    elements.syncPassword.value = "";
    showToast("クラウド同期へログインしました。");
  } catch (error) {
    elements.syncMessage.textContent = error.message;
  }
}

function getSyncPayload() {
  return {
    version: BACKUP_VERSION,
    todos,
    history,
    settings,
  };
}

async function uploadSyncData() {
  try {
    await syncRequest("/rest/v1/todo_sync?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: syncSession.user.id,
        payload: getSyncPayload(),
        updated_at: new Date().toISOString(),
      }),
    });
    showToast("クラウドへ保存しました。");
  } catch (error) {
    showToast(error.message);
  }
}

function normalizeImportedHistory(entries) {
  return Array.isArray(entries)
    ? entries
        .map((entry, index) => ({
          id: typeof entry?.id === "string" ? entry.id : createId(),
          todoId: typeof entry?.todoId === "string" ? entry.todoId : "",
          text: normalizeText(entry?.text).slice(0, 100),
          completedAt: normalizeTimestamp(
            entry?.completedAt,
            Date.now() - index,
          ),
        }))
        .filter((entry) => entry.text)
    : [];
}

function applySyncedPayload(payload) {
  todos = Array.isArray(payload?.todos)
    ? payload.todos.map(normalizeTodo).filter((todo) => todo.text)
    : [];
  history = normalizeImportedHistory(payload?.history);

  if (payload?.settings) {
    settings = {
      ...settings,
      theme: ["light", "dark"].includes(payload.settings.theme)
        ? payload.settings.theme
        : settings.theme,
      sort: [
        "manual",
        "newest",
        "oldest",
        "due",
        "priority",
        "category",
      ].includes(payload.settings.sort)
        ? payload.settings.sort
        : settings.sort,
    };
  }

  currentSort = settings.sort;
  elements.sort.value = currentSort;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  saveSettings();
  setTheme(settings.theme);
  render();
}

async function downloadSyncData() {
  try {
    const rows = await syncRequest(
      `/rest/v1/todo_sync?user_id=eq.${encodeURIComponent(
        syncSession.user.id,
      )}&select=payload,updated_at`,
    );
    const row = rows?.[0];

    if (!row?.payload) {
      showToast("クラウドに保存されたデータはありません。");
      return;
    }

    if (
      !window.confirm(
        "現在の端末データをクラウドの内容で置き換えますか？",
      )
    ) {
      return;
    }

    applySyncedPayload(row.payload);
    showToast("クラウドから復元しました。");
  } catch (error) {
    showToast(error.message);
  }
}

function openSyncDialog() {
  updateSyncUI();
  elements.syncMessage.textContent = "";
  elements.syncDialog.showModal();
  elements.syncClose.focus();
}

function closeSyncDialog() {
  elements.syncDialog.close();
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    elements.notificationButton.hidden = true;
    return;
  }

  elements.notificationButton.hidden = false;
  elements.notificationButton.textContent =
    Notification.permission === "granted"
      ? "通知は有効"
      : "通知を有効化";
  elements.notificationButton.disabled =
    Notification.permission === "granted";
}

async function requestNotifications() {
  if (location.protocol === "file:") {
    showToast("通知は公開版のアプリから有効にできます。");
    return;
  }

  if (!("Notification" in window)) {
    showToast("このブラウザは通知に対応していません。");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationButton();
  showToast(
    permission === "granted"
      ? "期限通知を有効にしました。"
      : "通知は許可されませんでした。",
  );

  if (permission === "granted") {
    checkReminders();
  }
}

async function showReminderNotification(todo) {
  const options = {
    body: todo.dueDate === getLocalDateString()
      ? `今日 ${todo.reminderTime} の予定です。`
      : `${formatDueDate(todo)}の予定です。`,
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: `todo-${todo.id}-${todo.dueDate}-${todo.reminderTime}`,
    data: { todoId: todo.id },
  };

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(todo.text, options);
  } else {
    new Notification(todo.text, options);
  }
}

async function checkReminders() {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const now = Date.now();
  const dueTodos = todos.filter((todo) => {
    if (todo.completed || !todo.dueDate || !todo.reminderTime) {
      return false;
    }

    const notificationKey = `${todo.dueDate}T${todo.reminderTime}`;
    const scheduledAt = new Date(notificationKey).getTime();
    const elapsed = now - scheduledAt;
    return (
      todo.notifiedFor !== notificationKey &&
      elapsed >= 0 &&
      elapsed < 24 * 60 * 60 * 1000
    );
  });

  for (const todo of dueTodos) {
    const notificationKey = `${todo.dueDate}T${todo.reminderTime}`;

    try {
      await showReminderNotification(todo);
      todos = todos.map((item) =>
        item.id === todo.id
          ? { ...item, notifiedFor: notificationKey }
          : item,
      );
    } catch {
      return;
    }
  }

  if (dueTodos.length > 0) {
    saveTodos();
  }
}

function exportBackup() {
  const backup = {
    app: "今日のToDo",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    todos,
    history,
    settings,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `todo-backup-${getLocalDateString()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("バックアップを書き出しました。");
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data?.todos)) {
      throw new Error("形式が正しくありません");
    }

    const importedTodos = data.todos
      .map(normalizeTodo)
      .filter((todo) => todo.text);
    const importedHistory = Array.isArray(data.history)
      ? data.history
          .map((entry, index) => ({
            id: typeof entry?.id === "string" ? entry.id : createId(),
            todoId: typeof entry?.todoId === "string" ? entry.todoId : "",
            text: normalizeText(entry?.text).slice(0, 100),
            completedAt: normalizeTimestamp(
              entry?.completedAt,
              Date.now() - index,
            ),
          }))
          .filter((entry) => entry.text)
      : [];
    const importedSettings = {
      theme: ["light", "dark"].includes(data.settings?.theme)
        ? data.settings.theme
        : settings.theme,
      sort: [
        "manual",
        "newest",
        "oldest",
        "due",
        "priority",
        "category",
      ].includes(data.settings?.sort)
        ? data.settings.sort
        : settings.sort,
    };

    if (
      todos.length > 0 &&
      !window.confirm("現在のタスクをバックアップの内容で置き換えますか？")
    ) {
      return;
    }

    todos = importedTodos;
    history = importedHistory;
    settings = importedSettings;
    currentSort = settings.sort;
    elements.sort.value = currentSort;
    saveTodos();
    saveHistory();
    setTheme(settings.theme);
    render();
    showToast(`${todos.length}件のタスクを読み込みました。`);
  } catch {
    showToast("バックアップを読み込めませんでした。");
  } finally {
    elements.importInput.value = "";
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = normalizeText(elements.input.value);
  const message = validateTask(text);
  const reminderTime = normalizeReminderTime(elements.reminderTime.value);

  if (message) {
    setFieldError(elements.input, elements.formMessage, message);
    return;
  }

  if (reminderTime && !elements.dueDate.value) {
    setFieldError(
      elements.input,
      elements.formMessage,
      "通知時刻を設定する場合は期限も選んでください。",
    );
    elements.dueDate.focus();
    return;
  }

  addTodo(
    text,
    normalizeDate(elements.dueDate.value),
    PRIORITIES.has(elements.priority.value)
      ? elements.priority.value
      : "medium",
    REPEATS.has(elements.repeat.value) ? elements.repeat.value : "none",
    reminderTime,
    normalizeCategory(elements.category.value),
  );
  elements.form.reset();
  elements.priority.value = "medium";
  elements.repeat.value = "none";
  setFieldError(elements.input, elements.formMessage, "");
  elements.input.focus();
});

elements.input.addEventListener("input", () => {
  if (elements.formMessage.textContent) {
    setFieldError(elements.input, elements.formMessage, "");
  }
});

elements.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = normalizeText(elements.editText.value);
  const message = validateTask(text, editingId);
  const reminderTime = normalizeReminderTime(elements.editReminderTime.value);

  if (message) {
    setFieldError(elements.editText, elements.editMessage, message);
    return;
  }

  if (reminderTime && !elements.editDueDate.value) {
    setFieldError(
      elements.editText,
      elements.editMessage,
      "通知時刻を設定する場合は期限も選んでください。",
    );
    elements.editDueDate.focus();
    return;
  }

  todos = todos.map((todo) =>
    todo.id === editingId
      ? {
          ...todo,
          text,
          dueDate: normalizeDate(elements.editDueDate.value),
          priority: PRIORITIES.has(elements.editPriority.value)
            ? elements.editPriority.value
            : "medium",
          repeat: REPEATS.has(elements.editRepeat.value)
            ? elements.editRepeat.value
            : "none",
          reminderTime,
          notifiedFor:
            todo.dueDate === normalizeDate(elements.editDueDate.value) &&
            todo.reminderTime === reminderTime
              ? todo.notifiedFor
              : "",
          category: normalizeCategory(elements.editCategory.value),
          subtasks: editingSubtasks.map((subtask) => ({ ...subtask })),
          updatedAt: Date.now(),
        }
      : todo,
  );
  saveTodos();
  render();
  closeEditDialog();
  showToast("タスクを更新しました。");
});

elements.editText.addEventListener("input", () => {
  if (elements.editMessage.textContent) {
    setFieldError(elements.editText, elements.editMessage, "");
  }
});

elements.editSubtaskAdd.addEventListener("click", addEditingSubtask);
elements.editSubtaskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addEditingSubtask();
  }
});

elements.editClose.addEventListener("click", closeEditDialog);
elements.editCancel.addEventListener("click", closeEditDialog);

elements.clearCompleted.addEventListener("click", () => {
  const completedCount = todos.filter((todo) => todo.completed).length;

  if (
    completedCount > 0 &&
    window.confirm(`完了済みの${completedCount}件を削除しますか？`)
  ) {
    todos = todos.filter((todo) => !todo.completed);
    saveTodos();
    render();
    showToast("完了済みタスクを削除しました。");
  }
});

elements.filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    elements.filters.forEach((filterButton) => {
      const active = filterButton === button;
      filterButton.classList.toggle("active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });
    render();
  });
});

elements.search.addEventListener("input", () => {
  searchQuery = normalizeText(elements.search.value).toLocaleLowerCase("ja");
  render();
});

elements.sort.value = currentSort;
elements.sort.addEventListener("change", () => {
  currentSort = elements.sort.value;
  settings.sort = currentSort;
  saveSettings();
  render();
});

elements.themeToggle.addEventListener("click", () => {
  setTheme(settings.theme === "dark" ? "light" : "dark");
});

elements.notificationButton.addEventListener("click", requestNotifications);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.installButton.hidden = false;
});

elements.installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    return;
  }

  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  elements.installButton.hidden = true;

  if (choice.outcome === "accepted") {
    showToast("アプリをホーム画面へ追加しました。");
  }
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  elements.installButton.hidden = true;
});

elements.historyButton.addEventListener("click", openHistoryDialog);
elements.historyClose.addEventListener("click", closeHistoryDialog);
elements.historyDone.addEventListener("click", closeHistoryDialog);
elements.clearHistory.addEventListener("click", () => {
  if (history.length > 0 && window.confirm("完了履歴をすべて消去しますか？")) {
    history = [];
    saveHistory();
    renderHistory();
    render();
    showToast("完了履歴を消去しました。");
  }
});

elements.syncButton.addEventListener("click", openSyncDialog);
elements.syncClose.addEventListener("click", closeSyncDialog);
elements.syncDone.addEventListener("click", closeSyncDialog);
elements.syncAuthForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticateSync("login");
});
elements.syncSignup.addEventListener("click", () => {
  authenticateSync("signup");
});
elements.syncUpload.addEventListener("click", uploadSyncData);
elements.syncDownload.addEventListener("click", downloadSyncData);
elements.syncLogout.addEventListener("click", async () => {
  try {
    await syncRequest("/auth/v1/logout", { method: "POST" });
  } catch {
    // Clear the local session even if the remote session already expired.
  }
  saveSyncSession(null);
  showToast("クラウド同期からログアウトしました。");
});

elements.exportButton.addEventListener("click", exportBackup);
elements.importButton.addEventListener("click", () => {
  elements.importInput.click();
});
elements.importInput.addEventListener("change", () => {
  const [file] = elements.importInput.files;
  if (file) {
    importBackup(file);
  }
});

elements.toastAction.addEventListener("click", () => {
  if (undoAction) {
    const action = undoAction;
    undoAction = null;
    action();
  }
});

setTheme(settings.theme);
render();
updateSyncUI();
updateNotificationButton();
checkReminders();
setInterval(checkReminders, 30 * 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // The app remains fully usable online if registration is unavailable.
  });
}
