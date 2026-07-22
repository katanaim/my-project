/**
 * WebApp.gs — SQL-прокси, чтобы Claude мог сам гонять read-only запросы в BigQuery.
 * Живёт в ТОМ ЖЕ Apps Script проекте, что и Code.gs (использует его bqQuery_ и CFG).
 *
 * Установка:
 *  1. Добавить этот файл в проект (Files → + → Script → назвать WebApp).
 *  2. Project Settings → Script Properties → добавить QUERY_TOKEN = длинная случайная строка
 *     (например, сгенерить пароль на 30+ символов в менеджере паролей).
 *  3. Deploy → New deployment → тип Web app:
 *       Execute as: Me
 *       Who has access: Anyone
 *     → Deploy → скопировать URL вида https://script.google.com/macros/s/…/exec
 *  4. Прислать Claude URL + QUERY_TOKEN.
 *
 * Безопасность:
 *  - без верного token запрос отклоняется;
 *  - принимается ТОЛЬКО одиночный SELECT/WITH (никаких DML/DDL/скриптов — регекс режет);
 *  - ответ обрезается до 10 000 строк;
 *  - отозвать доступ: удалить деплоймент (Deploy → Manage deployments) или сменить QUERY_TOKEN.
 */

function doPost(e) {
  var token = PropertiesService.getScriptProperties().getProperty('QUERY_TOKEN');
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ error: 'bad json' }); }
  if (!token || body.token !== token) return json_({ error: 'unauthorized' });

  var sql = String(body.sql || '');
  sql = sql.split('\n').filter(function (l) { return l.replace(/^\s+/, '').indexOf('--') !== 0; }).join('\n')
           .trim().replace(/;\s*$/, '');  // строки-комментарии не должны ронять проверку SELECT
  if (!/^(WITH|SELECT)\b/i.test(sql)) return json_({ error: 'only SELECT/WITH allowed' });
  if (sql.indexOf(';') !== -1)        return json_({ error: 'single statement only' });

  try {
    var t0 = Date.now();
    var rows = bqQuery_(sql);                    // из Code.gs
    return json_({
      rows: rows.slice(0, 10000),
      row_count: rows.length,
      truncated: rows.length > 10000,
      elapsed_ms: Date.now() - t0
    });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// Проверка живости: открыть URL в браузере — должно ответить pong
function doGet() { return json_({ pong: true }); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
