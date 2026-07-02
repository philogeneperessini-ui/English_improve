# SpeakMate Android 使用与测试

当前 Android 版使用 Capacitor：APK 是安卓壳，界面和服务端来自同一个 SpeakMate HTTPS 地址。MiniMax Key 只存在于 Vercel 环境变量，不会写入 APK。

## 更新是否需要重装 APK

- 页面、题库、提示词、AI 接口和大部分业务功能：部署到 Vercel 后立即生效，不需要更新 APK；
- App 图标、应用名、安卓权限、Capacitor 插件和原生代码：需要重新生成并安装 APK；
- 建议固定使用一个 Vercel 域名或自定义域名，避免因为地址改变而重打 APK。

## 首次准备

1. 安装 Android Studio，并在 SDK Manager 安装 Android SDK 36；
2. Android Studio 自带的 JDK 即可；
3. 真机打开“开发者选项”和“USB 调试”；
4. 在 `mobile-app` 目录运行 `npm install`。

## 最快真机联调：USB + 本地开发服务器

先确保 `.env.local` 中包含 MiniMax 和个人登录配置：

```dotenv
MINIMAX_API_KEY=你的Key
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M2.7
APP_ACCESS_PASSWORD=至少8位的个人密码
APP_SESSION_SECRET=至少32位的随机字符串
APP_SESSION_TTL_DAYS=30
```

终端一：

```powershell
npm run dev -- --hostname 0.0.0.0
```

终端二：

```powershell
adb devices
adb reverse tcp:3000 tcp:3000
$env:CAPACITOR_SERVER_URL="http://localhost:3000"
npm run android:sync
npm run android:open
```

在 Android Studio 中点击 Run。修改 React/Next.js 代码后通常只需在 App 内刷新或重启 App，不需要重新构建 APK。

## 测试 Vercel 正式环境

```powershell
$env:CAPACITOR_SERVER_URL="https://你的项目.vercel.app"
npm run android:sync
npm run android:open
```

在 Android Studio 运行后，测试登录、录音、原生英文转写、AI 评价、自由对话和历史记录。

## 生成调试 APK

在 Android Studio 选择 `Build > Build APK(s)`，或在 Android Studio 终端执行：

```powershell
cd android
.\gradlew.bat assembleDebug
```

生成文件：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

调试 APK 可以直接传到自己的安卓手机侧载安装。正式长期使用时再建立个人签名的 release APK；签名文件已经被 Git 忽略，不能上传仓库。

## Vercel 必填环境变量

```text
MINIMAX_API_KEY
MINIMAX_BASE_URL
MINIMAX_MODEL
APP_ACCESS_PASSWORD
APP_SESSION_SECRET
APP_SESSION_TTL_DAYS
```

不要设置 `APP_AUTH_DISABLED=true`。不要创建 `NEXT_PUBLIC_MINIMAX_API_KEY`，任何 `NEXT_PUBLIC_` 值都会进入客户端代码。
