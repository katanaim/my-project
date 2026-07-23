# Таксономия событий Overchat (глоссарий, сверен с кодом фронта и Лизой 22-23.07.2026)

Окно данных: 21.06–20.07.2026, prod-only, тест-юзеры исключены. Маркеры: ✅ проверено ранее, ❓ моя гипотеза, ‼️ нужен твой ответ.
Правь прямо по тексту / голосом в чате — потом вошью финал в скилл, и это станет единственным источником правды.

## Правила чтения (из скилла, проверены)
- Двойная схема: продукт `/web/` → `event_name='overchat'` + семантика в cat/act/label; лендинги → семантика в самом `event_name`.
- Каждое overchat-событие дублируется: `user_id_pushed` (дубль) и слитое плоское `cat_act_label` (дубль). НО покупки картой живут ТОЛЬКО в плоских (`purchase_onetime` и др.).
- ⚠️ С 09.07 сломан трекинг `sign up view` (недологирует ~треть) — не чинился полностью на 20.07.
- ⚠️ **`test_user: true` НЕ долетает до BigQuery** (проверено: 0 из 14.8M событий несут этот параметр — GTM/тег его не прокидывает). Фильтровать тестовый трафик в BQ можно ТОЛЬКО по списку user_id. Нужен фикс тега, чтобы параметр поехал в GA4.
- ✅ **Стейдж режем по hostname**: `device.web_info.hostname != 'stage.overchat.ai'` (7 804 события, 76 юзеров за месяц) — надёжнее, чем page_location. Отдельный вопрос — `widget.overchat.ai` (77k событий, 5 444 юзера): что это и включать ли.
- ⚠️ dataLayer-события `registration`, `login`, `begin_checkout`, `unique_purchase` В BigQuery НЕ ПРИХОДЯТ (GTM их не мапит в GA4). first-payer-сигнал `unique_purchase` в BQ недоступен.

## 1. Продуктовая схема (`event_name='overchat'`) — категории по убыванию объёма

| Категория | Событий | Действия | Моя гипотеза | Статус |
|---|---|---|---|---|
| `chat` | 669,803 | branch-in-new-chat, create new chat, generation, message-feedback-submitted, message-rated, pop-up, request, updating_memory | Ядро продукта: чат/генерации. `request/web-application` = запуск генерации в продукте (✅ проверено), `request/landing` = запуск генерации С ЛЕНДИНГА (❓ гипотеза — толстые лендосы). `pop-up/*` = все системные попапы: `sign up view/click` = рег-попап (⚠️ трекинг view сломан с 09.07!), `get feature view/click` = основной пейволл, `credits paywall view/click` = пейволл кредитов видео, ‼️ `get stars view/click` = ЛЕГАСИ-имя рег-попапа до ~июня 2026 (rename в sign up) — НЕ пейволл, `last chance *` = last-chance оффер с 17.07. `create new chat/<uuid>` = создание чата. `generation/with_character` = генерация с персонажем. `message-rated`/`message-feedback-submitted` = оценка ответа (up/down). `branch-in-new-chat` = ответвление диалога в новый чат с моделью X. | ✅ частично |
| `looksmax` | 556,499 | after-photo-result, age-commit, answer-toggle, auth-wall-show, click, compare-drag, credit-wall-show, error-action-click… | Продуктовый флоу looksmax: квиз (`funnel-step-view/*` шаги gender/age/…), загрузка фото (`photo-upload/front|side`), auth-wall, результат, апселлы. 168 комбинаций — самый жирный виджет в продукте. | ❓ по паттерну |
| `None` | 398,933 | None | 398 933 события у 125k юзеров с ПУСТЫМИ cat/act/label. Гипотеза: технический пинг/инициализация страницы (пара к плоскому `__`, см. ниже). НЕ имеет аналитической ценности, ИСКЛЮЧАТЬ из любых подсчётов. | ‼️ ВОПРОС |
| `login` | 133,666 | authorization, registration | `registration/<google|apple|email>` = завершённая регистрация (✅ канон реги). `authorization/<...>` = вход существующего юзера. НЕ путать. | ✅ |
| `catalog` | 105,629 | attachment, impression, send | Каталог ботов/виджетов: `impression/catalog-hero-impression` = показ hero-блока, `attachment` = прикрепление файла в hero, `send` = отправка сообщения из hero. | ❓ |
| `kissing_generator` | 71,556 | aspect-select, click, duration-select, generation-complete, photo-mode-select, prompt-select, prompt-typed, turn-off… | Продуктовый флоу kissing generator: выбор аспекта/длительности/фото-мода, загрузки person1/person2, generation-complete. | ❓ по паттерну |
| `auto-persona` | 27,013 | submodel-route | `submodel-route/<text|image|video|pdf>` = авто-роутер решил, какой тип подмодели обрабатывает запрос юзера. ‼️ ВАЖНО: это кандидат на определение «пользуется текстовыми персонами» (text = 4 760 юзеров) — тот самый вопрос, где я тупил. | ‼️ ВОПРОС |
| `catalog-redesign-survey` | 23,108 | dismiss, eligible-not-shown, impression, score-select, submit | Опрос про редизайн каталога: eligible-not-shown (холдаут), impression, score-select, submit, dismiss. | ❓ |
| `sidebar` | 17,772 | avatar-click, bot-search-icon, catalog, new-chat, streak-click, tokens-click | Клики по сайдбару: new-chat, catalog, tokens-click, streak-click, avatar-click, bot-search-icon. | ❓ |
| `model-selector` | 12,080 | clicked, model-picked | Выбор модели в чате: clicked (открыл селектор), model-picked (label = какая модель). | ❓ |
| `character` | 9,908 | approve, attach, click, pop-up | Фича ПЕРСОНАЖЕЙ (кастомные персонажи в чате): pop-up view/select_character/create_click/generate_click, attach/success, approve/delete, click/edit. Ты говорила «персонажи — другое» — вот они где. | ❓ |
| `mymedia` | 8,673 | make-video, open | Раздел «Мои медиа»: open, make-video. ‼️ ДУБЛЬ с `my_media` (click, filter) —一 раздел, два нейминга. | ‼️ ВОПРОС |
| `daily-activities` | 6,164 | how-it-works, reward-continue, reward-shown, see-all, welcome-click, welcome-view | Стрики/дейлики: welcome-view/click, reward-shown/continue, see-all, how-it-works. | ❓ |
| `main-page` | 5,859 | helper-button-clicked, helper-button-clicked-option | Главная продукта: helper-button-clicked(-option) = кнопка-подсказка. | ❓ |
| `style-analysis` | 3,659 | download_result, generate_attempt, option_pick, upload_file | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `rate-my-face-post-onboarding` | 3,567 | cta-ai-soulmate, cta-browse-catalog, cta-looksmax, cta-looksmax-hero, cta-style-analysis-color, cta-style-analysis-hairstyle, cta-style-analysis-makeup, cta-style-analysis-style… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `app_download` | 3,027 | button_click, store_select | Кнопки скачивания моб. приложения: button_click, store_select. | ❓ |
| `side-bar` | 2,975 | tool-item | `tool-item` = клик по инструменту в сайдбаре. ‼️ ДУБЛЬ ИМЕНОВАНИЯ с `sidebar` — две категории для одного места? | ‼️ ВОПРОС |
| `retention` | 2,918 | cancelled, closed, error, offer-accept, offer-decline, offer-view, reason-select, survey-view | Флоу отмены подписки: survey-view → reason-select/<причина> → offer-view/<tokens|discount|pause> → offer-accept|offer-decline → cancelled/<причина>. Кладезь для анализа оттока. `error/cancel` = ошибка при отмене (29 шт, 07-10..17!). | ❓ по паттерну |
| `image-combiner-post-gen-onboarding` | 2,475 | cta-aspect-ratio-changer, cta-browse-catalog, cta-face-swap-video, cta-kissing-generator, cta-make-video, cta-rate-my-face, dismiss-close, generate-again-click… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `purchase` | 2,393 | None, apple | `apple/<план>` = канон Apple-покупки (✅). `None/<план>` = 9 событий-огрызков без метода — мусор или недологированная карта? Карточных покупок тут НЕТ (они только в плоских). | ✅ + ❓ по None |
| `kissing-generator-post-gen-onboarding` | 2,283 | cta-ai-soulmate, cta-baby-face, cta-browse-catalog, cta-face-swap-video, cta-image-combiner, dismiss-close, generate-again-click, hover-ai-soulmate… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `baby-face-generator-post-gen-onboarding` | 2,224 | cta-ai-soulmate, cta-browse-catalog, cta-kissing-generator, cta-make-video, dismiss-close, generate-again-click, hover-add-person-to-photo, hover-ai-soulmate… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `hug_generator` | 2,028 | aspect-select, click, duration-select, generation-complete, media-pick, photo-mode-select, prompt-typed, turn-off… | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `face-shape-detector` | 1,924 | download_result, generate_attempt, try_hairstyles, upload_file | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `explore_character` | 1,718 | click, favorite, tab_switch | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `pwa` | 1,265 | opened | opened = запуск как PWA. | ❓ |
| `add-person-to-photo-post-gen-onboarding` | 1,158 | cta-aspect-ratio-changer, cta-image-combiner, cta-make-video, dismiss-close, generate-again-click, hover-aspect-ratio-changer, hover-image-combiner, hover-kissing-generator… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `palm_reading` | 1,016 | click, hand-select, turn-off, turn-on, upload | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `ai-selfie-generator` | 1,002 | autostart, download, generate, generation_fail, generation_start, generation_success, paywall, suggestion… | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `gta_trend` | 970 | aspect-select, auto-start, click, generation, pop-up, style-select, upload, view | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `my_media` | 944 | click, filter | см. mymedia — дубль именования. | ‼️ |
| `soulmate` | 827 | birth-date-set, click, gender-select, notes-typed, style-select, upload, vibe-select | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `tarot` | 740 | card-pick, click, example-click, generate, result-action | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `attach_character` | 612 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `sims_2_trend` | 563 | aspect-select, auto-start, click, generation, pop-up, purchase, upload, view | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `looksmax-post-onboarding` | 491 | cta-ai-soulmate, cta-browse-catalog, cta-rate-my-face, cta-style-analysis-hairstyle, cta-style-analysis-makeup, cta-style-analysis-style, dismiss-close, generate-again-click… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `explore_character_detail` | 414 | click, favorite | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `welcome_deal` | 325 | auth-click, continue-click, dismiss, expire, paywall-view, plan-select | Welcome-оффер с 17.07 (✅ наш анализ): paywall-view, plan-select, continue-click, auth-click, dismiss/<где>, expire. | ✅ |
| `nano-banana-2-onboarding` | 266 | preset-clicked | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `attractiveness-test-post-gen-onboarding` | 196 | cta-ai-soulmate, cta-browse-catalog, cta-looksmax, cta-looksmax-hero, cta-style-analysis-makeup, cta-style-analysis-style, dismiss-close, hover-ai-soulmate… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `handwriting_check` | 190 | click, upload | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `ai-hair-color-changer` | 186 | generate, generation_start, generation_success, paywall, photo_uploaded, view | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `memory` | 151 | clear, click, turn-off, turn-on | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `palm-reading-post-gen-onboarding` | 136 | cta-handwriting-check, cta-style-analysis-hairstyle, generate-again-click, impression, scrolled-100, scrolled-50, timer-armed, view-handwriting-check… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `family-photo-post-gen-onboarding` | 129 | cta-image-combiner, cta-make-video, dismiss-close, generate-again-click, hover-add-person-to-photo, hover-image-combiner, hover-kissing-generator, hover-make-video… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `nano-banana-pro-onboarding` | 110 | preset-clicked | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `dance-generator-post-gen-onboarding` | 105 | cta-face-swap-video, generate-again-click, hover-face-swap-video, hover-kissing-generator, hover-stadium-trend, impression, scrolled-100, scrolled-50… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `ai-girl-generator` | 91 | generate, generation_start, generation_success, paywall, suggestion, view | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `image-combiner-result` | 90 | click, make-video-click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `style-analysis-post-gen-onboarding` | 77 | cta-ai-hair-color-changer, cta-rate-my-face, hover-attractiveness-test, hover-face-shape-detector, hover-rate-my-face, impression, timer-armed, view-ai-hair-color-changer… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `sora2-onboarding` | 66 | preset-clicked | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `writer` | 54 | click, param-change, result-action, title-filled, tooltip-shown | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `email_generator` | 52 | click, param-change, recipient-filled, result-action | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `edit_character` | 51 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `twerk-generator-post-gen-onboarding` | 46 | dismiss-close, generate-again-click, hover-kissing-generator, impression, scrolled-100, scrolled-50, timer-armed, view-face-swap-video… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `aspect-ratio-changer-post-gen-onboarding` | 46 | cta-make-video, dismiss-close, hover-looksmax, hover-make-video, impression, make-video-click, timer-armed, view-image-combiner… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `paraphraser` | 39 | click, param-change, result-action, tooltip-shown | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `rate_my_face` | 35 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `baby_face_generator` | 32 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `face-shape-detector-post-gen-onboarding` | 31 | cta-style-analysis-hairstyle, hover-rate-my-face, hover-style-analysis-hairstyle, hover-style-analysis-makeup, impression, timer-armed, view-rate-my-face, view-style-analysis-color… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `face-swap-video-post-gen-onboarding` | 30 | cta-image-combiner, dismiss-close, hover-image-combiner, hover-kissing-generator, hover-stadium-trend, impression, timer-armed, view-image-combiner… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `gta-trend-post-gen-onboarding` | 28 | hover-face-swap-video, hover-kissing-generator, hover-sims-2-trend, impression, scrolled-50, timer-armed, view-face-swap-video, view-kissing-generator… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `change-text-in-image` | 26 | generate, generation_start, generation_success, paywall, photo_uploaded, view | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `handwriting-check-post-gen-onboarding` | 18 | impression, scrolled-100, scrolled-50, timer-armed, view-palm-reading, view-rate-my-face, view-style-analysis-color, view-style-analysis-makeup… | Кросс-промо модалка после генерации (✅ в скилле): timer-armed → impression → view-<виджет> (показ карточки) → hover-<виджет> → cta-<виджет> (клик) → dismiss-close / generate-again-click / scrolled-50|100. | ✅ |
| `add_person_to_photo` | 15 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `video` | 15 | new-video-button | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `sora-generation` | 11 | generation-start | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `paragraph_generator` | 7 | click, param-change, result-action, tooltip-shown | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `home` | 7 | ai-tool-click, discover-more-click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `hot-button` | 7 | clicked | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `style_analysis` | 4 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `pasted-content-ai` | 3 | generate | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `preset_category_widget` | 2 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `dance_generator` | 1 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `family_photo_generator` | 1 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |
| `video_extender` | 1 | click | Продуктовый UI виджета (по общему словарю: click/generate/upload/*-select/generation_start|success|fail/paywall/view/download). | ❓ |

## 2. Плоские события

### 2.1 GA4-стандартные (✅ автособытия Google)
`page_view, session_start, first_visit, user_engagement, scroll, click, file_download, form_start, form_submit, view_search_results` — поведение страницы, не продуктовые.

### 2.2 Служебные дубли (ИСКЛЮЧАТЬ ВСЕГДА)
- `user_id_pushed` — 6.4M, дубль всех overchat-событий.
- Слитые `cat_act_label` (719 имён, 1.75M) — дубли overchat-строк. Правило: если имя = категория_действие_лейбл и есть overchat-канон → дубль.
- `__` — 431 519 событий: слитый дубль пустого события `None/None/∅` (см. ‼️ вопрос №1).

### 2.3 Покупки/подписки — ЖЕЛЕЗОБЕТОННАЯ СХЕМА (сверено с кодом фронта)

**Роутинг (одинаков во всех флоу):** `package-onetime` → `purchase_onetime` · другие `package-*` (creator/studio/…) → `purchase_credits` (докупка кредитов, только у подписчиков) · всё остальное (pro_weekly/monthly/yearly) → `subscription_started`. Плюс на КАЖДУЮ покупку летит зонтичное `purchase`.

**Проверка тождества на данных 21.06–20.07 (чисто, без тестов/стейджа):**
`purchase` 3 512 событий ≈ `purchase_onetime` 2 826 + `subscription_started` 611 + `purchase_credits` 83 = 3 520 (расхождение 8 = 0.2% ✅)

| Событие | Событий | Юзеров | Что это |
|---|---|---|---|
| `purchase` | 3 512 | 2 836 | зонтик: любая покупка (1 на транзакцию) |
| `purchase_onetime` | 2 826 | 2 423 | СТРОГО package-onetime $2.99, все методы — канон одноразок |
| `subscription_started` | 611 | 595 | новая подписка, все методы — канон подписок |
| `purchase_credits` | 83 | 65 | докупка кредитов (package-creator $9.99 / package-studio $24.99 / …), только подписчики |
| `purchase_universal` | — | — | карта, мульти-фаерится ~3× — только DISTINCT юзеры |
| `purchase_apple_*` / `purchase_google_*` | — | — | плоские дубли wallet-флоу |

**Wallet-флоу (Apple/Google Pay):** confirmCardPayment на клиенте → ecommerce-события + канон `purchase/<apple|google>/<план>` в overchat-схеме. **Карта (redirect):** только dataLayer-события, канona overchat почти нет — `purchase/None/<план>` (9 шт) это карт-флоу, где eventAction не передан.

**РЕНЬЮАЛЫ (продления) В GA ОТСУТСТВУЮТ ВООБЩЕ** — только Stripe (`Description='Subscription update'`). Любой подсчёт «подписочных денег» по GA = только новые подписки.

**Сверка со Stripe:** GA-числа выше — цель сверки. Stripe-истина: одноразка = Description `''` + $2.99; кредиты = Description по докупкам; новая подписка = `Subscription creation`; реньюал = `Subscription update` (в GA нет).

### 2.4 Лендинг-события виджетов (семантика в имени)
Словарь действий: `click_upload → upload / upload_success → click_generate → click_openwebapp / view_paywall / click_close_paywall …`
Крупнейшие семейства: `ai_face_rater_*` (rate-my-face, 322k), `image_combiner_*` (63k), `kissing_generator_*` (26k), `ai_baby_*`, `ai_passport_*`, `ai_attractiveness_*`, `ai_dance_*`, … всего ~179 префиксов.

### 2.5 Отдельные плоские (не дубли)
| Событие | Событий | Юзеров | Гипотеза | Статус |
|---|---|---|---|---|
| `upload-attempt` | 99 044 | 33 090 | попытка загрузки файла В ПРОДУКТЕ (`chat/upload_attempt`) | ✅ |
| `click_openwebapp` | 20 763 | 15 892 | CTA «открыть приложение» на тонких лендингах | ✅ |
| `chat_widget_*` (32 имени) | 21 849 | — | ‼️ встроенный чат-виджет на лендингах? (вопрос №5) | ‼️ |
| `sticky_promo_*` (4 имени) | 11 339 | — | sticky-баннер с 17.07 (наш релиз) | ✅ |
| `code_detector_scan` | 3 831 | — | ‼️ что это? (вопрос №6) | ‼️ |

## ‼️ Вопросы, без которых глоссарий не финален

1. **`None/None/∅` + `__`** (399k событий, 125k юзеров): что за пустое overchat-событие? Технический пинг при загрузке? Можно смело исключать всегда?
2. **`chat/request/landing`** (7 444 события, 1 829 юзеров): это генерация, запущенная на лендинге? Тогда полная формула «генераций всего» = web-application + landing?
3. **`auto-persona/submodel-route/text`**: годится как определение «юзер пользуется текстовой персоной»? Или текстовые персоны — это `character`-события с текстовыми моделями? (мой старый вопрос про долю подписчиков)
4. ~~`purchase_credits`~~ ✅ ПОДТВЕРЖДЕНО кодом: докупка кредитов = любые `package-*` кроме onetime (creator/studio/…), только у подписчиков.
5. **`chat_widget_*`**: чат-виджет, встроенный на лендинги? Считать его генерации в «генерации всего»?
6. **`code_detector_scan`**: виджет-детектор кода? Не вижу его лендинга в /image|text/.
7. **`sidebar` vs `side-bar`, `mymedia` vs `my_media`**: два нейминга одних сущностей — какой канон, старый нейминг умер?
8. ~~`purchase/None/<план>`~~ ✅ РЕШЕНО: карт-флоу, где `GA_sendPaymentSuccessfulEvent` вызван без eventAction (референс, category purchase).
9. ~~`get stars view`~~ ✅ РЕШЕНО: это легаси-имя РЕГ-ПОПАПА (до ~июня), из определения пейволла убран, в истории считается рег-попапом. Дашборд-код поправлен.
10. **`retention/error/cancel`** (29 шт, 07-10..07-17): юзеры ловили ошибку при ОТМЕНЕ подписки — знаешь про это? Похоже на баг, деньги-риск (форсированный чарджбек).

## Ответы из кода (23.07.2026, проверено моделькой по исходникам)

1. **Пустые cat/act/label + `__`** = `GA_sendPushUserIdEvent` (GAPageTracker): пинг на каждую смену роута залогиненного юзера. Исключать из всего.
2. **$4.99/$8.99 Subscription update** = скидочные продления подписок (цен 4.99/8.99 нет в конфиге пакетов). Серверный авто-топ-ап кредитов в коде НЕ подключён (мёртвый код).
3. **185 vs 83 по кредитам**: карточные флоу шлют только dataLayer (нужен GTM-тег), wallet дублируют в sendGAEvent → выживают. Проверить GTM-тег на `purchase`/`purchase_credits`; надёжный фикс — серверный GA4 Measurement Protocol с вебхука Stripe.
4. **test_user**: на `overchat`-событиях — в event_params (в BQ будет); на dataLayer-покупках — только в dataLayer-объекте (в BQ НЕ будет никогда без фикса).
5. **registration/login** dataLayer — избыточные дубли (канон `login/registration` уже в BQ). **begin_checkout/unique_purchase** — dataLayer-only, в BQ невидимы; unique_purchase стоит смапить в GTM (первый платёж юзера, из purchase не восстановить).
6. **sidebar/side-bar, mymedia/my_media**: канона нет (старый файл vs новый), матчить оба.
7. **retention/error/cancel НЕ починен**: (а) ложные ошибки — отмена в Stripe прошла, упал пост-рефреш, юзер думает что НЕ отменил → риск чарджбека; (б) реальные 500 на Apple-Pay-origin подписках («Subscription not found»). Бэк не менялся с 22.06.


## Дополнения 23.07.2026 (сверено по Stripe-данным)

- **$4.99 update = легаси-цена weekly** (доказано: 0 creations, когорта тает ~3%/нед). $8.99 — вероятно легаси-monthly (❓). $34.99 creation = скидочный годовой оффер. $59.99 creation — не опознан (❓).
- **`sign up view` — доказан сломанный трекинг** (не изменение продукта): клики по попапу стабильны ~4k/день весь период, показы упали → клик/показ 63% → 94–97% (невозможно физически). После 17.07 недосчёт остаётся ~15–20% (клик/показ 84–89% против нормы ~63%). Канарейка: клик/показ >75% = трекинг показов течёт.
- `chat/request/web-application` — attempt или успешная генерация: НЕ ЯСНО, вопрос к коду (Лиза тоже не знает).
- `catalog` hero — семантика не подтверждена, вопрос к коду.

## Дополнения 23.07 (вечер)

- **Флуд 06–08.06 подтверждён Лизой как большой баг аналитики** — вырезка правильна, оставляем.
- **Триала не существует** — «конверсия в триал» = конверсия в подписку (подтверждено Лизой).
- **322 нулевых инвойса в Stripe** — так и не классифицированы (не триал!). Открытый вопрос.
- **Инсайты полугодовой истории**: одноразки запущены ~апрель (до этого только подписки ~20-30/день); Прод→Рега медленно затухает 78%→56% с января; апрель 2–6 — деградация трекинга юзеров (~3×), чинить нечего, данным не верить.
- **Методология когорт**: короткие окна пересчёта загрязняются возвращенцами (фейково-новые когорты топят конверсию в регу) — обязателен ЛУКБЭК ~14 дней перед сохраняемым диапазоном. Это был ВТОРОЙ слой «провала реги 09–16.07» (первый — попап-трекинг); с лукбэком провала нет вообще (Прод→Рега ровно 55–57%).
- **Ревью виджетного скрипта (Google Sheets)**: найдены баги — (1) фильтр тест-юзеров no-op (user_pseudo_id сравнивается со списком user_id — разные ID-пространства); (2) стейдж не отрезан (регекс `overchat[.]ai/` матчит и `stage.overchat.ai/` как подстроку); (3) revenue из GA `value` (прайс с VAT, не collected); (4) same-day воронка занижает конверсии, недельные колонки с дневными несравнимы; (5) `/web/image-generator/<sub>` коллапсирует разные виджеты в один слаг.

## Дополнения 24.07 — Stripe-выгрузка с полными колонками

- **Всегда просить unified payments «со всеми колонками»**: там есть `package_code (metadata)` — точный план каждого one-off платежа (решает коллизию $2.99 НАДЁЖНЕЕ Description), `customer_user_id (metadata)` (заполнен ~36% — для чистки тестов дополнять email-фильтром @overchat), `widget_id`, `Customer ID`, UTM, диспут-поля.
- **Платежи на платящего (Stripe, 01.06–22.07, Paid)**: медиана 1 (73% платят один раз), среднее 1.79. Разовые 68% юзеров (медиана 1, ср. 1.11); подписчики 32% (медиана 2, ср. 3.22). Горб на 7 платежах = weekly-подписчики, дожившие всё окно.
- **🐋 КИТЫ на кредит-паках**: топ-кастомер — 105×package-studio = $2 654 за 7 недель; №2 — $820. Пакеты creator/studio покупают ДЕСЯТКАМИ одни и те же люди — сегмент китов существует и держится на кредит-паках.

## Карта виджетов v3 — 23.07 (страница widgets.html, полный анализ лендингов)

- **Причина пропусков в v2**: строгий матчинг сверялся с неполным продукт-листом (только топы переходов). Продукт-лист надо строить из ПОЛНОГО трафика `/web/` — так нашлись ai-style-analysis (1 558 юзеров/28д), ai-tarot-reading (1 300), ai-sims-2-trend, ai-gta-trend, ai-skin-analyzer, ai-hug-generator и др.
- **Пресеты = отдельные виджеты**: `/web/image-generator/<preset>` и `/web/video-generator/<preset>` — самостоятельные виджеты (skin-enhancer 337 юзеров, object-removal 284, hairstyle-changer 136, Faceless-Reels 477…). pslug извлекать 2-сегментным регексом для семейств image-generator|video-generator|ai-video-generator|ai-image-model; невыделенные подпути падают в родителя.
- **Алиасы лендингов (подтверждены переходами юзеров, порог ≥70%)**: color-analysis/makeup-generator/hairstyle-changer → ai-style-analysis (80/92/97%); tarot-card-reader → ai-tarot-reading (98%); photo-to-sims-ai → ai-sims-2-trend (100%); photo-to-gta → ai-gta-trend (96%); skin-enhancer → image-generator/ai-skin-enhancer; object-remover → object-removal; colorize-photo → colorize-image; unblur-image + ai-sharpen-photo → unblur-ai; photo-restoration → old-photo-restoration; action-figure-generator → ai-action-figure; video-upscaler → video-upscaler; photo-editor → edit-images; baby-filter → baby-face-filter-image; faceless-reels → video-generator/Faceless-Reels; meme-generator → ai-image-model (92% в Nano-Banana-2); pranks → image-generator (размазан по прank-пресетам).
- **🐛 Баги роутинга лендингов (отдать девам)**:
  1. `ai-twek-generator` (лендинг, опечатка в слаге) шлёт 76–83% юзеров в generic `ai-video-generator`, а НЕ в виджет твёрка (туда доходит 2%). Сам твёрк живёт на лендинге `ai-twerk-generator`.
  2. `ai-hairstyle-changer` (лендинг) → 97% в ai-style-analysis, не в пресет причёсок.
  3. `ai-hair-color-changer` (лендинг) → 55% в пресет image-generator/hairstyle-changer; отдельная страница `/web/ai-hair-color-changer` почти мертва (4%).
  4. `ai-bikini-generator`, `tiktok-video-generator` → generic video-generator, своих пресетов нет.
  5. `ai-couple-photo-maker` — виджета в продукте НЕТ вообще: трафик размазывается (32% Nano-Banana-2, 22% image-combiner). Либо завести виджет, либо роутить осмысленно.
- **Карта теперь КУРАТОРСКАЯ** (константа WIDGET_DEFS в Code.gs, 53 виджета, вкл. 13 без лендинга — покупают из каталога: hug-generator 7 покупок/52д). Новые лендинги сами всплывают в others на странице → оттуда добавлять в WIDGET_DEFS.

## Деталка looksmax — 23.07 (widget.html?w=looksmax)

- **Перезапуск виджета 03.07.2026**: весь внутренний трекинг (funnel-step-view, photo-upload, report-view, unlock-tap, purchase_onetime с pl looksmax) существует только с этой даты. До неё жила старая версия страницы без квиза.
- **Порядок квиза** (по средней позиции first-view): age → fix → bugs → holdback → mirrors → rate → gap → growth → gender → math → ratio → ascended → scan. Пол выбирается на 9-м шаге, НЕ первым. Шаг gender видят ~70% против ~87–90% соседних — либо шаг показывается не всем, либо на нём аномальный дроп (вопрос к коду).
- **Рега-событие прилетает НЕ со страницы виджета**: `login/registration` с pl looksmax ловит ~10% рег. Правильный подсчёт — юзеры с регой ≤24ч после auth-wall-show этого виджета (77% конверсия стены).
- **🐛 Кросс-промо модалка looksmax-post-onboarding УМЕРЛА в релизе 03.07**: клики cta-* обрываются 02–03.07. После релиза переходы в соседние виджеты остались только из блока в ПЛАТНОМ полном отчёте → охват кросс-промо упал с тысяч (все сгенерившие) до ~200 купивших. Вернуть модалку после тизера = бесплатный трафик в другие виджеты.
- **Кросс-промо не генерит денег**: за 01.06–22.07 ~110 кликнувших по переходам, 0 покупок в течение 14 дней после клика — ни в целевом виджете, ни где-либо.
- **Локи тизера**: cta-bar (59% кликающих) и after-photo-cell (44%) — главные триггеры пейволла; halos-focus 18%, potential-gauge 10%.
- **План глоу-апа юзают ~23–30% купивших** (29 из 127 открывших полный отчёт за 7д) — купленный продукт почти не потребляется, ретеншн-риск.
- **Ошибки скана ~4.5% нажавших генерацию** («No face detected» — топ, 405 событий/163 юзера за 28д) + «could not restore your photos».

## Дополнения 23.07 (ночь) — twek и дыра в скан-шаге looksmax

- **ai-twek-generator = лендинг твёрк-виджета** (решение Лизы: «полноценный отдельный виджет, считать по отдельному»). Лендинг перепривязан к карточке ai-twerk-generator. Факты для девов: своей страницы /web/ai-twek-generator НЕ существует (0 визитов за всю историю); 76–83% юзеров twek-лендинга роутятся в generic /web/ai-video-generator, до /web/ai-twerk-generator доходит 2%. Пока роутинг не починен, конверсия карточки twerk-generator занижена.
- **looksmax: шаг funnel-step-view/scan недофаерится у ~19% юзеров.** Из 12,755 загрузивших фото (03–22.07) у 99.5% есть другие шаги квиза, но у 2,398 НЕТ ни одного step-view/scan за весь период (не эффект дневных уников — проверено ever-джойном). Экран загрузки достижим без фаера шага scan → в воронке «дошёл до скана» меньше «загрузил фото». Отдать девам вместе с недофаером гендер-шага (70% против 87–90% соседних).

## Ответы продукта по looksmax — 23.07 (полный документ: DEV-ANSWERS-looksmax.md)

Вошито в деталку. Ключевое для методологии:
- **Виджет целиком новый со 02.07** (коммит 74ebfd2e) — данные до этой даты относятся к СТАРОМУ чат-виджету с теми же именами ивентов.
- **Квиз: gender ПЕРВЫЙ шаг** (gender → age → fix → bugs → holdback → mirrors → rate → gap → growth → math → ratio → ascended → scan), ветвлений/AB нет. Его «70%» — артефакт: первый ивент страницы теряется на загрузке (sendGAEvent без ретрая) + лендинг-трафик фаерит sex-select, а не step-view. По коду шаг обязателен для 100%.
- **step-view фаерится на каждый показ шага** (back/ремаунт повторяют) — считать только уников.
- **19% «фото без scan-шага»** — легитимно: лендинг-хэндофф (pendingGenerate автозапускает скан мимо квиза) и возврат после OAuth. photo-upload фаерится и на авто-restore фото — раздут.
- **Пейволл = только `get feature view`**; credit-wall-show(subscription) дублирует его на тот же показ, credit-wall-show(packages) — вообще другой попап (credits paywall view). Не суммировать. (Проверка: перекрытие уников было полным — цифра шага не изменилась.)
- **Рега: Google/Apple фаерят registration на URL OAuth-колбэка** (/web/auth/*), email — на странице виджета (те самые ~10%). Методология «≤24ч после стены» подтверждена. Стена слегка недосчитана: auto-start-путь показывает попап без ивента; фаерится только незалогиненным.
- **Покупки по pl=/web/looksmax полны** — чекаут embedded Stripe без редиректов (десктоп-Tauri возвращается на тот же pathname). Флоу различать по параметру method.
- **26% купивших без full-отчёта — структурно**: billing-race теряет ивент; подписчики «со стороны» получают отчёт без покупки на виджете; часть не возвращается. Просить девов: отдельный фаер full при unlocked-рендере.
- **«We could not restore your photo»** — потеря фото на round-trip реги (in-memory→IndexedDB→CDN все умерли; типично мобильный инкогнито). Retry крутит ошибку по кругу, единственный выход — полный reset. UX-баг.
- **«No face detected» retry** — повтор с тем же фото (гарантированный повтор ошибки); нет пути «вернуться к загрузке, сохранив квиз».
- **Кросс-промо**: модалка удалена НАМЕРЕННО 02.07 вместе со старым виджетом; MoreWidgets видят только entitled. Hairstyle/Makeup/Color Analysis — 4 обложки ОДНОГО входа /ai-style-analysis без параметров; Hair Color → /ai-hair-color-changer (отдельный виджет). Вернуть кросс-промо всем — продуктовая задача, не тумблер.
- **Side-фото опционально с 21.07** (коммит c4532316), до этого обязательны оба — перелом на графиках искать с 21.07.
- **test_user: фикс смержен 21.07** (PR #1898, allow-list 13 email), но ⚠️ в BQ-партициях 20–23.07 параметра ВСЁ ЕЩЁ НЕТ (0 событий) — не задеплоен или тег режет; для dataLayer-пути нужен GTM-маппинг. Вернуть девам.
- **sign up view**: причина структурная (ленивый чанк попапа vs Redux isOpen) — недосчёт ~15–20% останется до фронт-фикса.
- **twek**: виджет /web/ai-twerk-generator существует с 17.07 (отдельный, не пресет); лендинг 404-ит на опечатке. Фикс лендинга: localStorage `ai_twerk_generator_funnel_data` + редирект на /web/ai-twerk-generator/.
- **unlock-tap**: 8-й источник current-gauge (в данных ещё не встречался); все анлоки открывают один кастомный пейволл (3 подписки + try-once $2.99).

## Деталка looksmax v3 — 23.07: локи/девайсы/время-до-покупки/каналы

- **Локи тизера продают по-разному**: cta-bar 5.0% в покупку ≤24ч (204 куп/20д — главный продавец), routine-tease 4.5%, after-photo-cell 2.8%; halos-focus (1.8%) и potential-gauge (1.5%) кликаются, но не продают. Двигать в тизере выше cta-bar/routine-tease.
- **Мобайл = десктоп по конверсии** prod→buy (1.62% vs 1.65% за 03–22.07, разница шум). 87% трафика — мобайл.
- **Время до покупки: медиана 4.8 мин, 94% покупают в первые 15 минут первого визита** — покупка одним присестом, возвратов почти нет → дневные конверсии честные, ремаркетинг на «подумавших» бессмыслен.
- **Каналы лендинга (03–22.07)**: органический поиск 17.2k визитов (86%) с конверсией 1.14%; платный (gclid/cpc) 845 визитов, конверсия 3.91% — ×3.4 от органики, разница значима. Классификация: paid = gclid/gbraid/wbraid/fbclid/ttclid или utm_medium cpc/paid/ppc; остальное organic search/direct/social/ai/internal по referrer.
- **Уточнение любимой конверсии**: когорта дня = ПЕРВЫЕ В ЖИЗНИ одноразки на этом виджете. Проверено на 22.07: 12 покупок однораз, когорта 9 — ровно 3 юзера уже покупали одноразку раньше на другом виджете. Повторные и «чужие первые» в когорту не входят by design.

## Деталка ai-rate-my-face — 23.07 (widget.html?w=ai-rate-my-face)

- **Другая воронка, чем looksmax** (нет квиза, нет тизер-локов): лендинг → продукт → загрузка фото (upload-attempt) → рега-стена (sign up view поп-ап) → рега → пейволл (get feature view) → last-chance оффер → покупка → генерация (chat/request/web-application). Генерация ПОСЛЕ покупки — полный рейтинг разблокируется оплатой (по средней позиции события genreq идёт последним).
- **🐛 upload-attempt массово залогировался только с 13.07**: было ~300/нед → стало 6000+/нед. До 13.07 шаг «загрузил фото» сильно занижен (событие не фаерилось или под другим именем). Смотреть upload только с 13.07. Отдать девам вопрос: что изменилось в трекинге загрузки 13.07.
- **Рега-стена = `sign up view` поп-ап** (не auth-wall-show как у looksmax). Конверсия стены→рега 65.9% (ниже looksmax 77%). Стена (sign up view) занижена трекингом на ~15–20% (известный баг), поэтому реальная конверсия ещё выше.
- **Рега-стена показывается БЕЗ загрузки фото**: wall (14.6k) > upload (12.9k) за неделю — поп-ап логина триггерится не только после фото. Воронка на этом шаге немонотонна — это не баг подсчёта.
- **Почти всё — одноразки**: buy_sub ~10/нед против buy_ot ~375/нед. Апгрейд однораз→подписка мизерный (0.3%).
- **Каналы (03–22.07)**: органика 58.4k визитов (84%, огромный SEO-трафик) конверсия 0.59%; платный (gclid/cpc) 4.9k визитов конверсия 4.52% — **×7.7 к органике**, значимо (p<0.001). Даже сильнее разрыва looksmax (×3.4). Органика — главный объём, платный — главная эффективность.
- **Мобайл vs десктоп**: prod→buy 1.92% моб против 0.89% десктоп — десктоп конвертит ХУЖЕ (у looksmax были равны). 88% трафика мобайл.
- **Время до покупки: медиана ~3–4 мин, 95% в первые 15 минут** — тот же паттерн «купил одним присестом», что у looksmax.
- **🐛 Промо-модалка post-onboarding почти мертва и тут**: rate-my-face-post-onboarding impression ~400 юзеров/мес против 22k визитов/день. Кросс-промо в соседние виджеты видят единицы; переходы (looksmax-hero топ) дают ~60 кликов за 7 недель, 0 покупок в целевом. Как и у looksmax — модалку почти не показывают. Вопрос девам: почему post-onboarding показывается такой узкой доле.
- purchase_universal ≈ purchase_onetime на RMF (overlap 786/786) — universal дублирует onetime, не считать дважды.

## 🔴 Апгрейд однораз→подписка почти всегда В ТОТ ЖЕ ДЕНЬ (23.07, поправка методологии)

- **96% апгрейдов из первой одноразки в подписку происходят в первые 24 часа** (весь продукт: 262 same-day из 273; RMF отдельно 70/73 = 96%). «Незрелость свежих когорт» как объяснение низкой конверсии в свежем периоде — НЕВЕРНО: число практически финальное уже назавтра. Падение любимой конверсии в свежем периоде = РЕАЛЬНОЕ падение, не эффект дозревания. Убрал из UI все пометки про «дозреет/дозревают» (были ошибкой).

## 🔴 RMF: «безлимитные одноразки» (14.07) / «3 оффера» (17.07) УБИЛИ апгрейд в подписку

- **Обвал с ~16.07**: RMF однораз→подписка держалась 6–23%/день до 15.07, с 16.07 упала в 0% (0/22, 0/29, 1/65, 0/48, 0/56, 0/76, 0/75). Не незрелость (апгрейд same-day) — реальный обвал.
- **Эффект RMF-специфичный**: у «прочих виджетов» конверсия стабильна 5–16% весь июль, у looksmax шумно но не обнулилась. Значит это не общий продуктовый сдвиг, а именно изменение на RMF.
- **Когорта одноразок RMF УТРОИЛАСЬ** одновременно: было ~15–25 первых-одноразок/день, стало 50–76/день с ~17.07. Больше народу покупает одноразку, апгрейд в подписку = ноль.
- **Гипотеза (нужно подтверждение продукта, что именно залили на RMF ~16–17.07)**: новый безлимитный/дешёвый одноразовый оффер сделал одноразку самодостаточной → 3× больше покупателей одноразки, но подписка больше не нужна = апгрейд обнулился. Классический каннибализм подписки одноразкой. Учитывая, что апгрейд = единственный путь этих юзеров в подписку (same-day), убийство апгрейда = эти юзеры скорее всего НИКОГДА не станут подписчиками. Стратегический риск LTV: считать, что выгоднее — 3× объём одноразок сейчас или подписочный LTV.
- Действие: попросить у Лизы, что именно за оффер залили на RMF 14–17.07; посчитать выручку одноразок RMF до/после (объём × цена) против потерянного подписочного LTV.

## Деталка ai-add-person-to-photo — 23.07 (widget.html?w=ai-add-person-to-photo)

- **Онбординг в виджете лендинга ai_add_person_to_photo_* — НОВЫЙ и растущий (запущен 09.07)**: upload_start/upload_success/click_generate/redirect_product/widget_view. Противоположность RMF (у того лендинг-виджет легаси и умер) — тут он текущий. Воронка: лендинг → загрузил фото (виджет) → нажал генерацию → продукт → рега-стена → рега → пейволл → last-chance → покупка → генерация. До 09.07 шаги виджета пустые.
- **Лучшая конверсия визит→покупка среди топ-виджетов**: продукт→покупка 9.81% (за 7д), визит-лендинга→покупка ~6.7%. Апгрейд однораз→подписка 3.8% (зрелый, не тронут июльским изменением RMF).
- **Платный ×4.1 к органике** (12.85% против 3.14%, p<0.001). Органика 57% трафика, платный 36% (заметно больше доля платного, чем у RMF/looksmax).
- **Мобайл = десктоп** по конверсии (10.08% vs 8.70%, p=0.606 — шум). 76% трафика мобайл.
- **Время до покупки: медиана 1 минута, 97% в первые 15 минут** — самый быстрый импульс из разобранных виджетов.
- **Кросс-промо модалка add-person-to-photo-post-gen-onboarding ЖИВА** (в отличие от looksmax): impression ~103 юзера, но охват всё равно мал против трафика. Топ-переход make-video (47 кликов), покупок в целевом почти нет.
- upload_attempt на продукт-странице (cat=chat) тоже есть (81 юзер) — вторичная загрузка уже внутри продукта; в воронке использую фото-загрузку из виджета лендинга (основной онбординг).
- Промо-модалки везде называются `<widget>-post-gen-onboarding` (image-combiner-post-gen-onboarding и т.д.), НО у looksmax/rate-my-face — `<widget>-post-onboarding` (без gen). Не перепутать при сборке следующих виджетов.

## Урок про воронки: рега-стену НЕ ставить в воронку покупки — её событие недосчитывает (23.07)

- Воронка ПОКУПКИ = land → prod → ПЕЙВОЛЛ (get feature view) → покупка. Рега-стену (sign up view) в воронку НЕ ставить: недосчитывает (~63% реальных регистраций), выглядит меньше пейволла и вводит в заблуждение. Проверено: 97% видевших пейволл на add-person — НОВЫЕ юзеры, не возвращенцы (моё прежнее объяснение про возвращенцев было неверным). Регистрацию — отдельным KPI (floor).

## Ревью воронок looksmax и RMF (23.07) — те же болезни, исправлены на «спину»

Проверил обе деталки тем же критическим взглядом, что add-person. Нашёл немонотонность («хипхоп») от ненадёжных шагов:
- **looksmax**: рега(3039) < скан(3358) < тизер(3486) — рега недосчитывает, а тизер фаерится на возврате без нового скана; клик-по-локу(2543) < пейволл(2705); купил(121) < полный отчёт(127, подписчики без покупки).
- **RMF**: зарегался(9603) < пейволл(9770) (+1.7%, недосчёт рега-стены).
- **Причина общая**: рега-стена (sign up view), регистрация и scan-шаг недосчитывают → ломают монотонность, если ставить их шагами воронки.
- **Исправление — воронка-СПИНА (только надёжные монотонные шаги), рега → KPI**:
  - looksmax: визит → продукт → квиз → генерация → пейволл → покупка (6800>6519>5883>4380>2705>121). Квиз-детали в панели «Квиз», локи в «Локах тизера».
  - RMF: визит → продукт → пейволл → last-chance → покупка (22389>21309>9770>2331>385).
  - add-person: визит → продукт → пейволл → покупка.
- **Правило на будущее**: воронка покупки = land → prod → ПЕЙВОЛЛ (get feature view, надёжный) → buy [+ надёжные продуктовые шаги вроде квиза]. Рега-стену/регистрацию НЕ ставить шагом (недосчёт) — выносить в KPI «рега после стены» как floor. Продуктовую детализацию (квиз, локи) — в отдельные панели, не в вертикальную воронку.
