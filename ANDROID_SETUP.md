# Android版の開発と公開準備

Web版をCapacitorでAndroidアプリとして包んでいます。

- アプリ名: 今日のToDo
- Application ID: `io.github.y5wz68ycmdprog.todaytodo`
- 最小Android: Android 7.0（API 24）
- Target SDK: API 36

## 開発用APKを作る

Node.js、Android Studio、Android SDKを用意してから、プロジェクトの
ルートで実行します。

```powershell
npm install
npm run android:sync
cd android
.\gradlew.bat testDebugUnitTest assembleDebug
```

APKは次の場所に生成されます。

`android/app/build/outputs/apk/debug/app-debug.apk`

これは開発用のデバッグ鍵で署名されています。手元のAndroid端末での
動作確認には使えますが、Google Playへは提出できません。

## Android Studioで開く

```powershell
npm run android:open
```

Android Studioで実機またはエミュレーターを選び、Runを実行します。
Android 13以降では、初回に通知の許可画面が表示されます。

## Google Play用の署名鍵

署名鍵はアプリの更新に必要な重要ファイルです。GitHubには登録せず、
パスワード管理ツールと別の安全な場所へバックアップしてください。

Android Studio付属の`keytool`で、対話形式の案内に従って作成します。

```powershell
cd android
keytool -genkeypair -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
Copy-Item keystore.properties.example keystore.properties
```

`keystore.properties`の4項目を、作成した鍵とパスワードに合わせて
編集します。このファイルと`release-key.jks`はGitの対象外です。

署名済みAndroid App Bundleを作ります。

```powershell
.\gradlew.bat bundleRelease
```

AABは次の場所に生成されます。

`android/app/build/outputs/bundle/release/app-release.aab`

## 通知について

Android版では、タスクの期限と通知時刻をOSへ予約します。そのため、
アプリを閉じた後でも通知できます。端末の省電力設定により、通知時刻が
数分程度ずれる場合があります。

## 公開前に必要な確認

1. 実機で追加、編集、完了、削除、同期、通知を確認する
2. Play Consoleのデベロッパーアカウントを用意する
3. ストア掲載用の説明文、スクリーンショット、アイコンを用意する
4. 内部テストへ署名済みAABをアップロードする
5. プライバシーポリシーとアカウント削除URLを登録する
