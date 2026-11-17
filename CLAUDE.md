# Задачник — Telegram Mini App

Личный таск-менеджер Олега. Этот репозиторий — только фронтенд (GitHub Pages).
Сервер — Google Apps Script, привязанный к Google-таблице; его кода здесь нет.

## Файлы
- `index.html` — каркас: шапка, `#view`, кнопка `#fab`, нижнее меню `.tabbar`, `#sheet-root`, `#toast`.
- `styles.css` — весь внешний вид. Цвета берутся из темы Telegram (`--tg-theme-*`) через переменные в `:root`.
- `app.js` — логика, данные, синхронизация и HTML-шаблоны экранов (строки в функциях `view*`, `taskRow`, `openEditor`, `askSpent`, `openSettings`, `openQuickAdd`).
- `config.js` — `API_URL` (ссылка на Apps Script). Не менять.

## Просмотр без Telegram
Открой `index.html` в браузере (например `npx serve .`) — включится демо-режим
с тестовыми задачами. Ничего не сохраняется, сервер не вызывается. Удобно для работы над дизайном.
Проверяй мобильную ширину 360–430 px, светлую и тёмную тему.

## Правила при работе над дизайном
- Можно свободно менять `styles.css`, разметку в шаблонах и классы.
- НЕЛЬЗЯ ломать хуки, на которые завязана логика:
  - id: `view`, `title`, `sync`, `settings-btn`, `banner`, `fab`, `inbox-badge`, `sheet-root`, `toast`, `search`, `all-list`, `show-done`;
  - атрибуты `data-*`: `data-act`, `data-id`, `data-tab`, `data-pid`, `data-date`, `data-q`, `data-f`, `data-sub`, `data-sid`, `data-ed`, `data-min`, `data-sp`, `data-st`, `data-mode`, `data-qa`, `data-url`, `data-color`, `data-for`, `data-h`, `data-m`;
  - классы, которые ищет JS: `.task`, `.tabbar`, `.sheet-wrap`, `.sheet`, `.sheet-backdrop`, `.closing`, `.on`, `.qa-input`, `.ed-title`, `.subs`, `.sub`, `.sub-add`, `.links`, `.spent-field`, `.settings`, `.proj-name`, `.home-slot`.
- Не трогать функции `api`, `enqueue`, `flush`, `load`, `saveTasks`, `removeTask`, `saveProjects`, `completeTask`, `nextDue` и модель данных.
- Не подключать фреймворки и сборщики: проект должен оставаться статическими файлами для GitHub Pages.

## Модель задачи
`id, title, note, project (id проекта), status (inbox|active|done), due_date (YYYY-MM-DD), due_time (HH:MM),
quadrant (1 срочно+важно, 2 важно, 3 срочно, 4 ни то ни другое, null), subtasks [{id,t,done}],
repeat {type: daily|weekly|monthly|days, n} | null, created_at, updated_at, done_at (ISO),
spent_min, postpone_count, source (app|bot|forward|repeat|example)`.
