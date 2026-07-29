# Overchat — схема данных GA4 в BigQuery

Полный справочник по таблице, схеме событий и ловушкам. Читать перед написанием любого запроса.

## Таблица

```
`zinc-hour-447409-k5.analytics_469242162.events_*`
```

- Это **GA4-экспорт, только WEB**. Данных мобильных приложений (iOS/Android) в BigQuery НЕТ — они в Adapty/сторах, не здесь.
- Партиции по дате: фильтровать через `_TABLE_SUFFIX BETWEEN 'YYYYMMDD' AND 'YYYYMMDD'` (формат `20260605`).
- GA4-экспорт догоняет с лагом ~2-3 дня. Поэтому всегда брать буфер от сегодняшней даты (см. SKILL.md).

## ⚠️ Двойная схема событий — ГЛАВНЫЙ источник ошибок

Семантика события лежит **в разных местах** в зависимости от типа страницы:

### Лендинг-страницы (`/image/<slug>`, `/video/<slug>`, `/text/<slug>`, `/chat/<slug>`, `/models/<slug>`)
- Семантика — **в самом `event_name`** (snake_case), например:
  - `ai_face_rater_click_upload`, `ai_face_rater_upload_success`, `ai_face_rater_click_generate`
  - `looksmax_image_upload_attempt`, `looksmax_click_google`, `looksmax_click_close_paywall`
  - `image_combiner_upload`, `image_combiner_click_combine`, `image_combiner_prompt_typed`
  - `ai_attractiveness_test_click_upload`, `ai_attractiveness_test_upload_success`
- `eventCategory` / `eventAction` / `eventLabel` тут **NULL**.
- Имена событий у каждого виджета СВОИ. **Никогда не угадывать** — сначала вытащить палитру (см. sql-templates.md → palette query).

### Продуктовые страницы (`/web/...`)
- `event_name = 'overchat'`
- Семантика — в `event_params`: `eventCategory` / `eventAction` / `eventLabel`.
- Примеры: `chat/pop-up/get stars view`, `chat/pop-up/get stars click`, `chat/pop-up/get feature view`, `chat/request/web-application`, `login/registration/email`, `purchase/<payment>/<plan>`.

### Дубли каждого overchat-события (дедуп обязателен)
Каждое продуктовое событие логируется в BigQuery **трижды**:
1. `event_name='overchat'` с заполненными cat/act/label — **это берём**.
2. `event_name='user_id_pushed'` — дубль, **отбрасывать** (`AND event_name != 'user_id_pushed'`).
3. Слитое имя, напр. `chat_pop-up_get feature view` (cat/act/label = NULL) — дубль, **отбрасывать при обработке** (в Python по паттерну, см. ниже).

> 🔴 **ГЛАВНОЕ ИСКЛЮЧЕНИЕ — ПОКУПКИ.** Тройное логирование верно для **Apple Pay** и большинства событий. Но **карточные покупки НЕ имеют overchat-канон-строки** — они живут ТОЛЬКО в плоской схеме (`purchase_onetime`/`purchase_universal`). Поэтому для покупок правило «оставь overchat, плоские дропай» теряет весь карточный поток (~30% onetime). Подробно — в секции «Покупки и пейволлы» ниже.

## ⚠️ Ловушка NULL в фильтрах (роняет половину событий молча!)

В BigQuery `NULL = 'что-то'` → `NULL`, а `NOT NULL` → `NULL`, и строка с `NULL` в `WHERE` **молча выпадает**.

Поэтому фильтр вида:
```sql
AND NOT (eventAction = 'create new chat')   -- ❌ ОПАСНО
```
выкинет ВСЕ строки где `eventAction IS NULL` — а это все `page_view`, `session_start` и ВСЕ лендинг-события. Воронка развалится без ошибки.

**Правило:** не фильтровать по `eventAction`/`eventCategory` в `WHERE` через `NOT(...)` или `!=`, если эти поля бывают NULL. Чистить шум (UUID-чаты, дубли) **в Python при обработке**, а не в SQL. Единственное безопасное SQL-исключение — `event_name != 'user_id_pushed'` (event_name не бывает NULL).

## Дедуп и шум — чистить в Python (не в SQL)

При обработке выгруженного JSON отбрасывать:
- **UUID-чаты**: `eventLabel` соответствует UUID (`^[0-9a-f]{8}-[0-9a-f]{4}-...`) — это `create new chat` с id чата, сотни уникальных = шум. Можно схлопнуть в одну строку «create new chat (uuid)».
- **Слитые дубли**: `event_name` содержит структуру вида `chat_pop-up_*`, `login_registration_*`, `*_timer-armed`, `*_impression*`, `*_tab_switch*`, `__` и т.п. ПРИ `cat/act/label = NULL` — это дубль overchat-события.
- **Дедуп по юзерам**: при сведении одного логического события брать `MAX(users)` (а не сумму), т.к. event пишется в нескольких формах.

## Связь лендинг ↔ продукт (URL разные!)

Имя виджета в `/image/...` НЕ совпадает с именем в `/web/...`. Карта известных:

| Виджет | Лендинг | Продукт (`/web/...`) |
|---|---|---|
| rate-my-face | `/image/rate-my-face` | `/web/ai-rate-my-face` |
| looksmax | `/image/looksmaxing-ai` | `/web/looksmax` |
| image-combiner | `/image/ai-image-combiner` | `/web/ai-image-combiner` **и** `/web/image-generator/combine-images` |
| baby-face | `/image/baby-face-generator` | `/web/image-generator/baby-generator` |
| aspect-ratio | `/image/aspect-ratio-changer` | `/web/aspect-ratio` (или `/web/image-generator/...`) |
| attractiveness-test | `/image/ai-attractiveness-test` | продукт-страница НЕ содержит «attractiveness» — юзер уходит в общий `/web/c/<id>` или `/web/ai-rate-my-face` |

**Как находить продукт-URL когда он неизвестен:** брать широкий токен (общая подстрока названия) в `LIKE '%токен%'` на `page_location`, классифицировать surface по `/image/` vs `/web/`, и смотреть блок `3_other`. Если продуктовые события не находятся под токеном виджета (как у attractiveness) — продукт-страница называется иначе; найти её отдельным запросом «куда уходят» (LEAD по page_location).

**Толстый vs тонкий лендинг:**
- «Толстый» (rate-my-face, looksmax, image-combiner, attractiveness) — загрузка/генерация ПРЯМО на лендосе, свои события.
- «Тонкий» (baby, aspect) — лендинг это просто витрина + кнопка `click_openwebapp`; вся работа и генерация в продукте.

## Покупки и пейволлы

### ⚠️⚠️ Покупки логируются в ДВУХ НЕСИММЕТРИЧНЫХ схемах — главный источник недосчёта денег

Где лежит покупка, зависит от способа оплаты:

- **Apple Pay** — покупка пишется ТРИЖДЫ (как обычные overchat-события):
  1. `event_name='overchat'`, `eventCategory='purchase'`, `eventAction='apple'`, `eventLabel=<план>` — **каноническая, её берём**.
  2. `event_name='user_id_pushed'` (тот же cat/act/label) — дубль, отбросить.
  3. `event_name='purchase_apple_<план>'` (плоское, cat/act/label = NULL) — дубль.
  → У Apple ЕСТЬ канон-строка, дедуп «оставь overchat» работает.
- **🟢 Google Pay** (новая фича, запущена в пятницу **24.07.2026**) — ТРЕТИЙ wallet-метод, пишет как Apple:
  1. канон `event_name='overchat'`, `eventCategory='purchase'`, `eventAction='google'`, `eventLabel=<план>` — берём.
  2. плоское `purchase_google_<план>` (`purchase_google_package-onetime`, `purchase_google_pro_weekly`, …) — дубль.
  → До 24.07 метода в GA НЕ было (весь не-Apple шёл картой-redirect). Также с 24.07 появился embedded-чекаут картой: плоское `purchase_stripe_embedded_<план>` + канон `eventAction='stripe_embedded'`.
- **Карта / universal** — покупка пишется ТОЛЬКО плоскими событиями, **канон-строки НЕТ**:
  - `purchase_onetime` (все методы, план без метода), `purchase_universal` (метод без плана), `purchase` (generic) — все `cat/act/label = NULL`.
  - ⚠️ Обычной карты-redirect в `overchat`/`eventCategory='purchase'` НЕТ — там только wallet/embedded: `apple`, а с 24.07 ещё `google` и `stripe_embedded`. (Старое «единственный eventAction — apple» верно ТОЛЬКО до 24.07.) Обычная карта видна лишь в плоских `purchase_onetime`/`purchase_universal`.

**🔴 Грабли:** правило «оставляй `event_name='overchat'`, плоские дропай» **ВЫКИДЫВАЕТ ВЕСЬ карточный поток**. По onetime это **~30%** (карта ≈ треть покупок, ~$800/нед по rate-my-face-эпохе). НИКОГДА не считать покупки только по `event_name='overchat'` — это только Apple-срез.

**✅ Как считать правильно (все методы):**
- onetime всего = `event_name='purchase_onetime'`
- apple onetime = `event_name='purchase_apple_package-onetime'`
- google onetime = `event_name='purchase_google_package-onetime'`
- **карта onetime = всего − apple − google** (своего `purchase_universal_<план>` НЕТ)
- ⚠️ `purchase_universal` **многократно фаерится** (~3+ события на юзера) — НЕ считать через `COUNT(*)`, только `COUNT(DISTINCT user_pseudo_id)` или плановое `purchase_onetime`.
- `purchase_onetime` слегка перефаеривает (~+4% к Stripe) → money-truth сверять со Stripe.
- **Подписки по планам для КАРТЫ в GA4 чисто не вытащить** (карта-subs сидят в generic `purchase_universal` без плана) → доход и подписки по планам считать по **Stripe** (см. pricing-revenue.md). NB: `subscription_started` НЕСЁТ `value` (цену) в event_params → план новой подписки инферится по цене для ВСЕХ методов: 5.99=weekly, 14.99=monthly, 49.99=yearly, 2.99=скидочный weekly, 59.99=НЕОПОЗНАННЫЙ план (растёт с середины июля, вопрос к коду).
- **🔴 `subscription_started` ДВАЖДЫФАЕРИТСЯ с 24.07.2026** (новый чекаут Google Pay + `stripe_embedded`): ~1.5–2× событий на юзера (24–26.07: 178 событий на 112 юзеров, из них 39 задвоили — один и тот же план дважды = ОДНА подписка). Подписки считать ТОЛЬКО `COUNT(DISTINCT user_pseudo_id)`, НИКОГДА `COUNT(*)` — иначе +50% фантомных. Дашборд (Code.gs) считает distinct → НЕ затронут.
- **Сколько человек каким методом заплатило** (эксклюзивно, 1 юзер = 1 метод): классифицировать per-user по приоритету — `google`(canon google / `purchase_google_*`) · `apple`(canon apple / `purchase_apple_*`) · `stripe_embedded`(`purchase_stripe_embedded_*`) · иначе если есть `purchase_onetime`/`subscription_started`/`purchase_credits` → **карта-redirect** (заплатил без wallet/embedded-метки). Пример 24–26.07: Apple 434 (68%), stripe_embedded 88 (14%), Google Pay 63 (10%), карта-redirect 45 (7%).

- **Способ оплаты** (`eventAction` в purchase-каноне): `apple` = Apple Pay, `google` = Google Pay (с 24.07), `stripe_embedded` = embedded-карта (с 24.07), `universal`/`stripe`/None = карта-redirect.
  - ⚠️ У rate-my-face «100% apple» — это **артефакт фильтра по apple-схеме**, а НЕ правда: карта есть, просто в плоской схеме. Не выдавать «100% Apple Pay» за факт, не проверив `purchase_onetime`/Stripe.
- **widget-атрибуция onetime:** `widget_id` в Stripe и `page_location` в GA4. В Stripe `widget_id` заполнен только у **tagged/apple** и только **с ~17.07.2026** (до этого пусто). Для кросс-виджетного анализа по ВСЕМ методам — брать виджет из `page_location` события `purchase_onetime` (GA4), не из Stripe.
- **Пейволлы** (`eventCategory='chat'`, `eventAction='pop-up'`):
  - `get stars view` / `get stars click` — пейволл «звёзды» (валюта)
  - `get feature view` / `get feature click` — пейволл «фича»
  - `credits paywall view` — пейволл кредитов (видео-генерация). ⚠️ Замечен возможный зацикленный показ (33 показа одному юзеру) — флагать аномалии «много показов на 1 юзера».
- **Регистрация**: `eventCategory='login'`, `eventAction='registration'` (label = `email`/`google`/`apple`). Вход — `eventAction='authorization'`.
- **Генерация в продукте**: `chat/request/web-application`.
- **Загрузка в продукте**: `event_name='upload-attempt'`, `eventCategory='chat'`, `eventAction='upload_attempt'`.

## Пост-онбординг модалка

После генерации/онбординга часть виджетов показывает кросс-промо модалку (увести в другой виджет). События вида:
- `<widget>-post-onboarding` (event_name, слитое) ИЛИ `eventCategory='<widget>-post-onboarding'`
- действия: `timer-armed` (модалка взведена), `impression` (показана), `cta-<target>` (клик на промо целевого виджета), `view-<target>` (показ промо-карточки)
- Имена варьируются по виджетам — **вытаскивать всё, что содержит `post-onboarding`**, и строить под-воронку (см. SKILL.md → пост-онбординг).

## Кросс-фановые джойны

Связывать лендинг ↔ продукт по `user_pseudo_id` + порядок по `event_timestamp` (микросекунды). Для атрибуции покупки к виджету — last-click среди визитов лендосов до момента покупки.


## Роутинг покупок (из кода фронта, проверено сверкой)

`package-onetime` → `purchase_onetime` · другие `package-*` (creator/studio/mega) → `purchase_credits` · подписки → `subscription_started`. Зонтичное `purchase` = 1 на любую транзакцию (тождество: purchase ≈ onetime+subs+credits, расхождение <1%). Карточные флоу шлют ТОЛЬКО dataLayer → зависят от GTM-тега; Apple/Google Pay дублируют в sendGAEvent (canon `purchase/<apple|google>/<план>`). `purchase/None/<план>` = карт-флоу без eventAction. `begin_checkout`/`unique_purchase` в BigQuery НЕ приходят (dataLayer-only).

## Обязательные фильтры каждого запроса (обновлено)

1. Тест-юзеры: список user_id (см. assets) + `NOT EXISTS(... key='test_user')` — параметр запущен 21.07.2026, есть ТОЛЬКО на overchat-событиях, на покупках его НЕТ.
2. Хосты: `IFNULL(device.web_info.hostname,'') NOT IN ('stage.overchat.ai','widget.overchat.ai')` — стейдж и мёртвые текст-виджеты на лендосах.
3. Heartbeat: исключать `event_name='overchat'` с ПУСТЫМИ cat/act/label (399k/мес!) — это `GA_sendPushUserIdEvent`, пинг смены роута залогиненного юзера, НЕ действие. Плоский дубль `__`.

## Ловушки истории и неймингов

- `get stars view/click` = ЛЕГАСИ-имя рег-попапа до ~середины июня 2026 (rename в `sign up view/click`). В исторических данных — рег-попап, НЕ пейволл.
- Рег-попап `sign up view` НЕДОЛОГИРОВАЛ 09–16.07.2026 (~треть) — в воронках регу цеплять к продукту, НЕ к попапу; `login/registration` стабилен всю историю.
- Дубли неймингов без канона: матчить оба — `IN ('sidebar','side-bar')`, `IN ('mymedia','my_media')`.
- Генерации на лендингах (`chat/request/landing` и виджет-события) НЕ считать никогда — трекинг ненадёжен; на лендосах только визиты + конверсия в продукт.
