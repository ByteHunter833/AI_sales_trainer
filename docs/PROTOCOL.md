# WebSocket protocol v1

Endpoint: `/ws/training/{session_id}`. Origin обязан входить в `CORS_ORIGINS`. Настройки читаются из созданной REST-сессии; клиент не может менять роль или промпт через WebSocket. Повторный старт уже использованного ID запрещён.

## Browser → backend

| Кадр | Содержимое |
| --- | --- |
| Binary | Raw PCM16, signed, little-endian, mono, 16000 Hz. Обычно 100 ms = 1600 samples = 3200 bytes |
| JSON text | `{"type":"audio_pause"}` — передать `audio_stream_end` при mute |
| JSON text | `{"type":"end"}` — закончить тренировку и запустить сохранение/оценку |

Максимум 16384 bytes в бинарном кадре; длина чётная и не нулевая. Максимум 1024 символа в control JSON. Нормальный поток 32000 bytes/sec; допускается до 96000 bytes на секундное окно для сетевой пакетизации. Нарушение прекращает сессию с явной ошибкой. Дополнительно запускайте Uvicorn с `--ws-max-size 16384`, чтобы ограничивать сообщение до разбора приложением.

## Backend → browser

| Тип | Поля / действие |
| --- | --- |
| `connected` | `input_sample_rate:16000`, `output_sample_rate:24000`, `started_at` ISO UTC, `max_duration_seconds` |
| Binary | PCM16 mono little-endian 24000 Hz; ставится в очередь Web Audio |
| `transcript` | `message: {id, sequence, speaker, content, timestamp}` |
| `interrupted` | Немедленно остановить текущие и запланированные AudioBufferSourceNode |
| `turn_complete` | Модель завершила ход; закрыть текущие накопители транскрипции |
| `ending` | `message`, сервер достиг лимита времени; остановить микрофон |
| `error` | `message`, безопасное описание без ключа/stack trace |
| `ended` | `session_id`, сессия сохранена; открыть отчёт и опрашивать REST |

`speaker` — `customer` или `salesperson`. `timestamp` — время получения начала реплики сервером, а не точная временная метка акустического сегмента. Incremental-текст Gemini накапливается в реплику; событие `transcript` содержит **полный актуальный текст** этой реплики. Frontend заменяет сообщение с тем же `id`, не добавляет копию. Каждое обновление сохраняется в SQLite до отправки UI.

Стартовый служебный текст, запускающий customer opening, не сохраняется в качестве реплики продавца. Тексты берутся исключительно из `input_transcription`/`output_transcription` Live API.

## Завершение и сбои

1. Browser прекращает захват и отправляет `end`.
2. Backend передаёт `audio_stream_end=True` и продолжает принимать последние события.
3. Ожидание: минимум 1,5 секунды; завершение, когда модель закончила ход и события не приходили 1 секунду; максимальное ожидание 7 секунд.
4. Backend отменяет сопряжённые задачи, закрывает Live SDK context, сохраняет `ended_at`/duration/status, освобождает slot.
5. После штатного завершения запускается задача оценки. `ended` означает сохранение разговора, **не готовность оценки**.
6. UI опрашивает `/api/sessions/{id}` до конечного состояния. Ошибка оценивания оставляет transcript и допускает retry.

При разрыве браузерного соединения tasks/SDK также закрываются, частичная расшифровка остаётся. Автоматического resume нет. Если отсутствует транскрипция одного из участников, финальный ход не завершён или разговор оборвался, сервер сохраняет `transcript_warning` и не оценивает его.

## Состояния

```text
created → connecting → active → completed → evaluating → evaluated
               │          │          │            └── evaluation_error → retry
               │          │          └── insufficient_data
               │          └── interrupted / error
               └── error
```

`created` не считается реальной тренировкой в dashboard. При рестарте незавершённые `connecting`/`active` переводятся в `interrupted`, а `evaluating` — в `evaluation_error`. Один процесс backend обязателен для корректной работы этого реестра.
