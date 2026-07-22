/**
 * i18n.js — MedEcho Bilingual Dictionary (English ↔ Arabic)
 * Usage: t('key') → returns string in current language
 * Call setLang('ar') or setLang('en') to switch globally.
 */

const DICT = {
  // ── GENERAL ──────────────────────────────────────────────────────────
  app_name:               { en: "MedEcho",              ar: "ميد إيكو" },
  diagnostic_hub:         { en: "Diagnostic Hub",       ar: "مركز التشخيص" },

  // ── SIDEBAR NAV ───────────────────────────────────────────────────────
  nav_main_registry:      { en: "Main Registry",        ar: "السجل الرئيسي" },
  nav_patients:           { en: "Patients",             ar: "المرضى" },
  nav_workflow:           { en: "Workflow",             ar: "سير العمل" },
  nav_history:            { en: "History",              ar: "السجل" },
  nav_clinical_intake:    { en: "Clinical Intake",      ar: "الاستقبال السريري" },
  nav_final_assessment:   { en: "Final Assessment",     ar: "التقييم النهائي" },
  nav_command:            { en: "Command Center",       ar: "مركز التحكم" },
  nav_dashboard:          { en: "Dashboard",            ar: "لوحة التحكم" },
  nav_settings:           { en: "Settings",             ar: "الإعدادات" },
  clinician_active:       { en: "Clinician Active",     ar: "الطبيب نشط" },
  shift_protocol:         { en: "Shift Protection Protocol V1", ar: "بروتوكول حماية الوردية V1" },

  // ── HEADER ────────────────────────────────────────────────────────────
  patient_questions:      { en: "Patient Questions",    ar: "أسئلة المريض" },
  questions_to_ask:       { en: "✅ Questions to Ask",  ar: "✅ أسئلة للاستفسار" },
  new_patient:            { en: "New Patient",          ar: "مريض جديد" },
  new_question:           { en: "New question...",      ar: "سؤال جديد..." },
  clinical_notes:         { en: "📝 Clinical Notes",   ar: "📝 ملاحظات سريرية" },
  type_notes_here:        { en: "Type notes here...",   ar: "اكتب ملاحظاتك هنا..." },

  // ── DASHBOARD ─────────────────────────────────────────────────────────
  clinical_pulse_label:   { en: "Clinical Pulse",       ar: "النبض السريري" },
  diagnostic_overview:    { en: "Diagnostic Overview",  ar: "نظرة عامة تشخيصية" },
  reports_pending:        { en: "Reports Pending",      ar: "التقارير المعلقة" },
  shift_duration:         { en: "Shift Duration",       ar: "مدة الوردية" },
  ai_accuracy:            { en: "AI Accuracy",          ar: "دقة الذكاء الاصطناعي" },
  engine_status:          { en: "Engine Status",        ar: "حالة المحرك" },
  system_local:           { en: "System Local",         ar: "نظام محلي" },
  quick_registry_lookup:  { en: "Quick Registry Lookup...", ar: "بحث سريع في السجل..." },
  start_session:          { en: "Start Session",        ar: "بدء الجلسة" },
  registry:               { en: "Registry",             ar: "السجل" },
  total_patients:         { en: "Total Patients",       ar: "إجمالي المرضى" },
  pending:                { en: "Pending",              ar: "معلق" },
  assessments_needed:     { en: "Assessments Needed",   ar: "تقييمات مطلوبة" },
  finalized:              { en: "Finalized",            ar: "مكتمل" },
  medical_reports:        { en: "Medical Reports",      ar: "التقارير الطبية" },
  ai_engine:              { en: "AI Engine",            ar: "محرك الذكاء الاصطناعي" },
  infra_health:           { en: "Infrastructure Health",ar: "صحة البنية التحتية" },
  operational:            { en: "Operational",          ar: "يعمل" },
  view_all:               { en: "View All",             ar: "عرض الكل" },
  no_recent_activity:     { en: "No recent activity detected.", ar: "لا يوجد نشاط حديث." },
  quick_links:            { en: "Quick Links",          ar: "روابط سريعة" },
  active_patients:        { en: "Active Patients",      ar: "المرضى النشطون" },
  history_archive:        { en: "History Archive",      ar: "أرشيف السجل" },
  view_all_logs:          { en: "View all logs",        ar: "عرض جميع السجلات" },
  system_efficiency:      { en: "System Efficiency",   ar: "كفاءة النظام" },
  high_performance:       { en: "High Performance",     ar: "أداء عالٍ" },
  ai_sublatency:          { en: "AI diagnostics are processing with sub-second latency.", ar: "يعمل الذكاء الاصطناعي بزمن استجابة أقل من ثانية." },

  // ── PATIENTS PAGE ─────────────────────────────────────────────────────
  registry_status:        { en: "Registry Status: Operational", ar: "حالة السجل: تعمل" },
  patients_title:         { en: "Patients",             ar: "المرضى" },
  patients_desc:          { en: "Comprehensive clinical registry. Search, monitor, and manage the complete patient database from this central node.", ar: "سجل سريري شامل. ابحث وراقب وأدر قاعدة بيانات المرضى من هذا المركز." },
  add_new_patient:        { en: "Add New Patient",      ar: "إضافة مريض جديد" },
  search:                 { en: "Search",               ar: "بحث" },
  search_placeholder:     { en: "Search name, email, phone...", ar: "ابحث بالاسم أو البريد أو الهاتف..." },
  status:                 { en: "Status",               ar: "الحالة" },
  all:                    { en: "All",                  ar: "الكل" },
  active:                 { en: "Active",               ar: "نشط" },
  inactive:               { en: "Inactive",             ar: "غير نشط" },
  tag:                    { en: "Tag",                  ar: "وسم" },
  tag_placeholder:        { en: "e.g., Diabetes",       ar: "مثال: السكري" },
  assigned_clinician:     { en: "Assigned clinician (optional)", ar: "الطبيب المعيّن (اختياري)" },
  clinician_placeholder:  { en: "e.g., Dr. Anas",       ar: "مثال: د. أنس" },
  open_clinical_profile:  { en: "Open Clinical Profile", ar: "فتح الملف السريري" },
  loading_patients:       { en: "Loading patients...",  ar: "جارٍ تحميل المرضى..." },
  failed_load_patients:   { en: "Failed to load patients", ar: "فشل تحميل المرضى" },
  please_try_again:       { en: "Please try again.",    ar: "يرجى المحاولة مجدداً." },
  retry:                  { en: "Retry",                ar: "إعادة المحاولة" },
  no_patients:            { en: "No Patients",          ar: "لا يوجد مرضى" },
  add_first_patient:      { en: "Add your first patient to get started.", ar: "أضف أول مريض للبدء." },
  no_patients_found:      { en: "No patients found.",   ar: "لا يوجد مرضى مطابقون." },
  syncing:                { en: "Synchronizing Registry...", ar: "جارٍ مزامنة السجل..." },
  // Add patient form
  add_patient_title:      { en: "Add New Patient",      ar: "إضافة مريض جديد" },
  add_patient_subtitle:   { en: "Create a new patient record", ar: "إنشاء سجل مريض جديد" },
  patient_id_label:       { en: "Patient ID",           ar: "رقم المريض" },
  patient_id_ph:          { en: "e.g., P-000123",       ar: "مثال: P-000123" },
  full_name:              { en: "Full Name",             ar: "الاسم الكامل" },
  full_name_ph:           { en: "e.g., Ahmad Al-Hassan", ar: "مثال: أحمد الحسن" },
  age:                    { en: "Age",                  ar: "العمر" },
  age_ph:                 { en: "e.g., 34",             ar: "مثال: 34" },
  sex:                    { en: "Sex",                  ar: "الجنس" },
  select:                 { en: "Select",               ar: "اختر" },
  male:                   { en: "Male",                 ar: "ذكر" },
  female:                 { en: "Female",               ar: "أنثى" },
  other:                  { en: "Other",                ar: "آخر" },
  cancel:                 { en: "Cancel",               ar: "إلغاء" },
  save:                   { en: "Save",                 ar: "حفظ" },
  years:                  { en: "Years",                ar: "سنة" },
  gender:                 { en: "Gender",               ar: "الجنس" },
  age_label:              { en: "Age",                  ar: "العمر" },
  id_label:               { en: "ID",                   ar: "المعرف" },

  // ── PHASE 1 ───────────────────────────────────────────────────────────
  phase1_badge:           { en: "Phase 1: Initial Diagnosis", ar: "المرحلة 1: التشخيص الأولي" },
  clinical_intake_title:  { en: "Clinical Intake",      ar: "الاستقبال السريري" },
  clinical_intake_desc:   { en: "Record the initial patient consultation to generate a foundational clinical transcript and diagnostic draft.", ar: "سجّل استشارة المريض الأولية لتوليد نص سريري تأسيسي ومسودة تشخيص." },
  workflow:               { en: "Workflow",             ar: "سير العمل" },
  intake:                 { en: "Intake",               ar: "الاستقبال" },
  assessment:             { en: "Assessment",           ar: "التقييم" },
  record_new_session:     { en: "Record New Session",   ar: "تسجيل جلسة جديدة" },
  record_session_desc:    { en: "Engage the AI clinical listener to capture the patient's narrative in real-time. The system will automatically structure the history and observations.", ar: "استخدم المستمع السريري بالذكاء الاصطناعي لالتقاط رواية المريض في الوقت الفعلي. سيقوم النظام تلقائياً بهيكلة التاريخ المرضي والملاحظات." },
  launch_listening:       { en: "Launch Listening Suite", ar: "تشغيل جناح الاستماع" },
  physician_tip:          { en: "Physician Tip",        ar: "نصيحة الطبيب" },
  natural_dictation:      { en: "Natural Dictation",    ar: "إملاء طبيعي" },
  natural_dictation_quote:{ en: '"Speak naturally during the consultation. Our AI models are tuned to filter ambiance and focus on clinical data extraction."', ar: '"تحدّث بشكل طبيعي أثناء الاستشارة. نماذجنا مضبوطة لتصفية الضوضاء والتركيز على استخراج البيانات السريرية."' },
  sub_second:             { en: "Sub-second processing", ar: "معالجة أسرع من ثانية" },
  synced_records:         { en: "Synchronized Records", ar: "السجلات المتزامنة" },
  patient_registry_col:   { en: "Patient Registry",    ar: "سجل المرضى" },
  case_identifier_col:    { en: "Case Identifier",     ar: "معرف الحالة" },
  action_col:             { en: "Action",              ar: "الإجراء" },
  complete_case:          { en: "Complete Case",        ar: "إتمام الحالة" },
  all_records_synced:     { en: "All Records Synchronized", ar: "جميع السجلات متزامنة" },
  all_records_synced_sub: { en: "Every intake session has been finalized or no new data is present.", ar: "تمت معالجة جميع جلسات الاستقبال أو لا توجد بيانات جديدة." },
  pending_label:          { en: "Pending",             ar: "معلق" },

  // ── PHASE 2 ───────────────────────────────────────────────────────────
  phase2_badge:           { en: "Phase 2: Final Report", ar: "المرحلة 2: التقرير النهائي" },
  final_assessment_title: { en: "Final Assessment",    ar: "التقييم النهائي" },
  final_assessment_desc:  { en: "Record the follow-up consultation with full clinical context from Phase 1 to synthesize the final diagnostic report.", ar: "سجّل استشارة المتابعة مع السياق السريري الكامل من المرحلة الأولى لتوليد التقرير التشخيصي النهائي." },
  context_missing:        { en: "Context Missing",     ar: "السياق مفقود" },
  intake_context:         { en: "Intake Context",      ar: "سياق الاستقبال" },
  subjective_history:     { en: "Subjective History",  ar: "التاريخ الشخصي" },
  preliminary_findings:   { en: "Preliminary Findings", ar: "النتائج الأولية" },
  intake_unavailable:     { en: "Intake context unavailable:", ar: "سياق الاستقبال غير متاح:" },
  no_findings:            { en: "No specific findings extracted.", ar: "لم يتم استخراج نتائج محددة." },
  select_patient_first:   { en: "Select a patient from the registry to begin assessment", ar: "اختر مريضاً من السجل لبدء التقييم" },
  synthesizing:           { en: "Synthesizing Vocal Assessment and Case Context...", ar: "جارٍ تجميع التقييم الصوتي وسياق الحالة..." },
  start_final_recording:  { en: "Record Final Session", ar: "تسجيل الجلسة النهائية" },
  finalize_assessment:    { en: "Finalize Assessment",  ar: "إتمام التقييم" },
  generate_report:        { en: "Generate Report",     ar: "توليد التقرير" },
  observation_label:      { en: "Observation",         ar: "الملاحظة" },

  // ── HISTORY PAGE ──────────────────────────────────────────────────────
  history_title:          { en: "History",             ar: "السجل" },
  history_desc:           { en: "Archive of all clinical sessions and generated reports.", ar: "أرشيف جميع الجلسات السريرية والتقارير." },
  history_badge:          { en: "Clinical Archive",    ar: "الأرشيف السريري" },
  generated_on:           { en: "Generated On",        ar: "تاريخ التوليد" },
  view_report:            { en: "View Report",         ar: "عرض التقرير" },
  in_progress:            { en: "In-Progress",         ar: "قيد التنفيذ" },
  no_history:             { en: "No reports found.",   ar: "لا توجد تقارير." },

  // ── CONFIGURATION PAGE ────────────────────────────────────────────────
  config_badge:           { en: "System Node: Primary", ar: "العقدة الرئيسية" },
  settings_title:         { en: "Settings",            ar: "الإعدادات" },
  settings_desc:          { en: "Configure your clinical diagnostic suite, manage AI parameters, and adjust global display preferences.", ar: "اضبط مجموعة التشخيص السريري وأدر معامل الذكاء الاصطناعي وضبط تفضيلات العرض." },
  core_version:           { en: "Core Version",        ar: "إصدار النواة" },
  global_prefs:           { en: "Global Preferences",  ar: "التفضيلات العامة" },
  dark_mode:              { en: "Dark Mode",            ar: "الوضع الداكن" },
  dark_mode_sub:          { en: "Switch between light and dark themes", ar: "التبديل بين المظهر الفاتح والداكن" },
  mic_directionality:     { en: "Mic Directionality",  ar: "اتجاهية الميكروفون" },
  mic_dir_sub:            { en: "Define the vocal capture priority for reports", ar: "حدد أولوية التقاط الصوت للتقارير" },
  physician_dictation:    { en: "Physician Dictation",  ar: "إملاء الطبيب" },
  physician_dict_desc:    { en: "AI focuses strictly on Physician-provided clinical data only. Best for pure transcriptions.", ar: "يركز الذكاء الاصطناعي حصرياً على البيانات السريرية التي يقدمها الطبيب. مثالي للنسخ الحرفي." },
  clinical_dialogue:      { en: "Clinical Dialogue",   ar: "الحوار السريري" },
  clinical_dial_desc:     { en: "AI captures full conversation (Dr. + Patient) to synthesize reports. (Default Mode)", ar: "يلتقط الذكاء الاصطناعي الحوار الكامل (الطبيب + المريض) لتوليد التقارير. (الوضع الافتراضي)" },
  usage_scope:            { en: "Usage Scope",         ar: "نطاق الاستخدام" },
  ai_intelligence_pulse:  { en: "AI Intelligence Pulse", ar: "نبض ذكاء الذكاء الاصطناعي" },
  efficiency:             { en: "Efficiency",          ar: "الكفاءة" },
  system_performance:     { en: "System Performance",  ar: "أداء النظام" },

  // ── PATIENT PROFILE ───────────────────────────────────────────────────
  back:                   { en: "← Back",              ar: "← رجوع" },
  edit_profile:           { en: "Edit Profile",         ar: "تعديل الملف" },
  delete_patient:         { en: "Delete Patient",       ar: "حذف المريض" },
  tab_overview:           { en: "Overview",            ar: "نظرة عامة" },
  tab_sessions:           { en: "Sessions",            ar: "الجلسات" },
  tab_reports:            { en: "Reports",             ar: "التقارير" },
  tab_notes:              { en: "Notes",               ar: "الملاحظات" },
  clinical_sessions:      { en: "Clinical Sessions",   ar: "الجلسات السريرية" },
  date_col:               { en: "Date",                ar: "التاريخ" },
  type_col:               { en: "Type",                ar: "النوع" },
  phase_col:              { en: "Phase",               ar: "المرحلة" },
  re_examine:             { en: "Re-examine",          ar: "إعادة الفحص" },
  no_sessions:            { en: "No clinical sessions found for this node.", ar: "لا توجد جلسات سريرية لهذا السجل." },
  finalized_reports:      { en: "Finalized Reports",   ar: "التقارير النهائية" },
  download_pdf:           { en: "Download PDF",        ar: "تحميل PDF" },
  view_data:              { en: "View Data",           ar: "عرض البيانات" },
  no_reports:             { en: "No finalized clinical artifacts found.", ar: "لا توجد تقارير نهائية." },
  clinical_notes_label:   { en: "Clinical Notes",      ar: "الملاحظات السريرية" },
  autosave:               { en: "Auto-saves as you type", ar: "يحفظ تلقائياً أثناء الكتابة" },
  full_identity:          { en: "Full Identity",       ar: "الهوية الكاملة" },
  save_metadata:          { en: "Save Metadata",       ar: "حفظ البيانات" },
  update_metadata:        { en: "Update patient clinical metadata", ar: "تحديث البيانات السريرية للمريض" },
  edit_profile_title:     { en: "Edit Profile",        ar: "تعديل الملف" },
  stage1_badge:           { en: "STAGE 1",             ar: "المرحلة 1" },
  stage2_badge:           { en: "STAGE 2",             ar: "المرحلة 2" },
  stage1_completed:       { en: "Intake Complete",     ar: "الاستقبال مكتمل" },
  stage1_pending:         { en: "Start Intake",        ar: "بدء الاستقبال" },
  stage2_available:       { en: "Start Assessment",    ar: "بدء التقييم" },
  stage2_locked:          { en: "Assessment Locked",   ar: "التقييم مقفل" },
  stage2_completed:       { en: "Assessment Complete", ar: "التقييم مكتمل" },
  reopen_intake:          { en: "Re-open Intake",      ar: "إعادة فتح الاستقبال" },

  // ── RECORDING MODAL ───────────────────────────────────────────────────
  recording_session:      { en: "Recording Session",  ar: "جلسة التسجيل" },
  ready_to_begin:         { en: "Ready to begin",     ar: "جاهز للبدء" },
  start_recording:        { en: "Start Recording",    ar: "بدء التسجيل" },
  pause:                  { en: "Pause",              ar: "إيقاف مؤقت" },
  resume:                 { en: "Resume",             ar: "استئناف" },
  stop:                   { en: "Stop",               ar: "إيقاف" },
  preview:                { en: "Preview",            ar: "معاينة" },
  discard_retake:         { en: "Discard & Retake",   ar: "تجاهل وإعادة التسجيل" },
  transcribe:             { en: "Transcribe",         ar: "نسخ" },
  uploading:              { en: "Uploading...",       ar: "جارٍ الرفع..." },
  please_wait:            { en: "Please wait while we process the audio...", ar: "يرجى الانتظار أثناء معالجة الصوت..." },
  cancel_close:           { en: "Cancel & Close",     ar: "إلغاء وإغلاق" },

  // ── EDIT REPORT MODAL ─────────────────────────────────────────────────
  review_edit_report:     { en: "Review & Edit Report", ar: "مراجعة وتحرير التقرير" },
  clinical_doc_suite:     { en: "Clinical Documentation Suite", ar: "مجموعة التوثيق السريري" },
  discard:                { en: "Discard",            ar: "تجاهل" },
  save_final_pdf:         { en: "Save Final PDF",     ar: "حفظ PDF النهائي" },
  saved:                  { en: "Saved!",             ar: "تم الحفظ!" },

  // ── NOTES PANEL ───────────────────────────────────────────────────────
  notes_tasks:            { en: "Notes & Tasks",      ar: "الملاحظات والمهام" },
  quick_ref_panel:        { en: "Quick reference panel", ar: "لوحة المرجع السريع" },
  add_task:               { en: "Add task...",        ar: "أضف مهمة..." },
  quick_checklist:        { en: "Quick Checklist",    ar: "قائمة المراجعة السريعة" },
  no_tasks:               { en: "No tasks yet",       ar: "لا توجد مهام بعد" },

  // ── REPORT VIEW ───────────────────────────────────────────────────────
  report_view_title:      { en: "Clinical Report",    ar: "التقرير السريري" },
  report_id:              { en: "Report ID",          ar: "رقم التقرير" },
  clinical_history:       { en: "Clinical History",   ar: "التاريخ السريري" },
  detailed_findings:      { en: "Detailed Findings",  ar: "النتائج التفصيلية" },
  impression_summary:     { en: "Impression Summary", ar: "ملخص الانطباع" },
  recommendations:        { en: "Recommendations",   ar: "التوصيات" },
  urgency_level:          { en: "Urgency Level",      ar: "مستوى الإلحاح" },
  download_report:        { en: "Download Report",    ar: "تحميل التقرير" },
  edit_report:            { en: "Edit Report",        ar: "تحرير التقرير" },
  generate_pdf:           { en: "Generate PDF",       ar: "توليد PDF" },
  loading_report:         { en: "Loading report...",  ar: "جارٍ تحميل التقرير..." },
  report_not_found:       { en: "Report data not found.", ar: "لم يتم العثور على بيانات التقرير." },

  // ── TOAST MESSAGES ────────────────────────────────────────────────────
  toast_patient_added:    { en: "Patient added!",     ar: "تمت إضافة المريض!" },
  toast_profile_updated:  { en: "Profile Updated Successfully", ar: "تم تحديث الملف بنجاح" },
  toast_patient_purged:   { en: "Patient record purged", ar: "تم حذف سجل المريض" },
  toast_note_saved:       { en: "Note Saved Automatically", ar: "تم حفظ الملاحظة تلقائياً" },
  toast_select_patient:   { en: "Please select a patient first.", ar: "يرجى اختيار مريض أولاً." },
  toast_mic_physician:    { en: "Mic Focus: Physician Dictation", ar: "تركيز الميكروفون: إملاء الطبيب" },
  toast_mic_dialogue:     { en: "Mic Focus: Clinical Dialogue", ar: "تركيز الميكروفون: الحوار السريري" },
  toast_select_from_reg:  { en: "Unable to bridge case: Missing Patient ID", ar: "تعذّر ربط الحالة: معرف المريض مفقود" },
  toast_pdf_ok:           { en: "PDF ready!", ar: "PDF جاهز!" },
  toast_pdf_fail:         { en: "PDF generation failed", ar: "فشل توليد PDF" },
  toast_failed_history:   { en: "Failed to load history", ar: "فشل تحميل السجل" },
  toast_ai_underway:      { en: "AI analysis underway...", ar: "جارٍ التحليل بالذكاء الاصطناعي..." },
  toast_synthesis_err:    { en: "Synthesis Error:", ar: "خطأ في التجميع:" },
  toast_case_ctx_missing: { en: "Case Context Missing. Please synchronize with Registry.", ar: "سياق الحالة مفقود. يرجى المزامنة مع السجل." },

  // ── LANGUAGE TOGGLE ───────────────────────────────────────────────────
  lang_toggle:            { en: "العربية", ar: "English" },

  // ── MISC ─────────────────────────────────────────────────────────────
  confirm_delete_patient: { en: "Permanently delete this patient record?", ar: "هل تريد حذف سجل هذا المريض نهائياً؟" },
  delete_confirm_yes:     { en: "Yes, Delete",        ar: "نعم، احذف" },
  clinical_node:          { en: "Clinical Node",      ar: "العقدة السريرية" },
  source_id:              { en: "Source ID",          ar: "معرف المصدر" },
  unknown:                { en: "Unknown",            ar: "غير معروف" },
  years_suffix:           { en: " Years",             ar: " سنة" },
  patient_label:          { en: "Patient",            ar: "مريض" },
  phase_intake:           { en: "intake",             ar: "استقبال" },
  phase_final:            { en: "final_assessment",   ar: "تقييم نهائي" },
  server_url_label:       { en: "Backend Server URL", ar: "رابط الخادم الخلفي" },
  server_url_ph:          { en: "https://your-aws-url.com", ar: "https://رابط-الخادم.com" },
  save_url:               { en: "Save URL",           ar: "حفظ الرابط" },
  total_label:          { en: "Total",                ar: "الإجمالي" },
  // Patient Profile
  registry_node_active:   { en: "Registry Node: Active", ar: "عقدة السجل: نشط" },
  patient_profile_title:  { en: "Patient Profile", ar: "ملف المريض" },
  patient_profile_desc:   { en: "Detailed clinical overview and diagnostic history. manage patient records and initiate new sessions from this node.", ar: "نظرة سريرية مفصلة وتاريخ تشخيصي. إدارة سجلات المرضى وبدء جلسات جديدة من هذه العقدة." },
  profile_context:        { en: "Profile Context", ar: "سياق الملف" },
  new_session_btn:        { en: "NEW SESSION", ar: "جلسة جديدة" },
  tab_overview:           { en: "Details", ar: "التفاصيل" },
  tab_sessions:           { en: "Sessions", ar: "الجلسات" },
  tab_reports:            { en: "Reports", ar: "التقارير" },
  clinical_observations:  { en: "Clinical Observations", ar: "الملاحظات السريرية" },
  clinical_obs_placeholder: { en: "Document physician observations and clinical notes here...", ar: "وثق ملاحظات الطبيب والملاحظات السريرية هنا..." },
  session_date:           { en: "Session Date", ar: "تاريخ الجلسة" },
  duration:               { en: "Duration", ar: "المدة" },
  phase_col:              { en: "Phase", ar: "المرحلة" },
  report_id:              { en: "Report ID", ar: "معرف التقرير" },
  date_col:               { en: "Date", ar: "التاريخ" },
  status:                 { en: "Status", ar: "الحالة" },
  patient_stats:          { en: "Patient Stats", ar: "إحصائيات المريض" },
  age_gender:             { en: "Age / Gender", ar: "العمر / الجنس" },
  member_since:           { en: "Member Since", ar: "عضو منذ" },
  uploaded_files:         { en: "Uploaded Files", ar: "الملفات المرفوعة" },
  no_external_files:      { en: "No external files attached.", ar: "لا توجد ملفات خارجية مرفقة." },

  // Report View
  case_finalized:         { en: "Case Finalized Successfully", ar: "تم إتمام الحالة بنجاح" },
  case_finalized_desc:    { en: "The clinical assessment has been merged with the intake record and committed to the registry.", ar: "تم دمج التقييم السريري مع سجل الاستقبال وحفظه في السجل العام." },
  clinical_report_preview:{ en: "Clinical Report Preview", ar: "معاينة التقرير السريري" },
  committed_registry:     { en: "Committed to Registry", ar: "تم الحفظ في السجل" },
  download_pdf:           { en: "Download PDF", ar: "تحميل PDF" },
  clinical_impression:    { en: "Clinical Impression", ar: "الانطباع السريري" },
  synthesizing_data:      { en: "Synthesizing diagnostic data...", ar: "جارٍ تجميع البيانات التشخيصية..." },
  treatment_directives:   { en: "Treatment Directives", ar: "توجيهات العلاج" },
  awaiting_ai:            { en: "Awaiting AI refinement...", ar: "بانتظار تحسين الذكاء الاصطناعي..." },
  finalizing_record:      { en: "Finalizing Record", ar: "إنهاء السجل" },
  back_to_hub:            { en: "Back to Command Hub", ar: "العودة إلى مركز القيادة" },

  // Checklist
  clinical_protocol_active: { en: "Clinical Protocol: Active", ar: "البروتوكول السريري: نشط" },
  consultation_checklist: { en: "Consultation Checklist", ar: "قائمة فحص الاستشارة" },
  checklist_desc:         { en: "Standardized clinical questions and protocol markers to ensure comprehensive diagnostic data collection during sessions.", ar: "أسئلة سريرية قياسية وعلامات بروتوكول لضمان جمع بيانات تشخيصية شاملة أثناء الجلسات." },
  checklist_placeholder:  { en: "Document a new protocol question...", ar: "وثّق سؤال بروتوكول جديد..." },
  append_question:        { en: "Append Question", ar: "إضافة سؤال" },
  registry_empty:         { en: "Registry Empty", ar: "السجل فارغ" },
  registry_empty_desc:    { en: "Your consultation protocol list is currently clear. Add standardized questions above.", ar: "قائمة بروتوكول الاستشارة الخاصة بك فارغة حاليًا. أضف أسئلة قياسية أعلاه." },
  
  // History empty desc
  history_empty_desc:     { en: "Your report history will appear here once you generate your first clinical report.", ar: "سيظهر سجل تقاريرك هنا بمجرد إنشاء تقريرك السريري الأول." },
};

// ── Internal State ──────────────────────────────────────────────────────────
let _lang = localStorage.getItem("medecho_lang") || "en";

/**
 * Translate a key into the current language.
 * Falls back to English, then the raw key.
 */
export function t(key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[_lang] || entry["en"] || key;
}

/**
 * Get current language code ("en" | "ar")
 */
export function getLang() {
  return _lang;
}

/**
 * Switch language and apply RTL/LTR to document.
 * Dispatches 'langchange' event so app.js can re-render.
 */
export function setLang(lang) {
  if (lang !== "en" && lang !== "ar") return;
  _lang = lang;
  localStorage.setItem("medecho_lang", lang);
  _applyDirection();
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
}

function _applyDirection() {
  const isAr = _lang === "ar";
  document.documentElement.setAttribute("lang", _lang);
  document.documentElement.setAttribute("dir", isAr ? "rtl" : "ltr");
  // Apply Arabic font to body when Arabic is selected
  document.body.style.fontFamily = isAr
    ? "'Noto Sans Arabic', 'Inter', sans-serif"
    : "'Inter', system-ui, sans-serif";
}

// ── Auto-apply on load ──────────────────────────────────────────────────────
_applyDirection();

// Expose globally for inline HTML handlers
window.t = t;
window.setLang = setLang;
window.getLang = getLang;
