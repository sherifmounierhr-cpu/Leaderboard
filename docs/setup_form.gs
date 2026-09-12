/**
 * ينشئ نموذج Google Form ويربطه بهذا الشيت كوجهة ردود، ثم يعيد بناء شيت
 * «سجل المبيعات» بأعمدة المساعدة (الفريق/السنة/الربع) بنفس ترتيب الأعمدة
 * الذي تعتمد عليه معادلات SUMIFS في شيتَي Agents و«تفاصيل المستشار».
 *
 * التشغيل: Extensions ← Apps Script ← الصق هذا الملف كاملاً ← اختر الدالة
 * setupForm من القائمة العلوية ← ▶ تشغيل ← وافق على الأذونات (أول مرة فقط).
 * افتح Execution log (Ctrl+Enter) بعد الانتهاء لترى رابطَي النموذج.
 *
 * آمن لإعادة التشغيل: لو وُجد نموذج سابق أنشأه هذا السكربت، يُعاد استخدامه
 * بدل إنشاء نموذج مكرَّر في كل مرة.
 */

var LOG_SHEET_NAME = 'سجل المبيعات';
var FORM_ID_PROP = 'EVEREST_SALES_FORM_ID';

function setupForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  var agentNames = readNonEmptyColumn_(ss, 'Agents', 1);
  if (agentNames.length === 0) {
    throw new Error('شيت Agents فارغ — أضف مستشاراً واحداً على الأقل قبل إنشاء النموذج.');
  }

  var form = reuseOrCreateForm_(props);
  form.setTitle('استمارة تسجيل المبيعات — Everest Real Estate');
  form.setDescription(
    'يُملأ عند كل صفقة جديدة. لا حاجة لاختيار الفرع — الشيت يستنتجه تلقائياً من اسم المستشار.'
  );
  form.setCollectEmail(false);

  clearFormItems_(form);

  form
    .addListItem()
    .setTitle('اسم المستشار')
    .setChoiceValues(agentNames)
    .setRequired(true);

  form
    .addTextItem()
    .setTitle('قيمة الصفقة (جنيه مصري)')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('أدخل رقماً موجباً فقط، بدون فواصل أو رموز.')
        .requireNumberGreaterThan(0)
        .build()
    );

  form.addDateItem().setTitle('تاريخ الصفقة').setRequired(true);

  form.addParagraphTextItem().setTitle('ملاحظات').setRequired(false);

  linkFormToLogSheet_(form, ss);

  var editUrl = form.getEditUrl();
  var fillUrl = form.getPublishedUrl();
  Logger.log('رابط تعبئة النموذج (أرسله لمدير المبيعات فقط):\n' + fillUrl);
  Logger.log('رابط تحرير النموذج (لك أنت فقط):\n' + editUrl);

  var ui = SpreadsheetApp.getUi();
  ui.alert(
    'تم إنشاء النموذج وربطه بنجاح',
    'رابط التعبئة (أرسله لمدير المبيعات فقط):\n' + fillUrl +
      '\n\nرابط التحرير (لك أنت):\n' + editUrl +
      '\n\nهذان الرابطان مسجَّلان أيضاً في Execution log (Ctrl+Enter).',
    ui.ButtonSet.OK
  );
}

/** يعيد استخدام نموذج سابق أنشأه هذا السكربت إن وُجد، وإلا ينشئ واحداً جديداً. */
function reuseOrCreateForm_(props) {
  var existingId = props.getProperty(FORM_ID_PROP);
  if (existingId) {
    try {
      return FormApp.openById(existingId);
    } catch (e) {
      // النموذج القديم حُذف يدوياً — نتابع بإنشاء واحد جديد
    }
  }
  var form = FormApp.create('استمارة تسجيل المبيعات — Everest Real Estate');
  props.setProperty(FORM_ID_PROP, form.getId());
  return form;
}

/** يحذف كل أسئلة النموذج الحالية قبل إعادة بنائها، حتى تبقى إعادة التشغيل آمنة. */
function clearFormItems_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) {
    form.deleteItem(items[i]);
  }
}

/** يقرأ عموداً من شيت حتى أول صف فارغ، متجاهلاً صف العنوان. */
function readNonEmptyColumn_(ss, sheetName, columnIndex1Based) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('لم أجد شيت باسم ' + sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet
    .getRange(2, columnIndex1Based, lastRow - 1, 1)
    .getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v !== ''; });
  return values;
}

/**
 * يربط النموذج بهذا الشيت، ويعيد تسمية شيت الردود الذي يُنشئه Google تلقائياً
 * إلى الاسم الذي تعتمد عليه بقية معادلات الملف، ثم يضيف أعمدة المساعدة.
 */
function linkFormToLogSheet_(form, ss) {
  // إن كان مرتبطاً بهذا الشيت نفسه سلفاً لا نكرّر الربط — يبقى الاستدعاء آمناً
  // عند إعادة تشغيل السكربت لتحديث أسئلة النموذج فقط.
  if (form.getDestinationId() !== ss.getId()) {
    var before = ss.getSheets().map(function (s) { return s.getId(); });
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();

    var after = ss.getSheets();
    var created = after.filter(function (s) { return before.indexOf(s.getId()) === -1; });
    var responseSheet = created.length > 0 ? created[0] : findExistingResponseSheet_(ss);
    if (!responseSheet) {
      throw new Error('تعذّر تحديد شيت ردود النموذج. تحقّق يدوياً من ربط الوجهة.');
    }

    // احذف أي نسخة سابقة من الشيت النهائي المطلوب قبل إعادة تسمية شيت الردود إليه
    var old = ss.getSheetByName(LOG_SHEET_NAME);
    if (old && old.getSheetId() !== responseSheet.getSheetId()) {
      ss.deleteSheet(old);
    }
    responseSheet.setName(LOG_SHEET_NAME);
    formatLogSheet_(responseSheet);
    return;
  }

  // مرتبط سلفاً بنفس الشيت: أعد تهيئة أعمدة المساعدة فقط دون لمس الردود
  var existing = ss.getSheetByName(LOG_SHEET_NAME);
  if (existing) formatLogSheet_(existing);
}

function findExistingResponseSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (/^Form Responses/i.test(sheets[i].getName())) return sheets[i];
  }
  return null;
}

/** يضيف أعمدة الفريق/السنة/الربع ويهيّئ شكل الشيت ليطابق بقية الملف. */
function formatLogSheet_(sheet) {
  sheet.setRightToLeft(true);

  var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#157A4A');
  sheet.setFrozenRows(1);

  sheet.getRange(1, 6, 1, 3).setValues([['اسم الفريق', 'السنة', 'الربع']]);
  sheet.getRange(1, 6, 1, 3)
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#157A4A');

  var rows = 1000;
  var formulasTeam = [];
  var formulasYear = [];
  var formulasQuarter = [];
  for (var r = 2; r <= rows + 1; r++) {
    formulasTeam.push(
      ['=IF($B' + r + '="","",IFERROR(VLOOKUP($B' + r + ',Agents!$A:$C,3,FALSE),"؟"))']
    );
    formulasYear.push(['=IF($D' + r + '="","",YEAR($D' + r + '))']);
    formulasQuarter.push(['=IF($D' + r + '="","",ROUNDUP(MONTH($D' + r + ')/3,0))']);
  }
  sheet.getRange(2, 6, rows, 1).setFormulas(formulasTeam);
  sheet.getRange(2, 7, rows, 1).setFormulas(formulasYear);
  sheet.getRange(2, 8, rows, 1).setFormulas(formulasQuarter);

  sheet.getRange(2, 3, rows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 4, rows, 1).setNumberFormat('yyyy-mm-dd');

  sheet.autoResizeColumns(1, 8);
}

/**
 * دالة اختيارية: احذفها إن لم تحتَجها. تحذف النموذج المرتبط نهائياً من Drive
 * وتنسى معرّفه، لاستخدامها فقط إن أردت البدء من الصفر بنموذج جديد بالكامل.
 */
function deleteLinkedForm() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(FORM_ID_PROP);
  if (!id) {
    SpreadsheetApp.getUi().alert('لا يوجد نموذج مرتبط مسجَّل لحذفه.');
    return;
  }
  DriveApp.getFileById(id).setTrashed(true);
  props.deleteProperty(FORM_ID_PROP);
  SpreadsheetApp.getUi().alert('تم نقل النموذج إلى المهملات في Drive.');
}
