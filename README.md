# SalesPilot AI

**Practice Smarter. Sell Better.** Голосовой AI-тренажёр продаж на FastAPI и React, реализованный по `propmt.md`.

Менеджер разговаривает с AI-клиентом через микрофон, получает разбор по пяти навыкам и сохраняет историю тренировок. Приложение использует настоящий Gemini Live API и отдельный текстовый вызов Gemini для оценки. Подставных разговоров, случайных оценок и демонстрационной статистики в приложении нет.

## Что реализовано

- Адаптивный тёмный интерфейс: dashboard, настройка тренировки, голосовая сессия, coaching report, история с пагинацией.
- Четыре сценария: возражение о цене, сложный клиент, сравнение продуктов, закрытие сделки.
- Четыре характера клиента, три сложности, разговоры на английском и русском, контекст продукта.
- Микрофон → AudioWorklet → пересэмплирование → PCM16 mono 16 kHz → WebSocket → Gemini Live.
- Воспроизведение PCM16 mono 24 kHz через Web Audio, очередь аудио и очистка при перебивании.
- Подлинные input/output transcriptions от Gemini; роли, последовательность, время получения, сохранение по мере поступления.
- Автоматическая оценка после завершения, прогресс, сохранение отчёта и повтор при ошибке API.
- Pydantic-проверка отчёта, точные цитаты с ID реплики, проверка цитат по базе и вычисление общего балла в Python.
- SQLite/SQLAlchemy, восстановление состояний после рестарта, аналитика только по сохранённым данным.
- Ограничение параллельных голосовых сессий, размеров входящих сообщений, темпа аудио и длительности сессии; проверка Origin для WebSocket и HTTP-записей.

**Внешняя интеграция не проверена на реальном ключе.** Без настройки Gemini интерфейс работает и сообщает, какие настройки нужны; начать голосовую тренировку нельзя. Наличие переменных означает «настроено», но не подтверждает доступ к API или выбранной модели.

## Стек и структура

Python 3.11+, FastAPI, Uvicorn, официальный `google-genai`, SQLAlchemy, SQLite, Pydantic, python-dotenv через pydantic-settings. React 19, TypeScript, Vite, Tailwind CSS 4, Lucide React, Recharts, AudioWorklet/Web Audio API.

```text
backend/
  app/
    main.py                  REST API, dashboard, lifecycle, статическая сборка
    config.py                проверка окружения и readiness
    database.py              SQLAlchemy-модели и SQLite
    schemas.py               входные данные и структурированный отчёт
    training.py              WebSocket, транскрипция, завершение, очистка
    services/
      gemini_live.py          официальный SDK, соединение и конфигурация Live
      scenario_engine.py      динамический промпт AI-клиента
      evaluator.py            оценка, проверка доказательств и сохранение
  tests/                      API, persistence, evaluation, mocked Gemini
  .env.example
  requirements.txt            допустимые диапазоны версий
  requirements.lock.txt       версии, на которых выполнена проверка
frontend/
  src/
    pages/                    Dashboard, Training, Results, History
    components/               общие UI-компоненты
    hooks/useTraining.ts      lifecycle микрофона и WebSocket
    audio/VoiceAudio.ts       захват, воспроизведение, interruption
    services/api.ts           REST-клиент
    types.ts
  public/audio-worklet.js     потоковый resampler и PCM16 little-endian
  e2e/                        браузерные проверки Playwright
scripts/dev.sh                совместный локальный запуск
docs/PROTOCOL.md               протокол и состояния сессии
docs/VERIFICATION.md           проверенное и проверки с реальным API
```

## Установка на Ubuntu

Нужны Python 3.11 или новее с `venv`, Node.js **22.12+** и npm. Проверено здесь на Python 3.14.4 и Node.js 22.23.4. Установите подходящую поддерживаемую версию Node.js с [официального сайта](https://nodejs.org/en/download).

Из корня проекта:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.lock.txt
cp backend/.env.example backend/.env
npm --prefix frontend ci
```

Если `venv` отсутствует, установите пакет `python3-venv` для своей версии Python средствами Ubuntu. Альтернатива pip: `uv pip install --python .venv/bin/python -r backend/requirements.lock.txt`.

В текущем рабочем каталоге зависимости уже установлены, а Node.js размещён локально в игнорируемой `.runtime/`. Он не является исходным кодом приложения. Для ручных npm-команд в этом окружении:

```bash
export PATH="$PWD/.runtime/node-v22.23.4-linux-x64/bin:$PATH"
```

`scripts/dev.sh` сам использует этот Node.js, если системный `node` не найден.

## Настройка Gemini

1. Создайте API key в [Google AI Studio](https://aistudio.google.com/apikey).
2. Убедитесь, что ваш проект и регион имеют доступ к нужным моделям, квоте и, если требуется, биллингу.
3. Выберите актуальную **Live-модель с AUDIO-ответами и входной/выходной транскрипцией**, а для оценивания — текстовую модель с `generate_content` и structured JSON output. Используйте идентификаторы, доступные именно вашему проекту. Идентификаторы не зашиты в код.
4. Заполните `backend/.env` и перезапустите backend:

```dotenv
GEMINI_API_KEY=your-private-api-key
GEMINI_LIVE_MODEL=your-supported-live-model-id
GEMINI_EVALUATION_MODEL=your-supported-text-model-id
DATABASE_URL=sqlite:///./salespilot.db
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:8000","http://127.0.0.1:8000"]
MAX_CONCURRENT_SESSIONS=2
MAX_SESSION_SECONDS=600
EVALUATION_TIMEOUT_SECONDS=90
```

Значения `your-...` выше — обозначения для ваших настроек, а не действующие имена моделей. Актуальные возможности нужно сверять в [Gemini Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) и [официальном Python SDK](https://googleapis.github.io/python-genai/). Structured output описан в [документации Gemini](https://ai.google.dev/gemini-api/docs/structured-output).

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `GEMINI_API_KEY` | Секрет, только backend | Пусто, AI выключен |
| `GEMINI_LIVE_MODEL` | Live AUDIO-модель | Пусто |
| `GEMINI_EVALUATION_MODEL` | Текстовая модель | Пусто |
| `DATABASE_URL` | SQLite-файл | `sqlite:///./salespilot.db` |
| `CORS_ORIGINS` | JSON-массив разрешённых Origin, без `*` | localhost/127.0.0.1, порты 5173 и 8000 |
| `MAX_CONCURRENT_SESSIONS` | Голосовые соединения на процесс | 2, допустимо 1–10 |
| `MAX_SESSION_SECONDS` | Максимальная длительность | 600, допустимо 30–900 |
| `EVALUATION_TIMEOUT_SECONDS` | Таймаут текстовой оценки | 90, допустимо 5–180 |

`.env` читается из `backend/` независимо от текущего каталога. Относительный путь SQLite считается от **каталога запуска процесса**. При предложенном запуске файл будет `backend/salespilot.db`. Для собственного сервиса лучше указать абсолютный URL `sqlite:////absolute/path/salespilot.db`.

Неправильные диапазоны или небезопасный CORS останавливают startup. Отсутствующий ключ/модель дают явный `ai_ready: false`; dashboard и история остаются доступными. API key не отправляется в браузер, не хранится в frontend и не возвращается в health.

## Запуск

Самый короткий вариант из корня:

```bash
bash scripts/dev.sh
```

Открыть **http://127.0.0.1:5173**. Остановка — `Ctrl+C`.

Или два терминала:

```bash
# Терминал 1, из корня проекта
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --ws-max-size 16384
```

```bash
# Терминал 2, из корня проекта
npm --prefix frontend run dev
```

Vite проксирует `/api` и `/ws` в FastAPI. Health: http://127.0.0.1:8000/api/health. OpenAPI: http://127.0.0.1:8000/docs.

Для демонстрации собранного приложения без dev-сервера:

```bash
npm --prefix frontend run build
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --ws-max-size 16384
```

Открыть **http://127.0.0.1:8000**. FastAPI подключает `frontend/dist` при старте; если сборка появилась позже, перезапустите backend. Маршрутизация frontend использует `#/...`, поэтому прямые переходы и обновление страницы работают без rewrite-правил. `npm run preview` предназначен для проверки статики, а полный собранный MVP следует запускать через FastAPI.

**Используйте один worker.** Живые соединения, лимит одновременных сессий и задачи оценки принадлежат одному процессу. Запуск нескольких Uvicorn workers для этого MVP не поддерживается.

## Как провести тренировку

1. Откройте dashboard. Пустая база показывает нули/прочерки и приглашение начать, а не вымышленные достижения.
2. Выберите **New training** или карточку сценария.
3. Задайте сценарий, характер, сложность, язык и описание продаваемого продукта. Для конкретных ответов укажите фактическую цену и преимущества.
4. Нажмите **Start training**, разрешите микрофон. Рекомендуются наушники. AI-клиент начнёт с вопроса.
5. Говорите естественно, без кнопки на каждую реплику. Микрофон можно временно выключить. Доступно перебивание, когда его сообщает Live API.
6. Нажмите **End session**. Приложение остановит микрофон, дождётся финальных событий транскрипции, закроет соединение и запустит оценку.
7. Посмотрите score, radar, сильные стороны, зоны роста и рекомендации. Нажатие на цитату прокручивает к соответствующей реплике.
8. История и dashboard сохраняют прогресс после перезапуска. **Practice again** повторно выбирает сценарий; остальные настройки можно изменить.

Микрофон работает на `localhost`/`127.0.0.1` или HTTPS. Открытие по обычному HTTP на другом устройстве не даёт необходимого secure context.

## Оценка и аналитика

Пять целочисленных категорий 0–10: needs discovery, communication, objection handling, value proposition, closing. Общий балл `sum(category_scores) * 2`, диапазон 0–100. Ответ LLM с произвольным `overall_score` игнорируется.

Каждая сильная/слабая сторона содержит `turn_id` и точную подстроку `quote`. Сервер отклоняет отчёт, если ID отсутствует или цитата не встречается в сохранённой реплике. Это проверяет происхождение цитаты, но не гарантирует объективность выводов модели.

Минимум для оценки: две реплики каждого участника и 30 слов продавца. Нет обеих транскрипций, соединение оборвалось или финальный ответ не завершился — оценка отключается с объяснением. Недостаточный разговор получает `insufficient_data`, а не случайный низкий балл. Ошибка API/валидации получает `evaluation_error`; доступен retry без новой записи разговора.

Dashboard считает число реально начатых сессий, суммарное время, средний балл оценённых сессий, средние категории и последние 20 баллов. Improvement — относительное изменение последнего балла к первому; при менее чем двух оценках или первом балле 0 показывается прочерк. Отчёт сравнивается с ближайшей предыдущей оценённой сессией среди последних 20; для более старых отчётов сравнение может отсутствовать. История также содержит созданные, но не начатые сессии.

## Архитектура и API

```text
Browser / React
  ├─ REST ──────────────────────────┐
  └─ AudioWorklet ↔ WebSocket ───────┤
                                FastAPI
                                  ├─ google-genai Live → voice + transcripts
                                  ├─ google-genai text → validated coaching JSON
                                  └─ SQLAlchemy / SQLite → history + reports
```

| Метод / путь | Назначение |
| --- | --- |
| `GET /api/health` | Backend readiness и список недостающих переменных |
| `POST /api/sessions` | Создать настройки тренировки |
| `GET /api/sessions?limit=20&offset=0` | История, `items` + `total` |
| `GET /api/sessions/{id}` | Сессия, сообщения и отчёт |
| `POST /api/sessions/{id}/evaluate` | Очередь оценки/retry, HTTP 202 |
| `GET /api/sessions/{id}/evaluation` | Готовый отчёт, иначе 409 |
| `GET /api/dashboard` | Аналитика |
| `WS /ws/training/{id}` | PCM, события, транскрипция, завершение |

Точное описание кадров, завершения и состояний — в [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Тестирование

```bash
# Из корня
.venv/bin/python -m pytest -c backend/pytest.ini backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
```

Browser checks требуют запущенные backend + frontend. **Используйте отдельную тестовую БД:** API-тест браузера создаёт сессию.

```bash
# Терминал 1
DATABASE_URL=sqlite:////tmp/salespilot-e2e.db bash scripts/dev.sh

# Терминал 2
cd frontend
npx playwright install chromium
npx playwright test
# Или используйте уже установленный Chrome:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome npx playwright test
```

Тесты Gemini используют mocks; браузерный голосовой тест использует искусственный микрофон Chrome и тестовый WebSocket. Тестовые диалоги/оценки лежат только в тестах и не загружаются приложением как реальные данные. Они не доказывают работоспособность реальной модели, качество русского/английского распознавания, низкую задержку или акустическое качество.

Сводка выполненных проверок и сценарии ручной приёмки: [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Ограничения MVP

- Один локальный пользователь. Нет аутентификации, разграничения доступа, команд и мультитенантности. Не публикуйте текущий backend как общедоступный сервис.
- Вся речь отправляется в Google Gemini; сохранённые расшифровки отправляются текстовой модели для оценки. У приложения нет собственной записи raw audio, но обработка данных провайдером регулируется его условиями.
- Транскрипты и отчёты — обычная локальная SQLite, без шифрования, UI удаления и политики хранения. Перед демонстрацией используйте несекретные данные.
- Нет автоматического восстановления Live-соединения и длинных сессий: максимум 10 минут по умолчанию, 15 минут настройкой. После обрыва нужно начать новую тренировку; принятые реплики остаются в истории.
- Конечная транскрипция ожидается ограниченное время. При незавершённом ответе моделью оценка блокируется, чтобы не выдавать результат по очевидно неполным данным.
- Настройки транскрипции должны поддерживаться выбранной моделью. Несовместимый API даёт явную ошибку, без фальшивого fallback.
- Интерфейс английский; язык разговора и обратной связи выбирается English/Russian.
- Оценка — советы LLM для обучения, не научно валидированный измеритель навыка. Проверка цитат не устраняет все ошибки модели.
- Startup создаёт таблицы, но миграции схемы пока отсутствуют. REST-оценки выполняются в памяти процесса; после рестарта прерванную оценку нужно повторить.
- Ограничение голосовых потоков и размеров сообщений не заменяет полноценный rate limiter, access control или защиту от злоупотреблений.

Для production: authentication/authorization, PostgreSQL + Alembic, tenant isolation, durable job queue, распределённые лимиты, HTTPS, управление ключами, политика приватности/согласие, retention/deletion, шифрование, наблюдаемость без raw audio/секретов, API-cost quotas, нагрузочные тесты и валидация оценочной рубрики с экспертами.
