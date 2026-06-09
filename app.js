const STORAGE_KEY = "simple-todo-list";
const HISTORY_KEY = `${STORAGE_KEY}-history`;
const SETTINGS_KEY = `${STORAGE_KEY}-settings`;
const BACKUP_VERSION = 2;
const PRIORITIES = new Set(["high", "medium", "low"]);
const PRIORITY_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
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
  category: document.querySelector("#category"),
  formMessage: document.querySelector("#form-message"),
  list: document.querySelector("#todo-list"),
  template: document.querySelector("#todo-template"),
  count: document.querySelector("#task-count"),
  emptyState: document.querySelector("#empty-state"),
  clearCompleted: document.querySelector("#clear-completed"),
  filters: document.querySelectorAll(".filter"),
  search: document.querySelector("#search-input"),
  sort: document.querySelector("#sort-select"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  editText: document.querySelector("#edit-text"),
  editDueDate: document.querySelector("#edit-due-date"),
  editPriority: document.querySelector("#edit-priority"),
  editCategory: document.querySelector("#edit-category"),
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

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeDate(value) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
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
    category: normalizeCategory(todo?.category),
    completed,
    createdAt: normalizeTimestamp(todo?.createdAt, fallbackTime),
    updatedAt: normalizeTimestamp(todo?.updatedAt, fallbackTime),
    completedAt: completed
      ? normalizeTimestamp(todo?.completedAt, fallbackTime)
      : null,
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
    const validSorts = ["newest", "oldest", "due", "priority", "category"];
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

    const searchable = `${todo.text} ${todo.category}`.toLocaleLowerCase("ja");
    return searchable.includes(searchQuery);
  });

  return filtered.sort((a, b) => {
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

  visibleTodos.forEach((todo) => {
    const item = elements.template.content.firstElementChild.cloneNode(true);
    const checkbox = item.querySelector(".todo-checkbox");
    const priorityDot = item.querySelector(".priority-dot");
    const text = item.querySelector(".todo-text");
    const category = item.querySelector(".category-badge");
    const dueDate = item.querySelector(".todo-due-date");
    const editButton = item.querySelector(".edit-button");
    const deleteButton = item.querySelector(".delete-button");

    item.dataset.id = todo.id;
    item.dataset.priority = todo.priority;
    item.classList.toggle("completed", todo.completed);
    item.classList.toggle("overdue", isOverdue(todo));

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

    editButton.setAttribute("aria-label", `${todo.text}を編集`);
    deleteButton.setAttribute("aria-label", `${todo.text}を削除`);

    checkbox.addEventListener("change", () => toggleTodo(todo.id));
    editButton.addEventListener("click", () => openEditDialog(todo.id));
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));
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

function addTodo(text, dueDate, priority, category) {
  const now = Date.now();
  todos.push({
    id: createId(),
    text,
    dueDate,
    priority,
    category,
    completed: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
  saveTodos();
  render();
}

function toggleTodo(id) {
  const now = Date.now();

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
  elements.editCategory.value =
    todo.category === "未分類" ? "" : todo.category;
  elements.editMessage.textContent = "";
  elements.editText.removeAttribute("aria-invalid");
  elements.editDialog.showModal();
  elements.editText.focus();
  elements.editText.select();
}

function closeEditDialog() {
  editingId = null;
  elements.editDialog.close();
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
      sort: ["newest", "oldest", "due", "priority", "category"].includes(
        data.settings?.sort,
      )
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

  if (message) {
    setFieldError(elements.input, elements.formMessage, message);
    return;
  }

  addTodo(
    text,
    normalizeDate(elements.dueDate.value),
    PRIORITIES.has(elements.priority.value)
      ? elements.priority.value
      : "medium",
    normalizeCategory(elements.category.value),
  );
  elements.form.reset();
  elements.priority.value = "medium";
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

  if (message) {
    setFieldError(elements.editText, elements.editMessage, message);
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
          category: normalizeCategory(elements.editCategory.value),
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
