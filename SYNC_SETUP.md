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
};
```

公開用キーはブラウザアプリで使うことを前提としたキーです。`service_role`キーは絶対に設定しないでください。

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

設定後にコミットしてGitHubへプッシュします。アプリの「端末間同期」からアカウントを作成し、クラウド保存と復元を利用できます。

参考:

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Data REST API](https://supabase.com/docs/guides/api)
