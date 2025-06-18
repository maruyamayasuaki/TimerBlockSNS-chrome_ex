# Pomodoro Blocker Extension

ポモドーロテクニック用のWebサイトブロッカーChrome拡張機能です。
↓拡張機能についての記事
https://qiita.com/yasu_qita/items/1a26adb8dff47c402d8e
## 機能

- 25分間のポモドーロタイマー
 - タイマー実行中の集中力を妨げるサイトの自動ブロック
   - declarativeNetRequest による通信遮断
   - SPA の URL 変更も監視
- シンプルな開始・停止ボタン
- アイコン上に残り時間を表示
- ブロック中のカスタムページ表示

## ファイル構成

```
pomodoro-blocker-extension/
├── manifest.json          # 拡張機能の設定ファイル
├── popup.html             # ポップアップUI（開始・停止ボタン）
├── popup.js               # タイマー制御ロジック
├── background.js          # サイトブロック制御
├── icons/                 # アイコンファイル
│   ├── icon.png          # 128x128のアイコン（手動で追加）
│   └── README.md         # アイコン作成方法
└── README.md             # このファイル
```

## インストール方法

1. Chrome ブラウザを開く
2. `chrome://extensions/` にアクセス
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `pomodoro-blocker-extension` フォルダを選択

## 使用方法

1. Chrome ツールバーの拡張機能アイコンをクリック
2. 「開始」ボタンをクリックしてポモドーロタイマーを開始
3. タイマー実行中は集中力を妨げるサイトが自動的にブロックされます
4. 25分経過するか「停止」ボタンでタイマーを終了

## ブロック対象サイト

- SNS: Facebook、Twitter/X、Instagram、TikTok など
- 動画: YouTube、Netflix、Twitch など
- ニュース: Reddit、Yahoo など
- ショッピング: Amazon、楽天 など

## カスタマイズ

- ブロック対象サイトは `background.js` の `blockedSites` 配列で変更可能
- タイマー時間は `popup.js` の `duration` 変数で変更可能（デフォルト: 25分）

## 注意事項

- 拡張機能の権限で「すべてのサイトのデータの読み取りと変更」と
  `webNavigation` パーミッションが必要です
- プライベートブラウジングでは追加設定が必要な場合があります
