import re

with open('src/renderer/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

replacements = {
    '<h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Clinical Pulse</h3>': '<h3 class="text-xl font-bold text-slate-800 dark:text-slate-200" data-i18n="clinical_pulse_label">Clinical Pulse</h3>',
    '<button onclick="loadPage(\'history\')" class="text-xs font-bold text-primary hover:underline">View All</button>': '<button onclick="loadPage(\'history\')" class="text-xs font-bold text-primary hover:underline" data-i18n="view_all">View All</button>',
    '<h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Quick Links</h3>': '<h3 class="text-xl font-bold text-slate-800 dark:text-slate-200" data-i18n="quick_links">Quick Links</h3>',
    '<div class="font-bold text-slate-900 dark:text-white">Active Patients</div>': '<div class="font-bold text-slate-900 dark:text-white" data-i18n="active_patients">Active Patients</div>',
    '<div class="text-[10px] text-slate-500">${stats.patients} Total</div>': '<div class="text-[10px] text-slate-500">${stats.patients} <span data-i18n="total_label">Total</span></div>',
    '<div class="font-bold text-slate-900 dark:text-white">History Archive</div>': '<div class="font-bold text-slate-900 dark:text-white" data-i18n="history_archive">History Archive</div>',
    '<div class="text-[10px] text-slate-500">View all logs</div>': '<div class="text-[10px] text-slate-500" data-i18n="view_all_logs">View all logs</div>',
    '<span class="text-[10px] font-black uppercase tracking-widest opacity-60">System Efficiency</span>': '<span class="text-[10px] font-black uppercase tracking-widest opacity-60" data-i18n="system_efficiency">System Efficiency</span>',
    '<h4 class="text-2xl font-black mt-1">High Performance</h4>': '<h4 class="text-2xl font-black mt-1" data-i18n="high_performance">High Performance</h4>',
    '<p class="text-white/70 text-xs mt-2">AI diagnostics are processing with sub-second latency.</p>': '<p class="text-white/70 text-xs mt-2" data-i18n="ai_sublatency">AI diagnostics are processing with sub-second latency.</p>',
    '>No recent activity detected.<': ' data-i18n="no_recent_activity">No recent activity detected.<'
}

for k, v in replacements.items():
    js = js.replace(k, v)

with open('src/renderer/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

with open('src/renderer/js/i18n.js', 'r', encoding='utf-8') as f:
    i18n = f.read()

# Add total_label if not exists
if 'total_label:' not in i18n:
    i18n = i18n.replace('// Patient Profile', 'total_label:          { en: "Total",                ar: "الإجمالي" },\n  // Patient Profile')
    with open('src/renderer/js/i18n.js', 'w', encoding='utf-8') as f:
        f.write(i18n)

