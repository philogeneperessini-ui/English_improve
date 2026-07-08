# SpeakMate 项目文档

> 本文档是项目的持续事实源。每次范围、架构、接口或里程碑发生变化时必须同步更新。

## 1. 项目状态

- 当前阶段：MVP v0.5
- 最近更新：2026-07-08
- 使用对象：个人使用
- 交付形态：移动端优先 PWA + Capacitor Android APK
- 当前状态：单用户登录与受保护 API 已验证；Android 工程已生成，等待安装 Android Studio/SDK、配置 Vercel 地址后真机构建

## 2. 产品目标

让用户通过手机完成一个短而完整的英语口语练习闭环：

1. 选择雅思风格题目；
2. 使用手机麦克风回答；
3. 自动获得可编辑转写；
4. 获得语法、词汇、流利度和切题度反馈；
5. 查看并朗读优化答案；
6. 在本机回看录音和历史反馈。

MVP 的成功标准不是模拟官方雅思考试，而是让一次练习在 3 分钟左右完成，并给出 2–3 条能立即执行的建议。

## 3. MVP 范围

### 已实现

- 移动端首页、练习、结果和历史记录界面；
- IELTS Part 1/2/3 本地题库；
- 浏览器麦克风录音、计时和回放；
- 浏览器 Web Speech API 英文实时转写，转写可手动修正；
- MiniMax M2.7 文本评价适配器；
- 无 Key 时可用的演示评价；
- 结构化分项反馈、改进点和参考表达；
- 浏览器英文语音朗读参考答案；
- IndexedDB 本机保存录音、转写和历史评价；
- PWA manifest 和 service worker。
- 原创 IELTS 风格分层题库与 Part 1/2/3 答题提示；
- 词数、语速、填充词、重复词和可观测停顿指标；
- 最近练习分项均值与练习均衡建议。
- AI 自由对话：日常、旅行、职场和观点讨论四种场景；
- 对话语音输入（点一下开始/再点一下停止）、文字兜底、MiniMax 多轮回复与浏览器自动朗读；
- 每轮最多提供一条高价值纠正，避免打断自然交流。
- 服务端代调 ASR：录音上传 `/api/transcribe`，由硅基流动 SenseVoiceSmall 转写，国内浏览器也能稳定转出文字；缺失 Key 时自动回退到浏览器/原生识别或手动输入。
- 单用户密码登录、HMAC 签名 HttpOnly 会话 Cookie；
- 评价、自由对话和状态接口强制登录，并提供基础频率限制；
- Capacitor 8 Android 工程，可生成调试 APK 或个人签名 APK；
- Android 原生英文语音识别，浏览器继续使用 Web Speech API；
- Android 壳加载固定 HTTPS 地址，Web 功能更新通常不需要重装 APK。

### 本轮不做

- 多用户注册、同步、多设备数据；
- 付费、订阅和运营后台；
- 官方雅思分数承诺；
- 音素级发音打分；
- AI 实时语音对话；
- 微信小程序发布。

## 4. 核心技术决策

### 为什么采用 Vercel 后端 + Android 壳

- Next.js API Route 在 Vercel 代调 MiniMax，API Key 不进入浏览器或 APK；
- Capacitor 将现有移动端界面封装成 Android App，并可调用原生语音识别；
- APK 加载固定 HTTPS 应用地址，普通功能发布后立即更新；
- 只有图标、权限、插件和原生代码变化时才重新打 APK；
- 仍保留 PWA，便于电脑和手机浏览器快速验证。

### 技术栈

| 层级 | 选择 |
|---|---|
| 应用 | Next.js 16、React 19、TypeScript |
| 样式 | Tailwind CSS 4 |
| 本地数据 | IndexedDB (`idb`) |
| 数据校验 | Zod |
| 图标 | Lucide React |
| 文字评价 | MiniMax M2.7，OpenAI 兼容接口 |
| 语音转写 | 浏览器/原生识别优先；服务端代调硅基流动 SenseVoiceSmall 兜底 |
| 录音 | MediaRecorder API |
| 朗读 | SpeechSynthesis API |
| Android 容器 | Capacitor 8.4 |
| Android 转写 | `@capacitor-community/speech-recognition` |
| 访问保护 | 单用户密码 + HMAC HttpOnly Cookie |

### MiniMax 使用边界

- Coding/Token Plan 用于开发辅助和当前文本评价试验；
- 密钥只放在服务端环境变量 `MINIMAX_API_KEY`；
- 手机端不会读取或持久化模型密钥；
- 当前只发送题目、回答时长和转写文本，不发送录音；
- 需要在正式长期使用前确认账户套餐条款允许自定义应用后端调用；不允许时切换为按量 API Key。

### 语音转写（ASR）使用边界

- 默认用硅基流动 SiliconFlow 的 `FunAudioLLM/SenseVoiceSmall`（OpenAI 兼容接口、有免费额度）；
- 密钥只放在服务端环境变量 `SILICONFLOW_API_KEY`，浏览器和 APK 都不持有；
- 当浏览器/原生实时识别不可用（如国内 Chrome 连不上 Google 服务）时，录音会上传到服务端代调 ASR 转写；
- ASR Key 缺失时自动降级为"录音 + 手动输入"，不阻塞使用；
- ASR 适配层做成可扩展结构，后续可接入 MiMo-ASR、阿里 Paraformer 等。

## 5. 当前架构

```text
手机 PWA / Android APK
├── MediaRecorder：录音（保存在当前设备）
├── 浏览器 Web Speech API / Android 原生识别：实时转写（优先）
├── 实时识别不可用时：上传录音 → 服务端 ASR 兜底转写
├── IndexedDB：录音与历史记录
└── HTTPS → Vercel Next.js
    ├── /api/auth/*：单用户登录与签名会话
    ├── /api/transcribe：录音转文字（硅基流动 SenseVoiceSmall）
    ├── /api/evaluate：结构化练习评价
    └── /api/conversation：多轮自由对话
    ├── 有 Key → MiniMax M2.7
    └── 无 Key/调用失败 → 演示评价或回复
```

评价层已经隔离在 API Route 内，后续可以增加：

- 阿里 Fun-ASR / Qwen-ASR：更稳定的转写；
- 腾讯 SOE-N：音频级发音与流利度；
- MiniMax Speech / CosyVoice：更自然的示范音。

## 6. 数据与隐私

- 录音、转写和评价默认只保存在当前手机的 IndexedDB；
- 清除浏览器站点数据会删除全部练习记录；
- 当前仅将转写文本发送给 MiniMax；
- 当浏览器/原生实时识别不可用时，录音会上传到服务端代调硅基流动 ASR 做一次性转写，转写后服务端不留存录音；
- 自由对话会将最近最多 12 条文字消息发送给 MiniMax，不上传录音；
- 不应把 `.env.local`、API Key 或用户录音提交到 Git；
- Android APK 中不包含 MiniMax Key 或 ASR Key；Git 已忽略 `.env*`、APK、签名文件和 Android 本机配置；
- 公网 AI 接口必须先通过签名会话验证，登录失败和 AI 请求有基础频率限制；
- 个人版暂未实现云端备份。

## 7. 配置

复制环境变量示例：

```powershell
Copy-Item .env.example .env.local
```

填写：

```dotenv
MINIMAX_API_KEY=你的Key
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M2.7
SILICONFLOW_API_KEY=硅基流动ASR的Key（可选，不填则回退到浏览器/原生识别或手动输入）
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
ASR_MODEL=FunAudioLLM/SenseVoiceSmall
APP_ACCESS_PASSWORD=至少8位的个人密码
APP_SESSION_SECRET=至少32位的随机字符串
APP_SESSION_TTL_DAYS=30
```

登录配置默认必须填写；缺失或太短时服务端拒绝受保护请求，防止部署后意外公开 MiniMax 额度。不填写 MiniMax Key 时，登录后应用显示“演示模式”。生产环境禁止设置 `APP_AUTH_DISABLED=true`。

ASR Key（`SILICONFLOW_API_KEY`）可选：填写后录音会上传服务端代调转写，国内浏览器也能稳定转出文字；不填写时自动回退到浏览器/原生实时识别，若仍失败则提示手动输入文字。

## 8. 本地与手机运行

在 `mobile-app` 目录执行：

```powershell
npm install
npm run dev -- --hostname 0.0.0.0
```

1. 电脑与手机连接同一 Wi-Fi；
2. Windows 防火墙允许 Node.js 的专用网络访问；
3. 手机浏览器打开终端显示的 `http://局域网IP:3000`；
4. 允许麦克风权限；
5. 部分手机浏览器只在 HTTPS 下开放完整麦克风/PWA 能力。遇到限制时使用 HTTPS 部署地址测试。

安装到桌面：

- Android Chrome：菜单 → 添加到主屏幕/安装应用；
- iPhone Safari：分享 → 添加到主屏幕。

Android APK 的首次准备、USB 快速联调、Vercel 测试和 APK 生成步骤见 [`mobile-app/ANDROID.md`](./mobile-app/ANDROID.md)。当前电脑尚未检测到 Android Studio 和 Android SDK，因此本轮没有生成最终 APK 文件。

## 9. 下一阶段

### v0.5：真机稳定性与 APK 交付

- 安装 Android Studio、SDK 36，生成首个调试 APK；
- 使用 USB `adb reverse` 验证 Android 原生转写与录音；
- 部署 Vercel，并将正式 HTTPS 地址写入 Android 壳；
- Android Chrome 与 iPhone Safari 继续做 PWA 录音验证；
- 处理浏览器不支持 Web Speech API 的降级体验；
- 增加录音文件大小与本地存储提示；
- 增加练习数据导出和全部清除。

### v0.6：真实语音能力

- 对比 Fun-ASR、Qwen-ASR 和豆包 ASR 对中国学习者英语的忠实转写；
- 接入腾讯 SOE-N 发音评分；
- 将停顿、语速、重复词与音频评测结果合并；
- 明确区分“内容评价”和“发音评价”。

### v0.7：产品增强

- 练习目标与周趋势；
- 根据历史薄弱项自动选题；
- AI 追问；
- 原生 App/小程序路径重新评估。

## 10. 已知限制

- Web Speech API 的可用性和识别效果依赖浏览器与网络；
- 演示评价是启发式结果，不能作为真实能力评分；
- MiniMax 仅根据文字评价，不能判断发音；
- 浏览器自带英文朗读的音色因设备而异；
- PWA 数据暂时不能跨设备同步。
- Android App 当前依赖在线 Vercel 地址，离线时只能读取部分已缓存页面，不能调用 AI；
- 基础频率限制保存在单个服务实例内，登录会话是个人版的主要额度保护；
- 当前电脑缺少 Android Studio/SDK，Android 工程已生成但尚未执行 Gradle 真机构建。

## 11. 更新记录

### 2026-07-08 · v0.5

- 新增服务端代调 ASR（`/api/transcribe`）：录音上传后由硅基流动 SenseVoiceSmall 转写，Key 只在服务端；
- 修复自由对话麦克风"不能用"问题：改为稳定的"点一下开始、再点一下停止"交互，并支持录音上传转写兜底；
- 修复练习页录音后无文字问题：浏览器/原生实时识别优先，不可用时自动上传录音做服务端 ASR 转写；
- 新增可扩展 ASR 适配层 `src/lib/asr.ts` 与共享录音 hook `src/lib/use-recorder.ts`；
- 转写接口沿用登录与频率限制；ASR Key 缺失时自动回退，不阻塞使用；
- 同步更新环境变量示例、技术栈、架构图与隐私说明。

### 2026-07-01 · v0.4

- 新增单用户密码登录、30 天签名 HttpOnly 会话和退出入口；
- 未配置密码或会话密钥时默认拒绝受保护 API，避免公网裸奔；
- 评价、自由对话和状态接口新增登录校验与基础频率限制；
- 接入 Capacitor 8.4，生成 `com.speakmate.english` Android 工程；
- 接入 Android 原生英文语音识别及麦克风运行时授权；
- Android 壳支持本地 `adb reverse` 联调和 Vercel HTTPS 正式地址；
- 已通过 ESLint、Next.js 生产构建、登录 API 集成测试和 390×844 手机视口测试；
- 新增 Android 构建与快速测试文档，签名文件和 APK 已加入 Git 忽略。

### 2026-06-29 · v0.3

- 新增“对话”底部入口与首页自由对话卡片；
- 新增日常、旅行、职场和观点讨论四种口语场景；
- 接入浏览器英语语音转写，并保留文字输入兜底；
- 新增 MiniMax 多轮对话 API，限制上下文为最近 12 条消息；
- AI 回复控制在 1–3 句话，并通过浏览器 TTS 自动朗读；
- 仅在存在明显问题时提供一条原句、改写和中文提示；
- 无 Key 或模型失败时自动使用演示回复。

### 2026-06-29 · v0.2

- 以 `1599570912/IELTS-Speaking-AI` 作为功能基准进行审阅；
- 因参考仓库没有明确许可证，未复制其源码与题库内容；
- 独立扩充原创 IELTS 风格题库，并增加分 Part 答题提示；
- 新增词数、WPM、词汇多样性、填充词、连续重复和停顿统计；
- 将可观测语音指标传给 MiniMax，明确禁止据此猜测发音；
- 在结果和历史页面增加语音指标、最近分项均值与练习均衡建议；
- 拒绝采用“语音识别置信度等于发音分数”的实现方式。

### 2026-06-29 · v0.1

- 确定个人使用、移动端 PWA 的 MVP 方向；
- 建立 Next.js 项目；
- 实现题库、录音、浏览器转写、文字评价、结果和历史闭环；
- 接入 MiniMax OpenAI 兼容文字评价接口；
- 建立演示评价降级方案；
- 建立本项目文档并约定持续更新；
- 通过 ESLint、TypeScript 和 Next.js 生产构建；
- 在 390×844 手机视口验证首页与选题页面；
- 使用无个人信息的测试回答验证 MiniMax 返回结构化评价。

## 12. 外部参考

### IELTS-Speaking-AI

- 地址：`https://github.com/1599570912/IELTS-Speaking-AI`
- 用途：仅作为功能、流程和指标类别的产品基准；
- 采用的思路：分层题库、Web Speech API、IndexedDB、可解释练习统计；
- 未采用：其源码、题库文本、识别置信度发音评分；
- 原因：仓库没有明确开源许可证，且识别置信度不能可靠代表发音质量。
