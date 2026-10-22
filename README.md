# FIT-EASY 宮崎大橋店 日報Bot

GitHub Actionsが毎日20:00（日本時間）に数値を取得し、自分宛てLINE WORKSへ日報を送信します。MacやCodexを起動しておく必要はありません。

## GitHub設定

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録します。

Secrets:

- `MEMBERS_ENDPOINT` — `{ "members": 536, "provisionalMembers": 7 }` を返す会員管理連携URL
- `MEMBERS_TOKEN` — 上記URLのBearerトークン（不要なら空）
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `LINEWORKS_CLIENT_ID`
- `LINEWORKS_CLIENT_SECRET`
- `LINEWORKS_SERVICE_ACCOUNT`
- `LINEWORKS_PRIVATE_KEY`
- `LINEWORKS_BOT_ID`
- `LINEWORKS_USER_ID` — 関谷優人さんのLINE WORKS User ID

Variables:

- `TIKTOK_USERNAME` — `@`を除いた店舗アカウント名

## 動作確認

```bash
DRY_RUN=1 node src/index.mjs
node --test
```

GitHubのActions画面から `Daily report to LINE WORKS` を手動実行して送信テストできます。

## 注意

TikTokの公開ページ形式が変わると取得に失敗する場合があります。その場合も推測値は送信せず、「取得できませんでした」と記載します。会員数は管理システムのAPIまたはCSV連携URLが必要です。
