# 端末間同期の設定

端末間同期にはSupabaseプロジェクトを使用します。ブラウザから安全に利用するため、テーブルにはRow Level Securityを設定します。

## 1. Supabaseプロジェクト

1. [Supabase](https://supabase.com/)でプロジェクトを作成します。
2. Project URLとPublishable key（またはanon key）を確認します。
3. `sync-config.js`へ値を設定します。

```js
window.TODO_SYNC_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_KEY",
  redirectUrl: "https://YOUR_NAME.github.io/YOUR_REPOSITORY/",
};
```

公開用キーはブラウザアプリで使うことを前提としたキーです。`service_role`キーは絶対に設定しないでください。

Supabaseの **Authentication > URL Configuration** で、`Site URL` と
`Redirect URLs` に同じ公開URLを登録してください。確認メールと
パスワード再設定メールからアプリへ戻るために必要です。

## 2. 保存テーブル

SupabaseのSQL Editorで次を実行します。

```sql
create table public.todo_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.todo_sync enable row level security;

create policy "read own todo data"
on public.todo_sync for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert own todo data"
on public.todo_sync for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "update own todo data"
on public.todo_sync for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

## 3. 公開

設定後にコミットしてGitHubへプッシュします。アプリの「端末間同期」から
アカウントを作成すると、変更は自動保存されます。オフライン中の変更は
接続の復帰後に同期され、端末間で競合した場合は採用する内容を選べます。

参考:

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Data REST API](https://supabase.com/docs/guides/api)
