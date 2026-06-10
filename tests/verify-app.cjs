const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const edgePath =
  process.env.EDGE_PATH ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9231;
const profilePath = path.join(os.tmpdir(), `todo-list-edge-${Date.now()}`);
const appUrl = pathToFileURL(path.resolve(__dirname, "../index.html")).href;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getPageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await response.json();
      const target = targets.find(
        (item) => item.type === "page" && item.url.includes("index.html"),
      );

      if (target) {
        return target;
      }
    } catch {
      // Edge needs a brief moment to expose its debugging endpoint.
    }

    await delay(200);
  }

  throw new Error("テスト用ブラウザを開けませんでした");
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);

    if (!request) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (response.exceptionDetails) {
    const description =
      response.exceptionDetails.exception?.description ||
      response.exceptionDetails.text;
    throw new Error(description);
  }

  return response.result.value;
}

(async () => {
  const edge = spawn(
    edgePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profilePath}`,
      appUrl,
    ],
    { stdio: "ignore" },
  );

  let client;

  try {
    const target = await getPageTarget();
    client = createCdpClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Runtime.enable");

    await evaluate(client, "localStorage.clear(); location.reload()");
    await delay(500);

    await evaluate(client, `document.querySelector("#todo-form").requestSubmit()`);
    const emptyInputMessage = await evaluate(
      client,
      `document.querySelector("#form-message").textContent`,
    );
    assert(
      emptyInputMessage.includes("入力してください"),
      `空入力のエラーが表示されませんでした: "${emptyInputMessage}"`,
    );

    await evaluate(
      client,
      `document.querySelector("#todo-input").value = "請求書を送る";
       document.querySelector("#due-date").value = "2020-01-01";
       document.querySelector("#reminder-time").value = "09:00";
       document.querySelector("#priority").value = "high";
       document.querySelector("#category").value = "仕事";
       document.querySelector("#todo-form").requestSubmit();`,
    );

    assert(
      (await evaluate(client, `document.querySelectorAll(".todo-item").length`)) ===
        1,
      "タスクを追加できませんでした",
    );
    assert(
      await evaluate(client, `document.querySelector(".todo-item").classList.contains("overdue")`),
      "期限切れが強調されませんでした",
    );
    assert(
      (await evaluate(client, `document.querySelector(".category-badge").textContent`)) ===
        "仕事",
      "カテゴリーが表示されませんでした",
    );
    assert(
      (await evaluate(client, `document.querySelector(".todo-item").dataset.priority`)) ===
        "high",
      "優先度が保存されませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))[0].reminderTime`,
      )) === "09:00",
      "通知時刻が保存されませんでした",
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector(".reminder-badge").textContent`,
      )).includes("09:00"),
      "通知時刻が表示されませんでした",
    );

    await evaluate(
      client,
      `document.querySelector("#todo-input").value = "請求書を送る";
       document.querySelector("#todo-form").requestSubmit();`,
    );
    assert(
      (await evaluate(client, `document.querySelector("#form-message").textContent`))
        .includes("すでにあります"),
      "重複タスクが検出されませんでした",
    );

    await evaluate(
      client,
      `document.querySelector("#todo-input").value = "牛乳を買う";
       document.querySelector("#priority").value = "low";
       document.querySelector("#category").value = "買い物";
       document.querySelector("#todo-form").requestSubmit();`,
    );

    await evaluate(
      client,
      `document.querySelector("#sort-select").value = "manual";
       document.querySelector("#sort-select").dispatchEvent(
         new Event("change", { bubbles: true })
       );`,
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector(".todo-item .todo-text").textContent`,
      )) === "牛乳を買う",
      "自由順で新しいタスクが先頭に表示されませんでした",
    );
    await evaluate(
      client,
      `document.querySelector(".todo-item .move-down-button").click()`,
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector(".todo-item .todo-text").textContent`,
      )) === "請求書を送る",
      "上下ボタンでタスクを並べ替えられませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .sort((a, b) => a.order - b.order)
          .map((todo) => todo.text).join(",")`,
      )) === "請求書を送る,牛乳を買う",
      "自由な並び順が保存されませんでした",
    );

    await evaluate(
      client,
      `document.querySelector("#search-input").value = "仕事";
       document.querySelector("#search-input").dispatchEvent(
         new Event("input", { bubbles: true })
       );`,
    );
    assert(
      (await evaluate(client, `document.querySelectorAll(".todo-item").length`)) ===
        1,
      "カテゴリー検索が正しく動きませんでした",
    );

    await evaluate(
      client,
      `document.querySelector("#search-input").value = "";
       document.querySelector("#search-input").dispatchEvent(
         new Event("input", { bubbles: true })
       );
       document.querySelector("#sort-select").value = "priority";
       document.querySelector("#sort-select").dispatchEvent(
         new Event("change", { bubbles: true })
       );`,
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector(".todo-item .todo-text").textContent`,
      )) === "請求書を送る",
      "優先度順に並べ替えられませんでした",
    );

    await evaluate(
      client,
      `Array.from(document.querySelectorAll(".todo-item"))
         .find((item) => item.textContent.includes("牛乳を買う"))
         .querySelector(".edit-button").click();`,
    );
    assert(
      await evaluate(client, `document.querySelector("#edit-dialog").open`),
      "編集画面が開きませんでした",
    );

    await evaluate(
      client,
      `document.querySelector("#edit-text").value = "牛乳とパンを買う";
       document.querySelector("#edit-priority").value = "medium";
       document.querySelector("#edit-due-date").value = "2099-01-01";
       document.querySelector("#edit-repeat").value = "weekly";
       document.querySelector("#edit-subtask-input").value = "食パンを選ぶ";
       document.querySelector("#edit-subtask-add").click();
       document.querySelector("#edit-form").requestSubmit();`,
    );
    assert(
      await evaluate(
        client,
        `Array.from(document.querySelectorAll(".todo-text"))
          .some((item) => item.textContent === "牛乳とパンを買う")`,
      ),
      "タスクを編集できませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う").repeat`,
      )) === "weekly",
      "繰り返し設定を保存できませんでした",
    );
    assert(
      (await evaluate(
        client,
        `Array.from(document.querySelectorAll(".todo-item"))
          .find((item) => item.textContent.includes("牛乳とパンを買う"))
          .querySelector(".repeat-badge").textContent`,
      )).includes("毎週"),
      "繰り返し設定が表示されませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う").subtasks.length`,
      )) === 1,
      "サブタスクを追加できませんでした",
    );
    await evaluate(
      client,
      `Array.from(document.querySelectorAll(".todo-item"))
        .find((item) => item.textContent.includes("牛乳とパンを買う"))
        .querySelector(".subtask-toggle").click();`,
    );
    await evaluate(
      client,
      `Array.from(document.querySelectorAll(".todo-item"))
        .find((item) => item.textContent.includes("牛乳とパンを買う"))
        .querySelector(".subtask-item input").click();`,
    );
    assert(
      await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う")
          .subtasks[0].completed`,
      ),
      "サブタスクを完了にできませんでした",
    );

    await evaluate(
      client,
      `Array.from(document.querySelectorAll(".todo-item"))
         .find((item) => item.textContent.includes("牛乳とパンを買う"))
         .querySelector(".todo-checkbox").click();`,
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list-history")).length`,
      )) === 1,
      "完了履歴が保存されませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う").dueDate`,
      )) === "2099-01-08",
      "毎週タスクの次回期限を作成できませんでした",
    );
    assert(
      !(await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う").completed`,
      )),
      "繰り返しタスクが次回分の未完了状態に戻りませんでした",
    );
    assert(
      !(await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))
          .find((todo) => todo.text === "牛乳とパンを買う")
          .subtasks[0].completed`,
      )),
      "繰り返し後にサブタスクが未完了へ戻りませんでした",
    );
    assert(
      (await evaluate(
        client,
        `getNextDueDate({ dueDate: "2099-01-31", repeat: "monthly" })`,
      )) === "2099-02-28",
      "月末の毎月タスクを正しく計算できませんでした",
    );

    await evaluate(client, `document.querySelector("#history-button").click()`);
    assert(
      (await evaluate(client, `document.querySelectorAll(".history-item").length`)) ===
        1,
      "完了履歴が表示されませんでした",
    );
    await evaluate(client, `document.querySelector("#history-done").click()`);

    await evaluate(client, `document.querySelector("#theme-toggle").click()`);
    assert(
      (await evaluate(client, `document.documentElement.dataset.theme`)) ===
        "dark",
      "ダークモードへ切り替えられませんでした",
    );

    await evaluate(client, `document.querySelector("#sync-button").click()`);
    assert(
      await evaluate(client, `document.querySelector("#sync-dialog").open`),
      "同期画面が開きませんでした",
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector("#sync-status").textContent`,
      )).includes("ログイン"),
      "同期設定後のログイン案内が表示されませんでした",
    );
    assert(
      !(await evaluate(
        client,
        `document.querySelector("#sync-auth-form").hidden`,
      )),
      "同期設定後にログイン欄が表示されませんでした",
    );
    assert(
      await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list-sync-meta")).pending`,
      ),
      "端末内の変更が同期待ちとして記録されませんでした",
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector("#sync-reset-request").textContent`,
      )).includes("パスワード"),
      "パスワード再設定の入口が表示されませんでした",
    );
    assert(
      await evaluate(
        client,
        `typeof synchronize === "function" &&
         typeof refreshSyncSession === "function" &&
         typeof requestPasswordReset === "function"`,
      ),
      "自動同期または認証更新の処理が読み込まれていません",
    );
    await evaluate(client, `document.querySelector("#sync-close").click()`);

    await evaluate(
      client,
      `Array.from(document.querySelectorAll(".todo-item"))
         .find((item) => item.textContent.includes("請求書を送る"))
         .querySelector(".delete-button").click();`,
    );
    assert(
      (await evaluate(client, `document.querySelectorAll(".todo-item").length`)) ===
        1,
      "タスクを削除できませんでした",
    );
    await evaluate(client, `document.querySelector("#toast-action").click()`);
    assert(
      (await evaluate(client, `document.querySelectorAll(".todo-item").length`)) ===
        2,
      "削除したタスクを元に戻せませんでした",
    );

    await evaluate(client, "location.reload()");
    await delay(500);
    assert(
      (await evaluate(client, `document.querySelectorAll(".todo-item").length`)) ===
        2,
      "再読み込み後にタスクが保存されていませんでした",
    );
    assert(
      (await evaluate(client, `document.documentElement.dataset.theme`)) ===
        "dark",
      "テーマ設定が保存されていませんでした",
    );

    const accessibilityIssues = await evaluate(
      client,
      `(() => {
        const ids = Array.from(document.querySelectorAll("[id]")).map((node) => node.id);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        const unnamedButtons = Array.from(document.querySelectorAll("button"))
          .filter((button) => !button.textContent.trim() && !button.getAttribute("aria-label"))
          .length;
        return { duplicateIds, unnamedButtons };
      })()`,
    );
    assert(
      accessibilityIssues.duplicateIds.length === 0,
      "重複したIDがあります",
    );
    assert(
      accessibilityIssues.unnamedButtons === 0,
      "名前のないボタンがあります",
    );
    assert(
      (await evaluate(
        client,
        `document.querySelector('link[rel="manifest"]').getAttribute("href")`,
      )) === "manifest.webmanifest",
      "PWAマニフェストが参照されていません",
    );

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(250);

    const mobileLayout = await evaluate(
      client,
      `(() => {
        const themeRect = document.querySelector("#theme-toggle").getBoundingClientRect();
        const addRect = document.querySelector("#todo-form button[type='submit']")
          .getBoundingClientRect();
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          themeRight: themeRect.right,
          addRight: addRect.right,
        };
      })()`,
    );
    assert(
      mobileLayout.scrollWidth <= mobileLayout.innerWidth,
      "スマホ表示で横スクロールが発生しています",
    );
    assert(
      mobileLayout.themeRight <= mobileLayout.innerWidth &&
        mobileLayout.addRight <= mobileLayout.innerWidth,
      "スマホ表示で主要ボタンが画面外にはみ出しています",
    );

    await evaluate(client, `document.querySelector("#export-button").click()`);
    assert(
      (await evaluate(client, `document.querySelector("#toast-message").textContent`))
        .includes("書き出しました"),
      "バックアップを書き出せませんでした",
    );

    await evaluate(
      client,
      `window.confirm = () => true;
       (() => {
         const backup = {
           version: 2,
           todos: [{
             id: "imported-task",
             text: "読み込んだタスク",
             dueDate: "",
             priority: "medium",
             category: "個人",
             completed: false,
             createdAt: Date.now(),
             updatedAt: Date.now(),
             completedAt: null
           }],
           history: [],
           settings: { theme: "light", sort: "oldest" }
         };
         const file = new File(
           [JSON.stringify(backup)],
           "todo-backup.json",
           { type: "application/json" }
         );
         const transfer = new DataTransfer();
         transfer.items.add(file);
         const input = document.querySelector("#import-input");
         input.files = transfer.files;
         input.dispatchEvent(new Event("change", { bubbles: true }));
       })();`,
    );
    await delay(250);
    assert(
      (await evaluate(client, `document.querySelector(".todo-text").textContent`)) ===
        "読み込んだタスク",
      "バックアップを読み込めませんでした",
    );
    assert(
      (await evaluate(client, `document.documentElement.dataset.theme`)) ===
        "light",
      "バックアップの設定を復元できませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))[0].repeat`,
      )) === "none",
      "旧バックアップの繰り返し設定を移行できませんでした",
    );
    assert(
      (await evaluate(
        client,
        `JSON.parse(localStorage.getItem("simple-todo-list"))[0].subtasks.length`,
      )) === 0,
      "旧バックアップのサブタスクを移行できませんでした",
    );

    const syncFlow = await evaluate(
      client,
      `(async () => {
        const originalFetch = window.fetch;
        let refreshCalls = 0;
        const cloudRow = {
          updated_at: "2026-06-11T02:00:00.000Z",
          payload: {
            version: 5,
            todos: [{
              id: "cloud-task",
              text: "クラウド側のタスク",
              dueDate: "",
              priority: "medium",
              repeat: "none",
              reminderTime: "",
              notifiedFor: "",
              subtasks: [],
              category: "未分類",
              completed: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              completedAt: null,
              order: 0
            }],
            history: [],
            settings: { theme: "light", sort: "oldest" },
            sync: {
              deviceId: "other-device",
              revision: 4,
              updatedAt: "2026-06-11T02:00:00.000Z"
            }
          }
        };

        window.fetch = async (url) => {
          if (String(url).includes("grant_type=refresh_token")) {
            refreshCalls += 1;
            return new Response(JSON.stringify({
              access_token: "fresh-token",
              refresh_token: "fresh-refresh",
              expires_in: 3600,
              user: { id: "test-user", email: "test@example.com" }
            }), { status: 200 });
          }

          return new Response(JSON.stringify([cloudRow]), { status: 200 });
        };

        syncSession = {
          access_token: "expired-token",
          refresh_token: "refresh-token",
          expires_at: 1,
          user: { id: "test-user", email: "test@example.com" }
        };
        syncMeta.accountId = "test-user";
        syncMeta.lastCloudUpdatedAt = "2026-06-11T01:00:00.000Z";
        syncMeta.pending = true;
        syncMeta.conflict = false;
        saveSyncMeta();

        await refreshSyncSession();
        await synchronize();
        const result = {
          refreshCalls,
          accessToken: syncSession.access_token,
          conflict: syncMeta.conflict,
          conflictVisible: !document.querySelector("#sync-conflict").hidden,
          canonicalMatch:
            getPayloadFingerprint({
              settings: { theme: "light", sort: "oldest" }
            }) === getPayloadFingerprint({
              settings: { sort: "oldest", theme: "light" }
            }),
          timestampMatch: timestampsMatch(
            "2026-06-11T02:00:00.000Z",
            "2026-06-11T02:00:00+00:00"
          )
        };

        applyCloudRow(pendingCloudRow);
        result.cloudApplied =
          document.querySelector(".todo-text").textContent ===
          "クラウド側のタスク";
        result.pendingAfterApply = syncMeta.pending;
        window.fetch = originalFetch;
        return result;
      })()`,
    );
    assert(
      syncFlow.refreshCalls === 1 && syncFlow.accessToken === "fresh-token",
      `期限切れのログインセッションを更新できませんでした: ${JSON.stringify(syncFlow)}`,
    );
    assert(
      syncFlow.conflict && syncFlow.conflictVisible,
      "端末間の変更競合を検出・表示できませんでした",
    );
    assert(
      syncFlow.canonicalMatch && syncFlow.timestampMatch,
      "クラウドデータの内容または更新時刻を正規化して比較できませんでした",
    );
    assert(
      syncFlow.cloudApplied && !syncFlow.pendingAfterApply,
      "競合時にクラウド側の内容を採用できませんでした",
    );

    console.log(
      "PASS: validation, add, due date, reminder, priority, category, repeat, subtasks, manual order, search, sort, edit, history, theme, undo, persistence, accessibility, mobile layout, PWA, auto sync, conflict handling, session refresh, password reset, backup",
    );
    await client.send("Browser.close");
  } finally {
    client?.close();
    edge.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
