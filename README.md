# Pulse SDK · TypeScript

Клиент API v1 для серверного Node.js 22+. Без зависимостей во время выполнения.
Релиз устанавливается из GitHub, без публикации в каталоге npm:

```bash
npm install https://github.com/riders-agency/pulse-sdk-typescript/releases/download/v0.1.0/riders-agency-pulse-sdk-0.1.0.tgz
```

[Фреймворки: Next.js, NestJS, Express, Fastify, Nuxt, SvelteKit и UI](https://github.com/riders-agency/pulse-open-source/tree/main/sdk/frameworks).
Экспорт `@riders-agency/pulse-sdk/frameworks` содержит `pulseFromRequest`,
`pulseFromAuthorization` и готовый `handleTaskList`. Для разработки из папки SDK:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm pack
# В своём проекте: npm install /path/to/riders-agency-pulse-sdk-0.1.0.tgz
```

```ts
import { PulseClient } from "@riders-agency/pulse-sdk";

const pulse = new PulseClient({
  baseUrl: process.env.PULSE_URL!, // origin вашей установки, без /api/v1
  token: process.env.PULSE_ACCESS_TOKEN!,
});
const page = await pulse.listTasks(process.env.PULSE_PROJECT_ID!, {limit: 20});
console.log(page.tasks.items.map(task => task.title));
const session = await pulse.createSession(process.env.PULSE_PROJECT_ID!);
const reply = await pulse.sendMessage(session.project_id, session.ai_chat_session_id, {
  body: "Создай задачу Подготовить прототип завтра", timezone: "Europe/Moscow",
});
// Покажите пользователю input_json и запросите подтверждение в своём интерфейсе.
const proposal = reply.tool_calls?.find(call => call.status === "pending_approval");
// Только после подтверждения: await pulse.approveProposal(session.project_id, proposal!.ai_tool_call_id);
```

`login(email, password)` сохраняет access token только в памяти клиента.
`logout()` отзывает сессию; автоматического обновления сессии нет. `PulseError`
содержит `status` и `requestId`, без тела ответа и токена. Таймаут по умолчанию
60 секунд; `sendMessage`/`request` принимают `AbortSignal`.

Клиент использует Bearer-сессию либо API-ключ с подходящими правами. Доступность
конкретной операции для ключа определяет сервер. ИИ-сценарий проверен с сессией.
Не передавайте серверный ключ в React-компоненты и не сохраняйте его в git.

Методы: список/чтение/создание/изменение/архив/восстановление задач; создание
и чтение ИИ-сессий, сообщение с итоговым JSON, изменение/подтверждение/отклонение
предложений. Это ручной клиент основного сценария, не генерация всех операций
OpenAPI. Остальные JSON-маршруты доступны через `request<T>`.

SSE, загрузки, cookie-авторизация браузера и автоматические повторы не реализованы.
После таймаута записи сначала прочитайте задачу или сессию: действие могло
выполниться. HTTPS обязателен вне localhost; перенаправления запрещены.
