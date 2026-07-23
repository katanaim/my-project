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
