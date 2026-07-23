# Looksmax — ответы продукта на вопросы аналитики

Дата: 2026-07-23. Источник: код `frontend` (ветка develop, виджет `app/(vibe-code)/looksmax`), git-история, определения GA-ивентов в `src/shared/lib/analytics/index.ts`. Все ссылки — файл:строки в репо frontend.

**Важный контекст ко всему документу:** текущий looksmax-виджет (квиз → скан → отчёт) целиком добавлен **02.07.2026** коммитом `74ebfd2e` «Add new looksmax widget» — он полностью заменил старый чат/генерационный looksmax. Любые данные до 02.07 относятся к другому продукту с теми же именами ивентов.

---

## 1. Квиз

### 1.1. Порядок шагов, ветвления, A/B

**Канонический порядок в коде ДРУГОЙ: gender — ПЕРВЫЙ шаг, а не девятый.**

```
gender → age → fix → bugs → holdback → mirrors → rate → gap → growth → math → ratio → ascended → scan
```

Захардкожен одним массивом `STEPS` в `app/(vibe-code)/looksmax/ui/funnel/index.tsx:30-44`. Навигация — чистая арифметика индекса (`goNext = step+1`, `goBack = step-1`).

**Ветвлений, рандомизации и A/B нет вообще** — грепы по feature-flag/experiment/Math.random по виджету пустые. Все юзеры видят одни и те же 13 шагов в одном порядке. Массив байт-в-байт неизменен с момента создания виджета (проверено `git log -S` по всем веткам).

Порядок «age → … → gender → …» из данных — это сортировка по проценту показов, а не порядок продукта. Раз gender — шаг 0, его step-view обязан быть ≥ любого последующего шага; то, что он ниже — аномалия измерения (см. 1.2).

### 1.2. Почему gender видят ~70%

**Условного скипа нет.** Gender всегда рендерится первым (`funnelStep` инициализируется 0, `use-session-state.ts:48`), авто-продвижения нет (юзер обязан тапнуть Continue, `gender-body.tsx:18-42`), пол из restore/лендинга только пре-филлит выбор и разблокирует CTA — шаг всё равно показывается и step-view фаерится. Deep-link мимо шага невозможен (единственный query-параметр виджета — `?lmdebug=1`).

Реальные причины недосчёта — измерительные:

1. **Потеря первого ивента на загрузке.** step-view для gender фаерится в mount-`useEffect` во время гидрации, до любого жеста юзера. `sendGAEvent` — голый emit без буфера/ретрая; ивенты первой секунды страницы теряются чаще, чем ивенты по клику Continue на последующих шагах.
2. **Лендинговый трафик.** На лендинге ScanPanel пол — это тоггл, который фаерит `sex-select`, а НЕ `funnel-step-view/gender`. Эта популяция вносит другие шаги, но не gender-view.

**Вывод: это не дыра воронки.** Считать gender «шагом с 70% прохождением» нельзя — по коду через него проходят 100% тех, кто входит в квиз в продукте.

### 1.3. Семантика funnel-step-view

`ui/funnel/index.tsx:101-107`: фаерится **на каждую смену шага**, дедуп только от ре-рендеров того же шага (ref внутри компонента).

- **Back-повтор фаерит снова**: forward → back → forward даст средней ступени 3 step-view.
- **Ремаунт/F5 фаерит снова**: ref сбрасывается, у текущего шага — новый view. Ремаунт случается и при выходе из idle-фазы и возврате (например, 403 credit-wall возвращает scanning → idle).
- Никакого «раз за сессию» нет нигде в GA-слое.

**Для подсчёта реальных показов** step-view пригоден только с дедупом на стороне запроса (по user/session). Уникальные юзеры по шагу — корректно; сырые ивенты — нет.

### 1.4. Как попасть на загрузку фото без step-view/scan (те самые 19%)

Экран загрузки фото — это и есть шаг `scan` (ScanBody с дропзоной). Ключ к разгадке: **`photo-upload` фаерится и на ВОССТАНОВЛЕНИЕ слота, не только на ручную загрузку** (edge-детект «слот получил CDN-link», `use-upload.ts:44-56`; это задокументировано в комментарии к ивенту).

Пути «photo-upload есть, scan step-view нет»:

1. **Лендинг-хэндофф (доминирующий).** Лендинг пишет `lm_data` с `pendingGenerate:true` → на `/web/looksmax` auto-start восстанавливает фото (`photo-upload` фаерится) и сразу вызывает `handleScan` → фаза `scanning`. Funnel анмаунтится, до шага scan рендер не доходит → **step-view/scan нет**. Ответы квиза у таких юзеров — с прежнего визита или лендинга.
2. **Возврат после реги/оплаты.** Перед auth-wall'ом `handleScan` сохраняет `lm_data` c `pendingGenerate:true` (`use-looksmax/index.ts:141-150`). После OAuth-редиректа — restore фото + авто-запуск скана, шаг scan снова не рендерится. Если GA завёл новую сессию на редиректе — в ней photo-upload без scan-view.
3. **F5 посреди квиза — НЕ этот случай**: restore прогресса сначала коммитит шаг 0, потом сохранённый шаг N, и step-view для N (включая scan) фаерится.
4. **Deep-link — невозможен**, обработчиков `?step=` нет.

Итого 19% — это лендинг-хэндофф + пост-OAuth resume, оба легитимные, не баг воронки. Если нужно чистое «видел экран загрузки» — считать по step-view/scan; «имеет фото в системе» — по photo-upload, понимая, что он включает restore.

### 1.5. Скипы

`SKIPPABLE = {age, fix, bugs, holdback, mirrors, rate}` (`ui/funnel/index.tsx:63`) — ровно 6 шагов, совпадает с данными. НЕ скипаются: gender (жёсткий гейт — без ответа CTA disabled), gap, growth, math, ratio, ascended, scan.

**Age скипается, потому что возраст фактически опционален**: ruler-контрол с дефолтом 25 (`use-session-state.ts:36`), значение никогда не null, skip просто принимает текущее/дефолтное. В скан уходит число всегда.

---

## 2. Фото и генерация

### 2.1. photo-upload при повторных загрузках

Фаерится по фронту «слот стал заполненным» (false→true на CDN-link). Последовательность upload → remove → upload даёт `photo-upload`, `photo-remove`, снова `photo-upload` — **да, повторные загрузки фаерят и раздувают счёт**. Плюс, как выше: **фаерится на авто-restore после sign-in редиректа** — это тоже вклад в раздувание. Тихая замена «на месте» без опустошения слота не пере-фаерит, но в UI такого пути нет.

### 2.2. Когда side стал опциональным

**21.07.2026, коммит `c4532316` «New looksmax logic»** (автор — Elizaveta Gainulina): `MIN_FILES 2 → 1`, `fileLimitsOverride.min 2 → 1`, лейбл «Side photo (optional)», обработка front-only по всему пайплайну (geometry, prompt, cache, restore). До этого — с самого запуска 02.07 — оба фото были обязательны. На графике перелом ищи с 21.07; 96% co-upload за 03–22.07 почти весь период отражает обязательность, дальше — привычку (оба слота по-прежнему видны).

### 2.3. generate-click и валидация

Порядок в `handleScan` (`use-looksmax/index.ts`): re-entrancy exits → **валидация формы (≥1 фото с CDN-link + sex) — при провале return ДО ивента** → `generate-click` (с параметрами files_count, credits_left, is_paid_plan) → auth guard → credit pre-flight.

То есть: **generate-click = валидная попытка**, фаерится до auth/кредитов, но никогда с пустой формой. Нажать без фото нельзя — CTA disabled пока фронт-фото не долинковалось (`ctaDisabled`, `ui/funnel/index.tsx:158-160`). С одним фронтом — можно (side опционален), увидишь `files_count: 1`.

---

## 3. Рега

### 3.1. auth-wall-show

`use-guards.ts:19-26`: фаерится **только для незалогиненных** внутри `if (!isLoggedIn)`, вместе с показом sign-up попапа. Залогиненные проходят мимо без ивента и без стены. **Логика «конверсия стены 77% по незалогиненным» — корректна.**

Каверзность: guard в auto-start (`use-auto-start.ts:84-91`) показывает тот же попап **без** `auth-wall-show` — незалогиненный лендинг-трафик видит стену, не попадая в ивент. Стена слегка недосчитана, но каждый зафиксированный показ гарантированно по незалогиненному.

### 3.2. URL реги

Sign-up попап открывается на `/web/looksmax`, но дальше флоу расходится:

- **Google/Apple** — полный редирект: `/auth/r/<provider>` → внешний OAuth → колбэк `/web/auth/google` или `/web/auth/apple/callback`, где `useAuthToken` фаерит `registration`/`login` (**на URL колбэка**), и только потом `router.replace` обратно на `/web/looksmax`.
- **Email** — целиком внутри попапа, ивенты фаерятся **на `/web/looksmax`**.

~10% рег с `page_location=/web/looksmax` — это email-доля; ~90% — Google/Apple на auth-колбэках. Отдельной страницы `/web/auth` в флоу нет. Методология «рега ≤24ч после стены» — правильный обходной путь.

### 3.3. Возврат после реги и «We could not restore your photos»

Да, юзер возвращается в точное место: фото restore + авто-запуск скана (см. 1.4, путь 2).

Ошибка в коде — в единственном числе: **«We could not restore your photo. Please re-upload it.»** (`use-looksmax/index.ts:203`). Триггер: после успешной реги фронт-фото не удалось превратить обратно в File по всем трём каналам — in-memory File (умирает на редиректе) → кэш IndexedDB/localStorage-JPEG (`photo-cache.ts`) → CDN-fetch (может упасть по CORS). Типичный сценарий — **мобильный инкогнито/private mode** (IndexedDB не переживает редирект) + не записался localStorage-фолбэк (квота/HEIC).

**Да, это потеря фото на round-trip реги.** Юзер видит «Analysis failed» с двумя кнопками: **Try again** (`retry`) повторяет restore — если кэш пуст, крутит ту же ошибку по кругу; **Generate again** (`reset`) — полный сброс (фото, кэш, сессия) в начало квиза, единственный рабочий выход = ре-аплоад.

---

## 4. Скан и тизер

### 4.1. scan-complete

**Фронтовый показ результата**, не бэк: фаерится в `use-looksmax/index.ts:242-250` после того как (а) пришёл непустой результат, (б) доиграла анимация чек-листа, (в) фаза переключена в `reveal`. `duration_s` — фронтовый таймер.

**Тизер без scan-complete — да, штатно.** Результат хранится в `lm_session` 24 часа; при возврате фаза стартует сразу с `reveal` (`use-session-state.ts:26-33`), минуя квиз и скан, `handleScan` на существующем результате рано выходит. Ремаунт ReportScreen фаерит `report-view teaser` заново — без нового scan-complete. Это и есть 9,881 > 9,488.

### 4.2. report-view teaser

Раз за **маунт** компонента (ref-дедуп внутри), каждый reload/возврат = новый ивент. Прямой шареабельной ссылки на тизер нет — только localStorage-restore в том же браузере; свежий визитор всегда стартует с квиза.

### 4.3. No face detected

Возникает **на geometry-стадии скана** (фото уже загружены, до/без Gemini-анализа): geometry-endpoint вернул `face_unreadable` и нет фронт-геометрии (`use-face-scan/index.ts:91-97`). Юзер видит «Analysis failed» + текст. **retry** = `handleScan` заново **с теми же фото** (не возвращает на загрузку, ответы квиза целы); **reset** = полный сброс к началу квиза со стиранием фото. Для «no face» retry с тем же фото почти гарантированно повторит ошибку — по-хорошему тут нужен возврат на шаг загрузки с сохранением квиза (сейчас такого пути нет: либо то же фото, либо всё заново).

---

## 5. Пейволл и покупка

### 5.1. unlock-tap

В коде **8 источников** — к семи из данных добавить `current-gauge` (гейдж текущего скора в geometry-photos). Полный список с файлами: current-gauge, after-photo-cell, potential-gauge (`ui/geometry-photos`), cta-bar (`ui/report-screen`), routine-tease, halos-focus, sub-score-locked, sub-score-plan-tease (последние два несут `detail` = ключ саб-скора).

**Каждый unlock-tap открывает один и тот же пейволл** — кастомный looksmax (`LooksmaxPaywallWrapper` / `CustomWidgetPaywall`: 3 подписки, дефолт monthly, + try-once $2.99 `package-onetime`). Не packages, не signup: unlock-таргеты существуют только в тизере, т.е. юзер уже залогинен и не entitled; враппер дополнительно рендерится только free-plan юзерам.

### 5.2. credit-wall-show vs «get feature view» — объединять НЕЛЬЗЯ без дедупа

Это два разных ивента с перекрытием:

- **`get feature view`** (`GA_sendGetMoreFeaturesPopUpEvent`) — фаерится при **каждом открытии кастомного looksmax-пейволла**, из любого источника.
- **`credit-wall-show`** — только в **scan-пути** при блокировке по балансу: `wall=subscription` (free) или `wall=packages` (paid, мало кредитов).

Перекрытие: free-plan scan-wall открывает тот же кастомный пейволл → **фаерятся ОБА ивента на один показ**. А `credit-wall-show(packages)` — это вообще другой попап (packages), у которого свой view-ивент (`credits paywall view`), не `get feature view`.

**Рекомендация:** шаг «пейволл показан» = **только `get feature view`** (покрывает и тизер-анлоки, и free scan-wall). `credit-wall-show` использовать как разрез причины блокировки, не суммировать.

### 5.3. Где живёт покупка

Веб: **всегда embedded Stripe внутри модалки на `/web/looksmax`, без редиректов** — `resolveCheckoutUiMode` возвращает `embedded` для веба, clientSecret подменяет тело модалки на `PaywallEmbeddedView`, purchase-ивенты пушатся инлайн (`method: stripe_embedded`). Apple Pay / Google Pay — тоже инлайн (`method: apple_pay`), сами пушат purchase-семейство. Единственный редирект — **desktop-приложение (Tauri)**: hosted checkout (`method: stripe_checkout`), но `returnUrl` — тот же pathname виджета, так что `page_location` снова `/web/looksmax`. **Атрибуция purchase по `pl=/web/looksmax` — безопасна, ничего не теряется.** Разрез флоу — по полю `method`.

---

## 6. Полный отчёт и план

### 6.1. report-view full и 26% «купивших без full»

Гейт отчёта: `entitled = session.entitled || pricing.isPaidPlan` (`use-looksmax/index.ts:323`). Два независимых пути:

- `session.entitled` — оплата **внутри виджета** ($2.99 try-once или подписка с looksmax-пейволла), персистится в `lm_session`.
- `isPaidPlan` — **любая активная подписка**, в т.ч. купленная где угодно ещё. Такие юзеры получают full **без единого purchase-ивента на looksmax**.

Ивент фаерится раз за вариант за маунт (тот же ref, что и teaser); при покупке без релоада legitimately фаерится teaser, потом full. Кросс-сессионного дедупа нет.

Объяснения разрыва 215 full vs 290 покупок:

1. **Billing-race**: на первом рендере биллинг ещё не загружен → `entitled=false` → фаерится `teaser`; `full` фаернётся только когда биллинг доедет, — если юзер ушёл раньше (код прямо документирует лаги getUser/billing на реальных телефонах), full не фаерится вовсе.
2. **Redirect-оплата** (`?payment=true` reload): full зависит от повторного `PAYMENT_COMPLETED_EVENT`/refresh биллинга на свежей странице.
3. **Купил и не вернулся к reveal**: сессия отчёта живёт 24ч; покупка без последующего визита в reveal = нет full-view.

Т.е. 26% — структурная недоставка (race + невозврат + подписочный путь), а не «фича skip'ает ивент по плану». Для точного «открыл полный отчёт» стоит рассмотреть отдельный фаер full при unlocked-рендере после подтверждённого биллинга.

### 6.2. plan-day-nav

Это **prev/next степпер по дням 1–90** (не свайп-карусель): каждый тап ‹/› = один ивент с direction и day (`ui/plan-view/index.tsx:42-67`). Авто-прыжок на текущий день при загрузке ивент НЕ фаерит — все 1,392 ивента ручные. ~30 кликов/юзер = реальное листание плана.

**Отдельного уровня доступа нет**: план строится в том же `entitled`-эффекте, что открывает отчёт, полностью на клиенте из статического `tasks.json`, бесплатно. Все, кто видит full-отчёт, видят план.

---

## 7. Кросс-промо

### 7.1. Модалка post-onboarding

**Удалена намеренно 02.07** — не отдельным решением про модалку, а тотальной заменой виджета: коммит `74ebfd2e` «Add new looksmax widget» выпилил старый чат-виджет вместе с его `WhatsNextPopup`/`useWidgetPostOnboarding`. Обрыв cta-\* 02–03.07 — ровно это.

Текущее состояние: **кросс-промо видят только entitled-юзеры** — блок `MoreWidgets` рендерится исключительно в платной ветке отчёта (`report-screen/index.tsx:162-163`). Тизер-ветка — только blur + пейволл-тизеры, без кросс-промо. Пост-генерационной модалки нет ни у кого. Инфраструктура жива (looksmax-диспетчер в registry, `whats-next-card.tsx` — но это карточка looksmax **в чужих** попапах). Вернуть кросс-промо всем сгенерившим = осознанная продуктовая задача (например, MoreWidgets в тизер-ветку или новый WhatsNext после reveal), кода-переключателя «включить обратно» нет.

### 7.2. Куда ведут карточки more-widget-click

7 карточек (в данных 6 — есть ещё Color Analysis), все — голые `<Link>` без хэндоффа фото:

| Карточка (eventLabel)   | Куда ведёт                                                |
| ----------------------- | --------------------------------------------------------- |
| Skin Analyzer           | `/ai-skin-analyzer`                                       |
| Face Shape              | `/ai-face-shape-detector`                                 |
| Hair Color              | `/ai-hair-color-changer` (отдельный image-виджет)         |
| Style Analysis          | `/ai-style-analysis`                                      |
| Hairstyle               | `/ai-style-analysis` — **тот же URL, без таба/параметра** |
| Makeup (male: Grooming) | `/ai-style-analysis` — тот же URL                         |
| Color Analysis          | `/ai-style-analysis` — тот же URL                         |

Т.е. Hairstyle/Makeup/Color Analysis — это НЕ табы и не пресеты: четыре разные обложки одного и того же входа в style-analysis, ничто не сообщает виджету, какой «режим» юзер выбрал. Hair Color — не таб style-analysis, а свой виджет. (Продуктовый долг: либо deep-link параметры в style-analysis, либо честные разные цели.)

---

## 8. Глобальные

### 8.1. test_user

**Фикс уже в коде фронта — смержен 21.07.2026** (`7835d1a7`, PR #1898): allow-list из 13 email (в `src/shared/lib/analytics/test-users.ts`), флаг ставится при `getUser`. Проставляется на обоих путях: gtag-ивенты (наши `overchat` события — поедет в GA4 сам) и dataLayer-пуши (плоский `test_user: true` — **требует GTM-маппинга**, иначе в GA4 не долетит). 0 из 14.8M — потому что вся история до 21.07. Проверять появление параметра на данных с 21–22.07; для карточных/commerce-ивентов сначала домапить в GTM.

> ⚠️ Проверка аналитики 23.07: параметр в BQ-партициях 20–23.07 так и НЕ появился (0 событий). Либо фронт не задеплоен на прод, либо тег режет параметр — вернуть девам.

### 8.2. sign up view недосчёт

Коммиты около 17.07 не при чём (последнее изменение самого фаера — 12.06). Причина структурная и живёт до сих пор: попап подключён через `dynamic(..., {ssr:false})` — ленивый клиентский чанк, а `isOpen` флипается в Redux независимо. Окно «Redux открыл → чанк ещё не смонтировался → юзер закрыл/редирект» теряет view-ивент при показанной рамке модалки. Фикс фронтовый: фаерить view на Redux-триггере открытия (или гарантировать эмит при маунте с уже-открытым состоянием). Пока не сделан — недосчёт ~15–20% останется.

### 8.3. GTM-маппинг dataLayer-событий

Фронт пушит (все из `src/shared/lib/analytics/datalayer.ts`, через `sendPurchaseEventsFromSession`):

- `purchase` — GA4-ecommerce-форма: `ecommerce.{transaction_id, currency, value, items[{item_id=planCode, item_name, item_category, item_variant, price, quantity}]}` + `user_id, method, payment_status, paywall_source`. Перед ним пуш `{ecommerce: null}` (reset).
- `unique_purchase` — **только при `is_new_payer`** (первая оплата): `user_id, method, transaction_id, value, currency, paywall_source, items`. Это и есть first-payer-сигнал.
- `subscription_started` / `purchase_onetime` / `purchase_credits` — плоские: `user_id, method, value, currency, subscription_plan, paywall_source` (выбор по planCode).
- `begin_checkout` — плоский `value, currency, items, user_id, method`.
- `registration` / `login` — `{user_id, method}` (google/apple/email).

Для GTM: триггер Custom Event = имя, тег GA4 event; для `purchase`/`unique_purchase` читать вложенный `ecommerce`, для plan-type — плоские ключи. Плюс не забыть пробросить `test_user` (см. 8.1).

### 8.4. twek-лендинг

- Виджет **существует**: `app/(vibe-code)/ai-twerk-generator` добавлен **17.07** (`8a385f81`), отдельный полноценный виджет (НЕ пресет ai-dance-generator — у того twerk-пресета нет; и не ai-video-generator).
- `/web/ai-twek-generator` 404-ит из-за **опечатки** (нет `r`); rewrite'ов/middleware, ловящих её, в репо нет.
- Правильная цель для лендинга: писать в localStorage ключ **`ai_twerk_generator_funnel_data`** payload `{files:[{link, croppedImageLink, type, name}], aspect, duration, resolution}` и редиректить на **`/web/ai-twerk-generator/`** (с trailing slash). Наличие ключа само триггерит auto-start (auth → paywall → генерация). Query-параметров/пресетов у виджета нет by design.
- Фикс — на стороне лендинга (CTA/роутинг), фронту делать ничего не нужно.

---

## TL;DR: что поправлено в методологии воронки (внесено 23.07)

1. **Порядок шагов** в воронке — с gender первым; его «70%» — артефакт (потеря первого ивента + лендинг), не дропофф.
2. **step-view** — по уникам, не по ивентам (back/ремаунт пере-фаерят). ✅ так и считалось.
3. **19% без scan-view** — лендинг-хэндофф и пост-OAuth resume; photo-upload включает restore-фаеры, это не показы экрана.
4. **Пейволл-шаг** = только `get feature view`; `credit-wall-show` не суммировать (двойной счёт + чужой попап). ✅ внесено (число не изменилось — перекрытие уников было полным).
5. **Покупки** по `pl=/web/looksmax` — полны, чекаут embedded; флоу различать по `method`.
6. **report-view full ≠ купившие**: подписчики entitled без покупки, billing-race теряет full-фаер; 26% — структурно.
7. **Точка перелома side-optional — 21.07**, test_user — тоже 21.07: до этих дат в данных их не искать. (test_user в BQ пока так и не виден — см. 8.1.)
