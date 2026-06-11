# アカウント削除機能の設定

アカウント削除にはSupabase Edge Functionを使用します。
`service_role`キーはEdge Function内だけで利用され、ブラウザには公開されません。

## 1. Supabase CLIでログイン

```powershell
supabase login
```

## 2. プロジェクトを接続

```powershell
supabase link --project-ref ljewekzpsxudpcqubgpu
```

## 3. Edge Functionを公開

```powershell
supabase functions deploy delete-account
```

公開後は、アプリの「端末間同期」からログインし、
「アカウントとクラウドデータを削除」を実行できます。

`todo_sync.user_id`には`auth.users`への`on delete cascade`が設定されているため、
ユーザー削除時にクラウドの同期データも削除されます。

## 公開用URL

- プライバシーポリシー:
  `https://y5wz68ycmd-prog.github.io/today-todo/privacy.html`
- 利用規約:
  `https://y5wz68ycmd-prog.github.io/today-todo/terms.html`
- サポート:
  `https://y5wz68ycmd-prog.github.io/today-todo/support.html`
- アカウント削除:
  `https://y5wz68ycmd-prog.github.io/today-todo/account-deletion.html`
