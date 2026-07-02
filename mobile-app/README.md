# SpeakMate mobile PWA + Android

移动端优先的英语口语练习 MVP，包含题目练习和 AI 自由对话。完整的产品范围、技术决策、运行方式和更新记录见根目录 [`PROJECT.md`](../PROJECT.md)。

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev -- --hostname 0.0.0.0
```

电脑访问 `http://localhost:3000`。手机与电脑连接同一 Wi-Fi 后，访问终端显示的局域网地址。

除 MiniMax 配置外，还必须设置 `APP_ACCESS_PASSWORD`（至少 8 位）和 `APP_SESSION_SECRET`（至少 32 位）。未配置 `MINIMAX_API_KEY` 时自动使用演示评价；配置后，文字评价通过服务端调用 MiniMax，密钥不会发送到浏览器或 APK。

Android 快速测试和 APK 构建见 [`ANDROID.md`](./ANDROID.md)。
