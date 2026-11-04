/* The reviewer panel: about 100 built-in experts. Each has a background, skills,
   trigger words that make them relevant, and checks. A check is
   [need, problem, fix line, target field]: if the prompt does not match `need`,
   the reviewer raises `problem` and suggests the fix line (which itself satisfies `need`).
   Pure data and functions; exposes `Reviewers`. */
'use strict';
const Reviewers = (() => {
  const DOMAINS = {
    software: 'Software engineering', data: 'Data and AI', finance: 'Finance and money', wind: 'Wind energy and power',
    writing: 'Writing and communication', training: 'Training and education', design: 'Design and UX', research: 'Research',
    management: 'Management and product', legal: 'Legal and compliance', health: 'Health and lifestyle', general: 'Critical thinking',
  };
  const BUILD = ['app', 'extend'];
  const LIST = [];
  // r(id, name, role, domain, background, skills, triggers, types|null, checks, generalist?)
  const r = (id, name, role, domain, background, skills, trig, types, checks, generalist) => LIST.push({ id, name, role, domain, background, skills, trig, types, checks, generalist: !!generalist });

  // ---------------------------------------------------------------- software engineering
  r('fe', 'Arjun', 'Front-end engineer', 'software', 'Twelve years building web apps that must work on low-cost phones.', ['HTML, CSS, JavaScript', 'Responsive layout', 'Web performance'],
    /\b(web ?app|web page|website|html|css|browser|front.?end|single.page|pwa|static)\b/i, BUILD, [
      [/\b(320|360|390) ?px|breakpoints?\b/i, 'Screen widths are not named', 'Test at 320 px, 390 px and 1366 px wide; nothing may scroll sideways.', 'design'],
      [/\bunder \d+(\.\d+)? ?(s|seconds|ms)\b|lighthouse/i, 'No load-speed target', 'First load under 2 seconds on a mid-range phone; check with Lighthouse.', 'rules'],
      [/\b(chrome|edge|firefox|safari)\b/i, 'Supported browsers are not stated', 'Support current Chrome and Edge on Windows and Chrome on Android; say what Firefox and Safari lack.', 'users']]);
  r('py', 'Kavya', 'Python engineer', 'software', 'Builds Python tools and services that run on Windows for years.', ['Python 3', 'Packaging', 'Error handling'],
    /\b(python|\.py|pip|tkinter|pyqt|fastapi|django|flask)\b/i, BUILD, [
      [/python 3\.\d+/i, 'Python version is not pinned', 'Target Python 3.10 or later and say which newest version you tested.', 'rules'],
      [/requirements\.txt|pyproject|==\s?\d/i, 'Dependencies are not pinned', 'List every dependency in requirements.txt with exact versions (==).', 'rules'],
      [/\blogg?ing\b|log file/i, 'No logging', 'Write errors to a log file next to the data, with time and stack trace, besides the on-screen message.', 'rules']]);
  r('api', 'Rahul', 'Back-end and API engineer', 'software', 'Designs APIs that other people integrate with.', ['REST design', 'Validation', 'Error contracts'],
    /\b(api|endpoint|rest|server|backend|back-end|fastapi|express|http)\b/i, BUILD, [
      [/\b(4\d\d|status codes?)\b/i, 'Error responses are not defined', 'Every endpoint returns JSON errors with a 4xx or 5xx status code and a readable message.', 'rules'],
      [/\bvalidat\w*/i, 'Input validation is not mentioned', 'Validate every request body and query parameter; reject bad input with a clear message.', 'rules']]);
  r('db', 'Sneha', 'Database engineer', 'software', 'Keeps small databases correct for a decade.', ['SQLite', 'Schema design', 'Migrations'],
    /\b(database|sqlite|sql|indexeddb|postgres|mysql|tables?|records?)\b/i, BUILD, [
      [/\bmigrat\w*|schema version/i, 'No plan for schema changes', 'Store a schema version and migrate old data forward automatically, with a backup first.', 'storage'],
      [/\btransaction|atomic/i, 'Writes are not atomic', 'Save each change in one transaction (atomic), so a crash never leaves half a record.', 'storage'],
      [/\bindex(es)?\b/i, 'No indexes for common lookups', 'Add indexes for the fields used in filters and sorting.', 'storage']]);
  r('mob', 'Imran', 'Mobile and PWA engineer', 'software', 'Ships installable web apps used daily on Android.', ['PWA', 'Offline', 'Touch UX'],
    /\b(phone|mobile|android|iphone|pwa|install)\b/i, BUILD, [
      [/\b44 ?px|touch targets?/i, 'Touch target size is missing', 'Every tappable control is at least 44 px high (touch targets).', 'design'],
      [/\boffline\b/i, 'Offline behaviour is not stated', 'The app opens and works offline after the first visit; changes save locally.', 'offline'],
      [/\bkeyboard\b/i, 'On-screen keyboard behaviour is not considered', 'The on-screen keyboard must never cover the field being typed in or close it on resize.', 'design']]);
  r('qa', 'Deepa', 'QA and test engineer', 'software', 'Writes the tests that catch what developers miss.', ['Test design', 'Edge cases', 'Regression'],
    /\b(test|bug|app|tool|feature|build)\b/i, BUILD, [
      [/\bedge cases?|empty|zero\b/i, 'Edge cases are not listed', 'Test edge cases: empty input, zero, very long text, duplicate entries and a missing file.', 'tests'],
      [/\bregression/i, 'No regression check', 'Rerun all earlier tests after every change (regression check).', 'verify'],
      [/\bexpected (result|value|output)|worked out by hand/i, 'Tests have no expected results', 'Each test states its input and the expected result worked out by hand.', 'verify']]);
  r('ops', 'Vikram', 'DevOps and CI engineer', 'software', 'Automates builds and deploys so releases are boring.', ['GitHub Actions', 'Release', 'Reproducible builds'],
    /\b(github|deploy|ci|pipeline|release|repo|repository|pages)\b/i, BUILD, [
      [/\bgithub actions|workflow|\bci\b/i, 'No automated build and test', 'GitHub Actions runs the tests on every push and pull request; deploy only when they pass.', 'repo'],
      [/\block ?file|pinned versions?|package-lock/i, 'Builds are not reproducible', 'Commit the lock file and use pinned versions so every build is the same.', 'repo']]);
  r('sec', 'Farah', 'Security engineer', 'software', 'Finds the hole before someone else does.', ['Threat modelling', 'Secrets', 'Input safety'],
    /\b(login|password|token|api key|secret|upload|server|network|personal|bank|share)\b/i, BUILD, [
      [/\bsecrets?|api keys?|tokens?\b.*\b(never|not)\b|\b(never|not)\b.*\b(secrets?|api keys?|tokens?)\b/i, 'Secrets handling is not stated', 'Never put API keys, tokens or passwords in code or the repository; read secrets from the environment.', 'privacy'],
      [/\bescap\w*|sanitis\w*|sanitiz\w*|injection/i, 'Untrusted input is not escaped', 'Escape or sanitise every value shown on screen or used in a query, to block injection.', 'rules']]);
  r('perf', 'Nikhil', 'Performance engineer', 'software', 'Makes slow tools fast by measuring first.', ['Profiling', 'Large data', 'Responsiveness'],
    /\b(slow|fast|large|thousands|years|performance|big|many entries)\b/i, BUILD, [
      [/\b\d[\d,]* (entries|rows|records|items)\b/i, 'Data volume is not stated', 'It must stay responsive with 50,000 entries (rows) after years of use.', 'rules'],
      [/\bmeasur\w*|profil\w*/i, 'Nothing is measured', 'Measure the slowest action before and after each optimisation and report the numbers.', 'verify']]);
  r('desk', 'Lakshmi', 'Desktop application engineer', 'software', 'Builds Windows desktop tools with Tkinter and Qt.', ['Tkinter', 'PyQt', 'Windows integration'],
    /\b(desktop|tkinter|pyqt|qt|windows app|exe|gui)\b/i, BUILD, [
      [/\bdpi|scaling/i, 'High-DPI screens are not considered', 'Scale correctly on 125% and 150% Windows display scaling (high DPI).', 'design'],
      [/\binstaller|pyinstaller|\.exe|shortcut/i, 'No way to install or launch', 'Provide a one-click launcher: a PyInstaller .exe or a desktop shortcut, with steps.', 'delivery'],
      [/\bui thread|background thread|qthread|freez/i, 'Long work may freeze the window', 'Run long work on a background thread so the window never freezes.', 'pitfalls']]);
  r('oss', 'Thomas', 'Open-source maintainer', 'software', 'Maintains public repositories that strangers can set up in minutes.', ['README', 'Licensing', 'Contributor experience'],
    /\b(github|repo|repository|open.?source|public)\b/i, BUILD, [
      [/\breadme\b/i, 'No README described', 'README with what it is, a screenshot, setup steps, and how to run the tests.', 'repo'],
      [/\blicen[cs]e\b/i, 'Licence is not chosen', 'Add an MIT LICENSE file and list third-party licences.', 'repo']]);
  r('arch', 'Suresh', 'Software architect', 'software', 'Keeps systems simple enough to change in five years.', ['Architecture', 'Modularity', 'Trade-offs'],
    /\b(architecture|modules?|layers?|app|system|tool)\b/i, BUILD, [
      [/\bmodules?|layers?|separat\w*/i, 'No separation of parts', 'Separate the core logic from the user interface and storage (separate modules), so each can be tested alone.', 'rules'],
      [/\bfolder|directory|file (list|structure)|src\//i, 'File structure is not planned', 'Start by listing the folder and file structure with one line per file.', 'buildorder']]);

  // ---------------------------------------------------------------- data and AI
  r('da', 'Ananya', 'Data analyst', 'data', 'Turns messy spreadsheets into decisions.', ['Excel', 'Pivot analysis', 'Data cleaning'],
    /\b(data|analy\w*|spreadsheet|excel|csv|metrics?|report|dashboard)\b/i, null, [
      [/\bclean\w* (the )?data|blank rows|duplicates?/i, 'Data cleaning is not asked for', 'First check the data for blank rows, duplicates, units and date formats, and report what you fixed.', 'extra'],
      [/\bunits?\b|₹|rupees|percent|%/i, 'Units are not stated', 'State the unit for every number (₹, %, kWh, hours).', 'rules']]);
  r('de', 'Gautam', 'Data engineer', 'data', 'Builds pipelines that import and export without losing a row.', ['ETL', 'File formats', 'Data quality'],
    /\b(import|export|csv|xlsx|json|pipeline|sync|merge)\b/i, null, [
      [/\bround.?trip/i, 'No round-trip check', 'Round trip: export, re-import into an empty copy, and compare counts and totals.', 'tests'],
      [/\butf-?8/i, 'Text encoding is not fixed', 'Read and write every file as UTF-8 so Tamil and ₹ survive.', 'rules']]);
  r('stat', 'Rekha', 'Statistician', 'data', 'Asks whether a number means what you think it means.', ['Statistics', 'Sampling', 'Uncertainty'],
    /\b(average|mean|trend|forecast|probability|p50|p90|sample|statistic\w*|correlat\w*)\b/i, null, [
      [/\bconfidence|uncertaint\w*|range|interval/i, 'No uncertainty given', 'Give each estimate with its range or confidence interval, not a single number.', 'rules'],
      [/\bsample size|n ?=|how many (points|records)/i, 'Sample size is not reported', 'Report the sample size (n = …) behind every average or trend.', 'rules']]);
  r('ml', 'Varun', 'Machine learning engineer', 'data', 'Ships models that are judged on fresh data.', ['Model evaluation', 'Features', 'Overfitting'],
    /\b(model|machine learning|ml|predict\w*|classif\w*|train(ing)? data|ai model)\b/i, null, [
      [/\bhold.?out|test set|validation set|unseen/i, 'No held-out evaluation', 'Evaluate on a held-out test set that the model never saw.', 'verify'],
      [/\bbaseline/i, 'No baseline to beat', 'Compare against a simple baseline before claiming the model helps.', 'verify']]);
  r('pe', 'Claire', 'Prompt engineer', 'data', 'Writes prompts that work the first time.', ['Prompt structure', 'Examples', 'Output contracts'],
    /./, null, [
      [/\byou are|act as/i, 'No role for the AI', 'You are a senior expert in this exact task; act as one.', 'role'],
      [/\bexample|e\.g\.|for instance/i, 'No example of the expected output', 'Example: show one input and the exact output you expect.', 'examples'],
      [/\bunsure|do not know|don't know/i, 'The AI is not allowed to say it does not know', 'If you are unsure, say you do not know instead of guessing.', 'extra']], true);
  r('xl', 'Prakash', 'Excel power user', 'data', 'Builds workbooks other people can trust.', ['Formulas', 'Tables', 'Formatting'],
    /\b(excel|xlsx|spreadsheet|workbook|sheet)\b/i, null, [
      [/\bfreeze|frozen header|header row/i, 'Sheet layout is not specified', 'Freeze the header row, use an Excel table, and set column widths so nothing is clipped.', 'rules'],
      [/\bas text|6\.27e\+11|leading zeros/i, 'Long numbers may be mangled', 'Store reference numbers as text so Excel does not show 6.27E+11 or drop leading zeros.', 'pitfalls']]);
  r('bi', 'Shalini', 'Dashboard designer', 'data', 'Designs dashboards that answer one question each.', ['KPIs', 'Charts', 'Drill-down'],
    /\b(dashboard|kpi|chart|graph|report|metrics?)\b/i, null, [
      [/\bkpis?\b|key metrics?/i, 'KPIs are not defined', 'Define each KPI (key metric) with its formula, unit and target.', 'rules'],
      [/\btable toggle|as a table|chart and table/i, 'Chart numbers cannot be read exactly', 'Every chart has a chart and table toggle so exact numbers can be read.', 'design']]);
  r('dpo', 'Nandini', 'Data privacy officer', 'data', 'Makes sure personal data stays with its owner.', ['Data minimisation', 'Consent', 'Retention'],
    /\b(personal|private|health|bank|salary|customer|users?|names?|phone numbers?|email)\b/i, null, [
      [/\bminimi[sz]\w*|only the data|no more data/i, 'Collects more data than needed', 'Collect only the data needed for the task (data minimisation); nothing else.', 'privacy'],
      [/\bretention|delete after|keep for/i, 'No retention rule', 'Say how long data is kept and how a user deletes it (retention).', 'privacy']]);

  // ---------------------------------------------------------------- finance and money
  r('ca', 'Meera', 'Chartered accountant', 'finance', 'Closes books for small firms and families every March.', ['Double entry', 'Reconciliation', 'Indian accounting'],
    /\b(expense|income|ledger|account\w*|budget|invoice|bank|money|₹|rupees?|balance)\b/i, null, [
      [/\bpaise|integer|exact (totals|amounts)/i, 'Money precision is not fixed', 'Hold money as whole paise (integers) so every total is exact.', 'rules'],
      [/\breconcil\w*/i, 'No reconciliation with the bank', 'Reconcile each account against the bank balance at every month end.', 'rules'],
      [/\bopening balance/i, 'Opening balances are missing', 'Each account starts from an opening balance on the start date.', 'data']]);
  r('tax', 'Harish', 'Tax advisor (India)', 'finance', 'Handles GST and income-tax questions for individuals and small businesses.', ['GST', 'Income tax', 'TDS'],
    /\b(tax|gst|tds|invoice|salary|income|deduction|80c|itr)\b/i, null, [
      [/\bgst|tds|income.tax/i, 'Tax treatment is not mentioned', 'Show GST and TDS separately where they apply, and note income-tax relevance (for example 80C).', 'rules'],
      [/\bfinancial year|fy ?20|assessment year/i, 'Tax year is not stated', 'Use the Indian financial year (1 April to 31 March) and name the assessment year.', 'rules']]);
  r('pfp', 'Anjali', 'Personal finance planner', 'finance', 'Helps families plan savings, insurance and goals.', ['Budgeting', 'Goals', 'Emergency fund'],
    /\b(budget|savings?|goal|expense|family|personal finance|emergency)\b/i, null, [
      [/\b50\/30\/20|needs.{0,20}wants|targets? (per|for)/i, 'No spending targets', 'Track needs, wants and savings against targets (for example 50/30/20).', 'rules'],
      [/\bemergency fund/i, 'Emergency fund is not considered', 'Show months of expenses covered by the emergency fund.', 'rules']]);
  r('inv', 'Siddharth', 'Investment analyst', 'finance', 'Researches mutual funds and equities for retail investors.', ['Mutual funds', 'Returns', 'Risk'],
    /\b(invest\w*|mutual funds?|sip|stocks?|equity|portfolio|returns?|xirr|nav)\b/i, null, [
      [/\bxirr|cagr/i, 'Return measure is not defined', 'Measure returns with XIRR for SIPs and CAGR for lump sums.', 'rules'],
      [/\bnot (financial|investment) advice|for information/i, 'No advice disclaimer', 'Present facts for my decision, not investment advice; say so once.', 'extra']]);
  r('aud', 'Venkat', 'Internal auditor', 'finance', 'Checks that every number can be traced to a source.', ['Audit trail', 'Controls', 'Evidence'],
    /\b(audit|ledger|accounts?|transactions?|records?|compliance)\b/i, null, [
      [/\baudit trail|history|never overwrit\w*/i, 'Changes leave no trail', 'Keep an audit trail: every change keeps the old value, time and device; nothing is overwritten.', 'rules'],
      [/\btrace\w*|source (document|reference)|bank ref/i, 'Entries cannot be traced', 'Each entry can be traced to its source (bank reference or document).', 'data']]);
  r('bank', 'Gopal', 'Bank operations specialist', 'finance', 'Knows how Indian bank statements really look.', ['Statements', 'UPI', 'NEFT/IMPS'],
    /\b(bank|statement|upi|neft|imps|hdfc|sbi|icici|uco|transfer)\b/i, null, [
      [/\bnarration|withdrawal|deposit|chq/i, 'Statement columns are not mapped', 'Map statement columns by name: Date, Narration, Chq./Ref.No., Withdrawal Amt., Deposit Amt., Closing Balance.', 'rules'],
      [/\bown.account transfer|between (my )?own accounts/i, 'Self-transfers may be counted as spending', 'Treat money between my own accounts as an own-account transfer, never income or expense.', 'rules']]);
  r('bud', 'Pooja', 'Budget coach', 'finance', 'Helps people stick to a monthly plan.', ['Monthly limits', 'Pace', 'Habits'],
    /\b(budget|limit|monthly|spend\w*|overspend)\b/i, null, [
      [/\bpace|projected|safe (to )?spend/i, 'No pace or projection', 'Show month-to-date pace, projected month-end spend and a safe spend per day.', 'features'],
      [/\balert|warn\w*/i, 'No warning when over budget', 'Warn when a category passes 80% of its monthly limit.', 'features']]);
  r('ins', 'Ramesh', 'Insurance advisor', 'finance', 'Reviews health and term cover for families.', ['Health insurance', 'Term cover', 'Claims'],
    /\b(insurance|policy|premium|claim|cover|mediclaim)\b/i, null, [
      [/\bsum insured|cover amount|coverage/i, 'Cover amount is not tracked', 'Track sum insured (coverage), premium, renewal date and nominee for each policy.', 'data'],
      [/\brenewal (date|reminder)/i, 'Renewals can be missed', 'Remind 30 days before each renewal date.', 'features']]);
  r('loan', 'Asif', 'Loans and EMI specialist', 'finance', 'Explains loans in rupees, not jargon.', ['EMI', 'Amortisation', 'Prepayment'],
    /\b(loan|emi|interest|mortgage|prepay\w*|credit card)\b/i, null, [
      [/\bamorti[sz]ation|principal.{0,20}interest/i, 'EMI split is not shown', 'Show each EMI split into principal and interest (amortisation schedule).', 'features'],
      [/\breducing balance|flat rate|apr/i, 'Interest method is not stated', 'State whether interest is on reducing balance or flat rate, and show the APR.', 'rules']]);
  r('fc', 'Kiran', 'Financial controller', 'finance', 'Owns month-end and year-end reporting.', ['Close process', 'Reporting', 'Accruals'],
    /\b(report\w*|month.end|year.end|financial year|closing|statement)\b/i, null, [
      [/\bmonth.end|period close/i, 'No month-end view', 'Produce a month-end summary: opening, income, expense, transfers, closing.', 'features'],
      [/\bas.of date|as on/i, 'Figures have no as-of date', 'Every balance shows its as-of date.', 'rules']]);
  r('ppa', 'Divya', 'Renewable energy finance analyst', 'finance', 'Models PPAs and tariffs for wind and solar projects.', ['PPA', 'Tariff', 'LCOE'],
    /\b(ppa|tariff|lcoe|irr|project finance|revenue|cuf|plf)\b/i, null, [
      [/\bcuf|plf|capacity utili[sz]ation/i, 'Generation basis is missing', 'State the CUF (capacity utilisation factor) and the P50/P90 basis behind revenue.', 'rules'],
      [/\bsensitivit\w*/i, 'No sensitivity analysis', 'Show sensitivity of IRR to ±10% tariff, CUF and capex.', 'rules']]);

  // ---------------------------------------------------------------- wind energy and power
  r('gc', 'Karthik', 'Grid code compliance engineer', 'wind', 'Prepares wind plants for CEA connectivity compliance in India.', ['CEA Technical Standards', 'FRT', 'Reactive power'],
    /\b(grid code|cea|connectivity|compliance|frt|lvrt|hvrt|reactive power|grid)\b/i, null, [
      [/\bcea\b.*\b(20\d\d|regulation|standard)|technical standards for connectivity/i, 'The exact CEA standard is not named', 'Cite the exact CEA Technical Standards for Connectivity to the Grid (2007, as amended up to 2023) clause for each requirement.', 'sources'],
      [/\bfrt|lvrt|hvrt|fault ride/i, 'Fault ride-through is not covered', 'Cover fault ride-through (LVRT and HVRT) limits, test points and pass criteria.', 'scope'],
      [/\bpoint of (common coupling|interconnection)|poi|pcc/i, 'Measurement point is not stated', 'State that compliance is judged at the point of interconnection (POI/PCC), not at the turbine.', 'rules']]);
  r('pq', 'Priya', 'Power quality engineer', 'wind', 'Measures harmonics and flicker under IEC 61400-21-1.', ['IEC 61400-21-1', 'Harmonics', 'Flicker'],
    /\b(power quality|harmonics?|flicker|thd|iec 61400-21|61400)\b/i, null, [
      [/\b61400-21-1|iec 61000-4-30|ieee 519/i, 'Measurement standard is not named', 'Measure per IEC 61400-21-1 and IEC 61000-4-30 Class A; compare harmonics with IEEE 519 limits where the utility uses them.', 'sources'],
      [/\bclass a|calibrat\w*/i, 'Instrument class is not stated', 'Use a Class A power quality analyser with a valid calibration certificate.', 'rules']]);
  r('wtg', 'Selvam', 'Wind turbine engineer', 'wind', 'Twenty years on turbines from 250 kW to 5 MW.', ['WTG systems', 'Power curve', 'Availability'],
    /\b(turbine|wtg|nacelle|rotor|blade|wind farm|power curve|availability)\b/i, null, [
      [/\bpower curve|iec 61400-12/i, 'Power curve basis is missing', 'Use the measured power curve per IEC 61400-12-1, corrected to site air density.', 'rules'],
      [/\bavailability\b.*\b(%|percent|time.based|energy.based)/i, 'Availability definition is vague', 'Define availability as time-based or energy-based, in percent, and list exclusions.', 'rules']]);
  r('prot', 'Mohan', 'Protection engineer', 'wind', 'Sets relays so faults clear and healthy feeders stay on.', ['Relay coordination', 'Earthing', 'Short circuit'],
    /\b(protection|relay|fault|short circuit|earthing|grounding|breaker|substation)\b/i, null, [
      [/\bcoordinat\w*|grading/i, 'Relay coordination is missing', 'Show relay coordination (grading) with times and margins at each level.', 'rules'],
      [/\bfault level|short.circuit (level|current|mva)/i, 'Fault level is not given', 'State the three-phase and single-phase fault level (short-circuit MVA) at each bus.', 'rules']]);
  r('scada', 'Naveen', 'SCADA and controls engineer', 'wind', 'Connects plant data to control rooms reliably.', ['SCADA', 'IEC 61850', 'Data logging'],
    /\b(scada|telemetry|iec 61850|modbus|data logg\w*|remote monitoring|10.minute)\b/i, null, [
      [/\b10.minute|1.second|sampling (rate|interval)/i, 'Data resolution is not stated', 'Specify data resolution: 1-second for events and 10-minute averages for performance (sampling interval).', 'rules'],
      [/\btime ?stamps?|utc|ist|time sync/i, 'Time base is not defined', 'Time-stamp all data in IST with GPS or NTP time sync; note the conversion from UTC.', 'rules']]);
  r('wra', 'Aruna', 'Wind resource analyst', 'wind', 'Turns met-mast data into bankable energy estimates.', ['Wind data', 'P50/P90', 'MCP'],
    /\b(wind (data|speed|resource)|met mast|lidar|p50|p90|energy yield|aep|mcp)\b/i, null, [
      [/\bp50|p90/i, 'Uncertainty levels are missing', 'Report energy at P50 and P90 with the uncertainty sources.', 'rules'],
      [/\blong.term|mcp|reanalysis/i, 'Short data is not corrected long-term', 'Correct short-term wind data to the long term (MCP with reanalysis data).', 'rules']]);
  r('civ', 'Balaji', 'Civil and foundation engineer', 'wind', 'Designs turbine foundations and access roads.', ['Foundations', 'Geotech', 'Logistics'],
    /\b(foundation|civil|soil|geotech|road|crane|tower)\b/i, null, [
      [/\bgeotech\w*|soil (report|investigation)|bearing capacity/i, 'Soil data is not required', 'Base the design on a geotechnical (soil) investigation with bearing capacity per location.', 'rules'],
      [/\bis 456|is 1893|eurocode|design code/i, 'Design code is not named', 'Name the design codes (IS 456, IS 1893 for seismic) used.', 'sources']]);
  r('hse', 'Joseph', 'Health, safety and environment officer', 'wind', 'Makes sure everyone goes home safe.', ['Work at height', 'LOTO', 'Permits'],
    /\b(safety|site|climb|height|hse|maintenance|field work|commissioning)\b/i, null, [
      [/\bppe|permit to work|loto|lock.?out/i, 'Safe work method is missing', 'Include permit to work, lock-out tag-out (LOTO) and PPE for every field step.', 'rules'],
      [/\bemergency|rescue/i, 'No emergency or rescue plan', 'Add the emergency and tower rescue plan with contact numbers.', 'rules']]);
  r('tso', 'Anand', 'Grid operator (SLDC/RLDC)', 'wind', 'Runs the load despatch desk that schedules wind power.', ['Scheduling', 'Forecasting', 'DSM'],
    /\b(sldc|rldc|nldc|tso|scheduling|forecast\w*|dsm|deviation|despatch|dispatch)\b/i, null, [
      [/\bdsm|deviation settlement/i, 'Deviation charges are ignored', 'Account for deviation settlement (DSM) charges against the 15-minute schedule.', 'rules'],
      [/\b15.minute|time block/i, 'Schedule resolution is not stated', 'Work in 15-minute time blocks, 96 per day.', 'rules']]);
  r('disc', 'Revathi', 'DISCOM planning engineer', 'wind', 'Plans the distribution network that takes the power.', ['Network planning', 'Metering', 'Open access'],
    /\b(discom|distribution|feeder|metering|open access|33 ?kv|11 ?kv|tangedco|tneb)\b/i, null, [
      [/\bmeter\w*\b.*\b(abt|0\.2s|accuracy class)|\b(abt|0\.2s) meter/i, 'Metering standard is missing', 'Use ABT meters of accuracy class 0.2S at the interconnection point.', 'rules'],
      [/\bvoltage level|\d+ ?kv\b/i, 'Voltage level is not stated', 'State the connection voltage level (for example 33 kV or 110 kV) and the substation.', 'rules']]);
  r('lab', 'Ganesh', 'Accredited test lab engineer', 'wind', 'Runs NABL and IEC 17025 accredited field tests.', ['ISO/IEC 17025', 'Test reports', 'Uncertainty'],
    /\b(test (agency|lab|report)|nabl|17025|accredit\w*|field test|measurement campaign)\b/i, null, [
      [/\b17025|nabl|accredit\w*/i, 'Accreditation is not required', 'Tests must be done by an ISO/IEC 17025 (NABL) accredited lab.', 'rules'],
      [/\bmeasurement uncertainty/i, 'Measurement uncertainty is missing', 'Report the measurement uncertainty with every result.', 'rules']]);
  r('oem', 'Sanjay', 'Turbine OEM product manager', 'wind', 'Balances what customers ask for with what turbines can do.', ['Product specs', 'Certification', 'Type test'],
    /\b(oem|manufacturer|type (test|certificate)|product|model|certification)\b/i, null, [
      [/\btype certificate|iec 61400-22|iecre|type test/i, 'Certification basis is missing', 'Name the type certificate (IECRE / IEC 61400-22) and type test reports relied on.', 'sources'],
      [/\bmodel (number|name)|rated (power|capacity)/i, 'Turbine model is not specified', 'Specify turbine model name, rated power and hub height.', 'scope']]);
  r('comm', 'Dinesh', 'Commissioning engineer', 'wind', 'Brings new plants online without surprises.', ['Pre-commissioning', 'Checklists', 'Handover'],
    /\b(commission\w*|handover|energi[sz]\w*|cod|trial run|punch list)\b/i, null, [
      [/\bchecklists?|punch list/i, 'No commissioning checklist', 'Provide a step-by-step commissioning checklist with sign-off per item (punch list).', 'structure'],
      [/\bcod|commercial operation/i, 'COD conditions are missing', 'State the conditions for the commercial operation date (COD).', 'rules']]);
  r('reg', 'Lavanya', 'Power sector regulatory specialist', 'wind', 'Tracks CERC and state regulator orders.', ['CERC/SERC', 'Orders', 'Tariff regulations'],
    /\b(cerc|serc|tnerc|regulat\w*|order|petition|tariff regulation|electricity act)\b/i, null, [
      [/\b(order|regulation|amendment)\b.*\b20\d\d\b|\b20\d\d\b.*\b(order|regulation|amendment)\b/i, 'Regulation versions are not dated', 'Cite each regulation or order with its number and date (for example the 2023 amendment), and use the latest amendment.', 'sources'],
      [/\bcurrent|latest|as of/i, 'Rules may be outdated', 'Check the latest amendments as of today before relying on any clause.', 'verify']]);
  r('trainer-wind', 'Muthu', 'Wind energy trainer', 'wind', 'Trains engineers and technicians across India.', ['Technical training', 'Field examples', 'Assessment'],
    /\b(training|trainees?|course|session|workshop|module)\b.*\b(wind|grid|power|turbine|electrical)\b|\b(wind|grid|power|turbine|electrical)\b.*\b(training|trainees?|course|session|workshop)\b/i, null, [
      [/\bfield (example|case)|case stud\w*|real site/i, 'No field examples', 'Include two real field examples or case studies from Indian sites.', 'structure'],
      [/\bquiz|assessment|check (your|for) understanding/i, 'No check of learning', 'End each section with a short quiz to check understanding.', 'structure']]);

  // ---------------------------------------------------------------- writing and communication
  r('tw', 'Sarah', 'Technical writer', 'writing', 'Writes manuals people actually follow.', ['Procedures', 'Plain English', 'Structure'],
    /\b(document\w*|manual|guide|readme|instructions?|procedure|write|writing|handout)\b/i, null, [
      [/\bplain (english|language)|short sentences/i, 'Reading level is not set', 'Use plain English: short sentences, active voice, one idea per sentence.', 'tone'],
      [/\bnumbered steps?|step.by.step/i, 'Procedures are not numbered', 'Write procedures as numbered steps, one action per step.', 'structure']]);
  r('ed', 'Fatima', 'Editor', 'writing', 'Cuts every word that does not earn its place.', ['Clarity', 'Concision', 'Consistency'],
    /\b(write|writing|article|post|blog|email|letter|summary|report|content)\b/i, null, [
      [/\b\d+ words|word (limit|count)|under \d+/i, 'No length limit', 'Keep it under 600 words; cut repetition (word limit).', 'length'],
      [/\bno (jargon|filler)|avoid jargon/i, 'Jargon is not ruled out', 'Avoid jargon and filler; define any technical term on first use (no jargon).', 'tone']]);
  r('copy', 'Nisha', 'Copywriter', 'writing', 'Writes words that make people act.', ['Headlines', 'Calls to action', 'Audience'],
    /\b(marketing|post|linkedin|landing|ad|campaign|announce\w*|promot\w*|social)\b/i, null, [
      [/\bheadline|hook/i, 'No headline or hook', 'Open with a headline (hook) that states the benefit in under 10 words.', 'structure'],
      [/\bcall to action|cta/i, 'No call to action', 'End with one clear call to action (CTA).', 'cta']]);
  r('tr', 'Murugan', 'Translator (Tamil and English)', 'writing', 'Translates technical text between Tamil and English.', ['Tamil', 'Terminology', 'Localisation'],
    /\b(tamil|translat\w*|bilingual|regional language|local language|hindi)\b/i, null, [
      [/\bglossary|terminology/i, 'Terms may be translated inconsistently', 'Keep a glossary so each technical term is translated the same way (terminology).', 'rules'],
      [/\bunicode|utf-?8|font/i, 'Tamil script may break', 'Use UTF-8 and a font with full Tamil support (Unicode).', 'rules']]);
  r('pres', 'Rohan', 'Presentation coach', 'writing', 'Makes decks that carry one message per slide.', ['Slides', 'Storyline', 'Speaker notes'],
    /\b(slides?|deck|presentation|ppt|talk|pitch)\b/i, null, [
      [/\bone (message|idea) per slide/i, 'Slides may be overloaded', 'One message per slide; the title states it as a sentence.', 'structure'],
      [/\bspeaker notes/i, 'No speaker notes', 'Add speaker notes with what to say for each slide.', 'structure']]);
  r('docarch', 'Ishaan', 'Documentation architect', 'writing', 'Organises large sets of documents so readers find answers.', ['Information architecture', 'Navigation', 'Versioning'],
    /\b(documentation|docs|knowledge base|wiki|handbook|sop)\b/i, null, [
      [/\btable of contents|toc|index/i, 'No navigation', 'Start with a table of contents (TOC) linking to each section.', 'structure'],
      [/\bversion (number|history)|revision/i, 'No version history', 'Add version number, date and a revision history.', 'structure']]);
  r('proof', 'Leela', 'Proofreader', 'writing', 'Catches the typo in the headline.', ['Spelling', 'Consistency', 'Style'],
    /\b(write|writing|document|letter|email|report|post|content|article)\b/i, null, [
      [/\b(british|indian|us|american) english|en-in|en-gb/i, 'Spelling convention is not set', 'Use Indian English spelling (British style: colour, organise).', 'tone'],
      [/\bconsisten\w*/i, 'Consistency is not asked for', 'Keep names, units and capitalisation consistent throughout.', 'tone']]);
  r('story', 'Aditi', 'Storyteller', 'writing', 'Turns facts into a narrative people remember.', ['Narrative arc', 'Examples', 'Engagement'],
    /\b(story|narrative|blog|talk|presentation|article|explain\w*)\b/i, null, [
      [/\bnarrative arc|story|problem.{0,20}solution/i, 'No narrative arc', 'Follow a narrative arc: problem, turning point, solution, result (story).', 'structure'],
      [/\banalog\w*|metaphor/i, 'No analogy for hard ideas', 'Use one everyday analogy for the hardest idea.', 'structure']]);

  // ---------------------------------------------------------------- training and education
  r('ct', 'Vijay', 'Corporate trainer', 'training', 'Runs technical training for engineers and managers.', ['Delivery', 'Engagement', 'Timing'],
    /\b(training|trainees?|session|workshop|course|teach\w*|learners?)\b/i, null, [
      [/\blearning objectives?|by the end/i, 'No learning objectives', 'State 3 learning objectives: by the end, participants can …', 'structure'],
      [/\b\d+ ?(minutes|hours)|duration|timing/i, 'Session length is not set', 'Plan for a 90-minute session with timings per section (duration).', 'length']]);
  r('id', 'Swati', 'Instructional designer', 'training', 'Designs courses around what learners must do afterwards.', ['ADDIE', 'Bloom’s taxonomy', 'Activities'],
    /\b(course|module|curriculum|lesson|e.learning|training|learning)\b/i, null, [
      [/\bactivit\w*|exercise|hands.on/i, 'No practice activities', 'Add one hands-on activity or exercise per module.', 'structure'],
      [/\baudience|level|prior knowledge|beginners?|experienced/i, 'Learner level is not stated', 'State the learners\' level and prior knowledge (audience: beginners or experienced).', 'audience']]);
  r('assess', 'Mahesh', 'Assessment designer', 'training', 'Writes questions that test understanding, not memory.', ['MCQ design', 'Rubrics', 'Validity'],
    /\b(quiz|test|exam|assessment|questions|mcq|evaluat\w*)\b/i, null, [
      [/\banswer key|rubric|explanation/i, 'No answer key', 'Provide an answer key with a one-line explanation for each answer.', 'structure'],
      [/\bdistractors?|plausible/i, 'Wrong options may be too easy', 'Make wrong options plausible distractors based on common mistakes.', 'rules']]);
  r('elearn', 'Rita', 'E-learning developer', 'training', 'Builds self-paced modules that work on phones.', ['SCORM', 'Microlearning', 'Video'],
    /\b(e.learning|online course|lms|video|self.paced|microlearning)\b/i, null, [
      [/\b\d+.minute (modules?|videos?|chunks?)|microlearning/i, 'Modules are too long', 'Split into 5-minute modules (microlearning), each with one objective.', 'structure'],
      [/\bcaptions?|subtitles?/i, 'No captions', 'Add captions (subtitles) to every video.', 'structure']]);
  r('sme', 'Rajesh', 'Subject-matter coach', 'training', 'Checks that training content is technically right.', ['Accuracy', 'Field practice', 'Standards'],
    /\b(training|course|handout|explain\w*|tutorial|teach\w*)\b/i, null, [
      [/\bsources?|references?|cite/i, 'Content is not referenced', 'Cite the standard or source for every technical rule (references).', 'citations'],
      [/\bcommon mistakes|misconceptions?/i, 'Common mistakes are not covered', 'Include a short list of common mistakes and misconceptions.', 'structure']]);
  r('fac', 'Kamala', 'Workshop facilitator', 'training', 'Keeps rooms engaged and on time.', ['Facilitation', 'Group work', 'Energy'],
    /\b(workshop|session|meeting|brainstorm|group|team)\b/i, null, [
      [/\bagenda/i, 'No agenda', 'Provide an agenda with timings and owners.', 'structure'],
      [/\bgroup (work|activity)|breakout|discussion/i, 'No interaction', 'Include one group activity or discussion every 20 minutes.', 'structure']]);
  r('mentor', 'Hari', 'Mentor for juniors', 'training', 'Explains things the way he wished someone had explained to him.', ['Mentoring', 'Scaffolding', 'Feedback'],
    /\b(junior|beginner|new (engineer|joiner)|fresher|explain|learn\w*)\b/i, null, [
      [/\bprerequisites?|before you start/i, 'Prerequisites are not listed', 'List prerequisites: what the reader should know before they start.', 'structure'],
      [/\bwhy\b.*\bmatters|reason behind/i, 'Steps lack the why', 'For each step, say in one line why it matters.', 'structure']]);
  r('curr', 'Usha', 'Curriculum planner', 'training', 'Plans multi-week programmes that build skills in order.', ['Sequencing', 'Progression', 'Outcomes'],
    /\b(curriculum|programme|program|syllabus|weeks?|series|course plan)\b/i, null, [
      [/\bweek \d|sequence|progression|order of topics/i, 'Topics are not sequenced', 'Sequence topics week by week, each building on the last (progression).', 'structure'],
      [/\boutcomes?|competenc\w*/i, 'No programme outcomes', 'State the programme outcomes (competencies) at the end.', 'structure']]);

  // ---------------------------------------------------------------- design and UX
  r('ux', 'Maya', 'UX designer', 'design', 'Designs for the most frequent task first.', ['User flows', 'Information architecture', 'Usability'],
    /\b(app|tool|page|screen|ui|ux|interface|dashboard|website)\b/i, BUILD, [
      [/\bmost frequent|primary (task|action)|in (one|two) taps?/i, 'The main task is not prioritised', 'Make the most frequent task (primary action) possible in two taps from the home screen.', 'design'],
      [/\bempty states?/i, 'Empty states are not designed', 'Design empty states that say what to do next.', 'design']]);
  r('ui', 'Kunal', 'UI and visual designer', 'design', 'Makes interfaces calm, consistent and on-brand.', ['Visual hierarchy', 'Colour', 'Typography'],
    /\b(design|theme|colou?r|font|look|style|ui|dark mode|brand)\b/i, BUILD, [
      [/\bdark (mode|theme)|light and dark/i, 'Themes are not specified', 'Support light and dark themes that follow the system setting.', 'design'],
      [/\bfont|typeface/i, 'Typography is not chosen', 'Name the font (for example IBM Plex Sans) and a type scale.', 'design']]);
  r('a11y', 'Anitha', 'Accessibility specialist', 'design', 'Tests with screen readers and keyboard only.', ['WCAG 2.2', 'Keyboard', 'Contrast'],
    /\b(app|page|website|ui|screen|form|interface|document)\b/i, BUILD, [
      [/\bwcag|contrast/i, 'No contrast standard', 'Meet WCAG 2.2 AA contrast (4.5:1 for text).', 'design'],
      [/\bkeyboard|focus/i, 'Keyboard use is not considered', 'Every action works by keyboard with a visible focus outline.', 'design'],
      [/\blabels?|aria|screen reader/i, 'Controls may be unlabelled', 'Every control has a visible label that screen readers announce.', 'design']]);
  r('info', 'Tarun', 'Information designer', 'design', 'Designs charts that tell the truth at a glance.', ['Charts', 'Tables', 'Data ink'],
    /\b(chart|graph|visual\w*|plot|dashboard|infographic|table)\b/i, null, [
      [/\bstart(s)? at zero|zero baseline|axis/i, 'Axes may mislead', 'Bar charts start at zero; label every axis with units.', 'visuals'],
      [/\bcolou?r.{0,20}(category|consistent)|same colou?r/i, 'Colours may shift meaning', 'Keep the same colour for the same category in every chart.', 'visuals']]);
  r('mux', 'Zoya', 'Mobile UX designer', 'design', 'Designs for thumbs, glare and patchy networks.', ['Thumb zones', 'Gestures', 'Forms'],
    /\b(phone|mobile|android|iphone|app)\b/i, BUILD, [
      [/\bbottom (bar|tabs|navigation)|thumb/i, 'Navigation is out of thumb reach', 'Put main navigation in a bottom bar within thumb reach.', 'design'],
      [/\binput types?|numeric keyboard|inputmode/i, 'Wrong keyboards for fields', 'Use the right input types so number fields open the numeric keyboard (inputmode).', 'design']]);
  r('cd', 'Esther', 'Content designer', 'design', 'Writes the words on buttons, errors and empty screens.', ['Microcopy', 'Error messages', 'Voice'],
    /\b(app|tool|ui|screen|error|message|button|form)\b/i, BUILD, [
      [/\berror messages?.{0,40}(explain|how to fix|what to do)/i, 'Error messages are not specified', 'Error messages explain what went wrong and how to fix it, in plain words.', 'design'],
      [/\bsentence case|button (labels?|names?)/i, 'Labels may be inconsistent', 'Use sentence case and verb-first button labels ("Save version").', 'design']]);
  r('ut', 'Bhavna', 'Usability tester', 'design', 'Watches real people get stuck, then fixes it.', ['Usability testing', 'Task success', 'Observation'],
    /\b(app|tool|website|ui|feature|flow)\b/i, BUILD, [
      [/\busability test|real users?|first.time user/i, 'No test with a real person', 'Run a 5-task usability test with one first-time user and fix what blocks them.', 'verify'],
      [/\bonboarding|first (run|visit)|guide/i, 'First visit is not designed', 'Design the first visit: a short guide that gets a new user to their first result (onboarding).', 'features']]);
  r('brand', 'Ravi', 'Brand designer', 'design', 'Keeps names, logos and tone consistent.', ['Identity', 'Logo', 'Tone'],
    /\b(brand|logo|icon|name|identity|marketing)\b/i, null, [
      [/\bicons?\b.*\b(\d+ ?px|192|512)|\b(192|512)\b/i, 'Icon sizes are not specified', 'Provide app icons at 192 and 512 px, plus a maskable version.', 'design'],
      [/\btone of voice|voice and tone|brand voice/i, 'Brand voice is not defined', 'Define the brand voice in three words and keep to it (tone of voice).', 'tone']]);

  // ---------------------------------------------------------------- research
  r('lib', 'Geetha', 'Research librarian', 'research', 'Finds the primary source behind every claim.', ['Search strategy', 'Primary sources', 'Citation'],
    /./, ['research', 'document', 'analysis', 'content'], [
      [/\bprimary sources?|original (source|document)/i, 'Primary sources are not preferred', 'Prefer primary sources (the original standard, paper or regulator page) over summaries.', 'sources'],
      [/\bcite|citations?|references?|sources:/i, 'Citations are not required', 'Cite every fact with a link or reference (citations).', 'output']]);
  r('fact', 'Ajay', 'Fact-checker', 'research', 'Opens every link before it goes out.', ['Verification', 'Dates', 'Numbers'],
    /\b(research|facts?|links?|sources?|statistics|news|latest|current)\b/i, null, [
      [/\bopen(ed)? (every|each) link|working links?|verify (each|every) link/i, 'Links are not verified', 'Open every link and confirm it works and matches its title (working links).', 'verify'],
      [/\bas of|dated?|publish(ed)? date/i, 'Facts have no dates', 'Give the publish date for each source and an as-of date for figures.', 'output']]);
  r('litrev', 'Padma', 'Literature reviewer', 'research', 'Summarises a field without missing the key studies.', ['Systematic review', 'Synthesis', 'Gaps'],
    /\b(papers?|studies|literature|journal|research|review)\b/i, ['research', 'document', 'analysis'], [
      [/\binclusion|exclusion|criteria/i, 'Selection criteria are missing', 'State inclusion and exclusion criteria for sources.', 'scope'],
      [/\bgaps?|limitations?/i, 'Gaps are not identified', 'End with gaps and limitations in the evidence.', 'output']]);
  r('mr', 'Neha', 'Market researcher', 'research', 'Sizes markets and maps competitors.', ['Market sizing', 'Competitors', 'Segments'],
    /\b(market|competitors?|customers?|segment|pricing|industry)\b/i, null, [
      [/\btop-down|bottom-up|market size|tam/i, 'Market size method is missing', 'Estimate market size both top-down and bottom-up and compare.', 'rules'],
      [/\bcompetitors?.{0,30}(table|compare|matrix)/i, 'Competitors are not compared', 'Compare 3–5 competitors in a table on price, features and audience.', 'output']]);
  r('stdr', 'Kumar', 'Standards researcher', 'research', 'Knows which edition of which standard applies.', ['IEC/IS/IEEE', 'Editions', 'Clauses'],
    /\b(standard|iec|ieee|is \d|iso|bis|code|specification)\b/i, null, [
      [/\bedition|20\d\d version|:20\d\d/i, 'Standard editions are not given', 'Name each standard with its edition year (for example IEC 61400-21-1:2019).', 'sources'],
      [/\bclause|section \d/i, 'Clauses are not cited', 'Cite the clause or section number for each requirement.', 'citations']]);
  r('survey', 'Sunita', 'Survey designer', 'research', 'Writes questions that get honest, usable answers.', ['Questionnaires', 'Bias', 'Scales'],
    /\b(survey|questionnaire|feedback form|poll|respondents?)\b/i, null, [
      [/\bleading questions?|neutral wording/i, 'Questions may lead', 'Use neutral wording and avoid leading questions.', 'rules'],
      [/\blikert|scale|1.to.5/i, 'Answer scale is not set', 'Use one consistent 1-to-5 scale with labelled ends (Likert).', 'rules']]);

  // ---------------------------------------------------------------- management and product
  r('pm', 'Ashwin', 'Product manager', 'management', 'Decides what not to build.', ['Scope', 'Priorities', 'Success metrics'],
    /\b(app|tool|feature|product|build)\b/i, BUILD, [
      [/\bout of scope|not in scope|won't do|non.goals?/i, 'Scope edges are not stated', 'List what is out of scope (non-goals) for this version.', 'extra'],
      [/\bsuccess (metric|measure)|done when|acceptance/i, 'Success is not measurable', 'Define success: done when each acceptance check passes.', 'acceptance']]);
  r('prj', 'Sangeetha', 'Project manager', 'management', 'Delivers on the date with no surprises.', ['Planning', 'Milestones', 'Risks'],
    /\b(project|plan|deadline|milestones?|schedule|timeline|deliver\w*)\b/i, null, [
      [/\bmilestones?|by (date|\d)/i, 'No milestones', 'Break the work into milestones with dates.', 'structure'],
      [/\brisks?|blockers?/i, 'Risks are not listed', 'List the top risks and the fallback for each.', 'structure']]);
  r('ba', 'Arvind', 'Business analyst', 'management', 'Turns wishes into testable requirements.', ['Requirements', 'Use cases', 'Acceptance criteria'],
    /\b(requirements?|feature|process|workflow|system|tool|app)\b/i, BUILD, [
      [/\buse cases?|user stor\w*|as a user/i, 'No user stories', 'Write each feature as a user story: as a user, I want …, so that …', 'features'],
      [/\bgiven .* when .* then|acceptance criteria/i, 'Acceptance criteria are missing', 'Give acceptance criteria per feature: given …, when …, then …', 'acceptance']]);
  r('opsm', 'Geeta', 'Operations manager', 'management', 'Keeps daily work running when people are away.', ['Processes', 'Handover', 'Continuity'],
    /\b(process|daily|routine|operations?|team|handover|workflow)\b/i, null, [
      [/\bowner|responsib\w*|who does/i, 'Owners are not named', 'Name the owner responsible for each step.', 'structure'],
      [/\bbackup person|handover|continuity/i, 'No continuity plan', 'Describe the handover so someone else can continue (continuity).', 'structure']]);
  r('risk', 'Sundar', 'Risk manager', 'management', 'Asks what happens when it goes wrong.', ['Risk register', 'Impact', 'Mitigation'],
    /\b(risk|fail\w*|loss|data|money|safety|deadline)\b/i, null, [
      [/\bmitigat\w*|fallback|contingency/i, 'No mitigation', 'For each risk give a mitigation or fallback.', 'pitfalls'],
      [/\bbackup|restore/i, 'Loss is not recoverable', 'Keep a backup and test that restore works.', 'storage']]);
  r('proc', 'Latha', 'Procurement specialist', 'management', 'Buys the right thing at the right price.', ['Specifications', 'Vendor comparison', 'Total cost'],
    /\b(buy|purchase|vendor|supplier|quotation|tender|rfq|procure\w*)\b/i, null, [
      [/\btotal cost|tco|lifecycle cost/i, 'Only price is compared', 'Compare total cost of ownership (TCO), not just the price.', 'rules'],
      [/\bthree quotes|3 quotes|comparison table/i, 'Too few vendors compared', 'Compare at least three quotes in a comparison table.', 'output']]);
  r('cs', 'Ajith', 'Customer support lead', 'management', 'Hears every problem users have.', ['Troubleshooting', 'FAQs', 'Escalation'],
    /\b(app|tool|users?|customers?|support|help)\b/i, BUILD, [
      [/\btroubleshoot\w*|faq|if something (goes|looks) wrong/i, 'No troubleshooting help', 'Include a troubleshooting section: if something goes wrong, what to check.', 'features'],
      [/\bversion (number|shown)|about (screen|page)/i, 'Users cannot report their version', 'Show the app version number on an About screen for support.', 'features']]);
  r('founder', 'Vivek', 'Startup founder', 'management', 'Ships the smallest useful thing first.', ['MVP', 'Prioritisation', 'Speed'],
    /\b(app|product|tool|launch|mvp|startup|idea)\b/i, BUILD, [
      [/\bmvp|first version|phase 1|v1/i, 'Everything is in version 1', 'Define the smallest first version (MVP) and what waits for later.', 'buildorder'],
      [/\bfeedback|measure usage/i, 'No way to learn from use', 'Plan how you will collect feedback from the first users.', 'extra']]);

  // ---------------------------------------------------------------- legal and compliance
  r('law', 'Advocate Shankar', 'Contracts lawyer (India)', 'legal', 'Drafts and reviews commercial contracts under Indian law.', ['Contracts', 'Liability', 'Jurisdiction'],
    /\b(contract|agreement|terms|liability|clause|legal|nda|ppa)\b/i, null, [
      [/\bjurisdiction|governing law|indian law/i, 'Governing law is not stated', 'State governing law and jurisdiction (Indian law, courts at Chennai).', 'rules'],
      [/\bnot legal advice|consult a lawyer/i, 'No legal disclaimer', 'Present this as information, not legal advice; recommend a lawyer review (not legal advice).', 'extra']]);
  r('dp', 'Shreya', 'Data protection specialist (DPDP Act)', 'legal', 'Applies India\'s Digital Personal Data Protection Act, 2023.', ['DPDP Act 2023', 'Consent', 'Data rights'],
    /\b(personal data|customers?|users?|employees?|students?|patients?|collect\w*)\b/i, null, [
      [/\bdpdp|digital personal data protection/i, 'Indian data law is not considered', 'Follow the Digital Personal Data Protection Act, 2023 (DPDP): purpose, consent and deletion.', 'privacy'],
      [/\bconsent/i, 'Consent is not collected', 'Ask for clear consent before collecting personal data, and record it.', 'privacy']]);
  r('ip', 'Nitin', 'IP and licensing specialist', 'legal', 'Checks that every library and image may be used.', ['Open-source licences', 'Copyright', 'Attribution'],
    /\b(library|libraries|font|image|icons?|open.source|github|publish|copy)\b/i, null, [
      [/\blicen[cs]es?|attribution|third.party notices/i, 'Third-party licences are not checked', 'List third-party licences and attribution (third-party notices).', 'repo'],
      [/\bown (images|content)|no copyrighted|original/i, 'Copyrighted material may slip in', 'Use only original or properly licensed images and text; no copyrighted material.', 'rules']]);
  r('hr', 'Kalpana', 'HR and labour compliance advisor', 'legal', 'Keeps people processes fair and lawful.', ['Labour law', 'Policies', 'Fairness'],
    /\b(employees?|staff|hr|hiring|recruit\w*|job|salary|leave|attendance)\b/i, null, [
      [/\bfair|bias|discriminat\w*/i, 'Fairness is not considered', 'Check for bias; treat all candidates and staff the same (fair).', 'rules'],
      [/\bconfidential|need to know/i, 'Employee data is not protected', 'Keep employee data confidential, visible only to those who need to know.', 'privacy']]);
  r('ra', 'Prabhu', 'Regulatory affairs manager', 'legal', 'Tracks the permits and approvals a project needs.', ['Approvals', 'Permits', 'Filings'],
    /\b(approvals?|permits?|licen[cs]e|clearance|noc|regulat\w*|filing)\b/i, null, [
      [/\bchecklist|list of approvals/i, 'No approvals checklist', 'Provide a checklist of approvals with authority, documents and typical time.', 'structure'],
      [/\bdeadline|validity|renewal/i, 'Validity dates are ignored', 'Track validity and renewal deadlines for each permit.', 'rules']]);
  r('eth', 'Mariam', 'Ethics reviewer', 'legal', 'Asks who could be harmed and how.', ['Harm analysis', 'Transparency', 'Fairness'],
    /\b(ai|automat\w*|decision|score|rank\w*|people|users?)\b/i, null, [
      [/\bhuman (review|in the loop)|final decision/i, 'No human check on decisions', 'Keep a human review before any decision that affects a person (human in the loop).', 'rules'],
      [/\bexplain\w* (the|each) (score|decision|result)|transparen\w*/i, 'Results are not explained', 'Explain each score or decision in plain words (transparency).', 'rules']]);

  // ---------------------------------------------------------------- health and lifestyle
  r('nut', 'Dr. Kavitha', 'Nutritionist', 'health', 'Advises on balanced Indian diets.', ['Nutrition', 'Indian foods', 'Evidence'],
    /\b(food|diet|nutrition|meal|calorie|protein|consumable|health benefit)\b/i, null, [
      [/\bnot medical advice|consult (a )?(doctor|dietitian)/i, 'No medical disclaimer', 'This is general information, not medical advice; consult a doctor or dietitian.', 'extra'],
      [/\bevidence (level|tier)|meta.analysis|peer.reviewed/i, 'Evidence strength is not graded', 'Grade each claim by evidence level (meta-analysis, peer-reviewed study, traditional use).', 'rules']]);
  r('fit', 'Coach Arun', 'Fitness coach', 'health', 'Builds routines people keep.', ['Exercise', 'Progression', 'Safety'],
    /\b(exercise|workout|fitness|gym|walk|run|steps|yoga)\b/i, null, [
      [/\bgradual|progress\w*|week \d/i, 'No progression', 'Increase load gradually week by week (progression).', 'rules'],
      [/\bwarm.up|injur\w*|safety/i, 'Safety is not covered', 'Include warm-up and stop if there is pain (safety).', 'rules']]);
  r('med', 'Dr. Ravi', 'Medical information reviewer', 'health', 'Checks health content for accuracy and safe wording.', ['Clinical accuracy', 'Safe messaging', 'Sources'],
    /\b(health|disease|medicine|symptoms?|treatment|doctor|medical|condition)\b/i, null, [
      [/\bnot (a )?diagnos\w*|see a doctor|consult/i, 'Could be read as a diagnosis', 'Never diagnose; for symptoms, advise seeing a doctor (not a diagnosis).', 'rules'],
      [/\bpubmed|who|icmr|peer.reviewed|sources?/i, 'Health claims are unsourced', 'Source health claims from peer-reviewed studies, WHO or ICMR.', 'sources']]);
  r('habit', 'Sowmya', 'Habit coach', 'health', 'Helps people do small things every day.', ['Habits', 'Streaks', 'Reminders'],
    /\b(habit|daily|routine|streak|track\w*|log\w*)\b/i, null, [
      [/\bstreaks?/i, 'No streak or motivation', 'Show a streak of consecutive days to motivate.', 'features'],
      [/\breminders?|notif\w*/i, 'No reminder', 'Offer an optional daily reminder (notification).', 'features']]);
  r('well', 'Farida', 'Wellbeing coach', 'health', 'Balances productivity with rest.', ['Workload', 'Breaks', 'Balance'],
    /\b(productivity|time track\w*|workload|hours|breaks?|focus)\b/i, null, [
      [/\bbreaks?\b/i, 'Breaks are not counted', 'Count breaks as their own category so rest is visible.', 'rules'],
      [/\bwork.life|personal time|balance/i, 'Only work is tracked', 'Show work and personal time side by side (work-life balance).', 'features']]);

  // ---------------------------------------------------------------- critical thinking (generalists)
  r('devil', 'Sam', 'Devil\'s advocate', 'general', 'Argues the other side so weak spots show early.', ['Challenge', 'Assumptions', 'Counter-arguments'],
    /./, null, [
      [/\bassumptions?/i, 'Assumptions are hidden', 'List your assumptions at the end, so I can correct them.', 'extra'],
      [/\balternatives?|other options?|trade.?offs?/i, 'No alternatives considered', 'Before choosing, name one alternative and the trade-off.', 'extra']], true);
  r('sys', 'Lakshman', 'Systems thinker', 'general', 'Looks at how the parts affect each other.', ['Dependencies', 'Feedback loops', 'Second-order effects'],
    /./, BUILD, [
      [/\bdepend\w*|affects?|impact/i, 'Knock-on effects are ignored', 'Say what else each change affects (dependencies) and check those parts too.', 'extra']], true);
  r('newbie', 'Jaya', 'First-time user', 'general', 'Has never seen your tool and has five minutes.', ['Onboarding', 'Clarity', 'Jargon'],
    /./, BUILD.concat(['content', 'document']), [
      [/\bfirst (visit|time|run)|getting started|quick start/i, 'A newcomer would be lost', 'Add a getting-started guide for the first visit (quick start).', 'features']], true);
  r('exec', 'Mr. Rao', 'Busy executive', 'general', 'Reads the first three lines and decides.', ['Summary first', 'Decisions', 'Brevity'],
    /./, ['research', 'document', 'analysis', 'content', 'brainstorm'], [
      [/\bsummary (first|at the top)|executive summary|lead with/i, 'The answer is buried', 'Lead with a 3-line executive summary at the top.', 'structure']], true);
  r('sci', 'Dr. Iyer', 'Sceptical scientist', 'general', 'Wants evidence before belief.', ['Evidence', 'Causality', 'Uncertainty'],
    /./, ['research', 'analysis', 'document'], [
      [/\bevidence|data shows|sources?/i, 'Claims lack evidence', 'Support each claim with evidence or a source; label opinions as opinions.', 'extra'],
      [/\bcorrelation|causa\w*/i, 'Correlation may be read as cause', 'Do not treat correlation as causation; say when causality is not shown.', 'extra']], true);
  r('cost', 'Mani', 'Cost-conscious reviewer', 'general', 'Asks whether there is a free way first.', ['Free tools', 'Running cost', 'Value'],
    /\b(hosting|cloud|api|subscription|paid|service|tool|app)\b/i, BUILD, [
      [/\bfree|no cost|₹ ?0|without (paid|subscription)/i, 'Running cost is not limited', 'Prefer free tools and hosting; state any running cost in ₹ per month (free if possible).', 'rules']], true);
  r('future', 'Gita', 'Maintainability reviewer', 'general', 'Thinks about the person who opens this code in five years.', ['Maintainability', 'Docs', 'Upgrades'],
    /./, BUILD, [
      [/\barchitecture\.md|comments?|document(ed|ation) (the )?(code|design)/i, 'Future changes will be hard', 'Document the design in docs/ARCHITECTURE.md so later changes are easy.', 'repo'],
      [/\bupgrade|dependabot|keep (up to date|current)/i, 'Dependencies will go stale', 'Plan for upgrades: Dependabot or a monthly check keeps dependencies current.', 'repo']], true);

  // ---------------------------------------------------------------- functions
  const byId = Object.fromEntries(LIST.map(x => [x.id, x]));
  const initials = x => x.name.replace(/^(Dr\.|Mr\.|Advocate|Coach) /, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const checkKey = (rid, i) => rid + ':' + i;

  // when few experts match, fill the panel from broad reviewers in this order
  const FALLBACK = ['pe', 'devil', 'exec', 'sci', 'sys', 'newbie', 'ed', 'tw', 'pm', 'qa', 'ux', 'cost', 'future'];
  function eligible(x, type) { return !x.types || x.types.includes(type); }
  function relevance(x, text, type) {
    if (!eligible(x, type)) return 0;
    if (x.trig.source === '.') return x.generalist ? 0.4 : 0.6;
    const g = new RegExp(x.trig.source, 'gi');
    const hits = new Set((String(text).match(g) || []).map(s => s.toLowerCase()));
    return hits.size ? hits.size + (x.types ? 0.5 : 0) : 0;
  }
  function ranked(text, type) {
    return LIST.map(x => ({ x, score: relevance(x, text, type) })).filter(o => o.score > 0).sort((a, b) => b.score - a.score || a.x.id.localeCompare(b.x.id));
  }
  // panel: favourites that are eligible + manual adds + best by relevance; 5 to 8 unless the user adds more
  function pick(text, type, opts) {
    opts = opts || {};
    const add = (opts.add || []).filter(id => byId[id]), remove = new Set(opts.remove || []), fav = (opts.favourites || []).filter(id => byId[id] && eligible(byId[id], type));
    const out = [];
    const push = id => { if (!remove.has(id) && !out.includes(id)) out.push(id); };
    add.forEach(push); fav.forEach(push);
    const r = ranked(text, type);
    for (const o of r) { if (out.length >= Math.max(8, add.length + fav.length)) break; if (o.score >= 1) push(o.x.id); }
    for (const o of r) { if (out.length >= 5) break; push(o.x.id); }
    for (const id of FALLBACK) { if (out.length >= 5) break; if (eligible(byId[id], type)) push(id); }
    return out.map(id => byId[id]);
  }
  function findings(x, promptText, dismissed) {
    dismissed = dismissed || {};
    const out = [];
    x.checks.forEach(([need, problem, line, field], i) => {
      if (need.test(promptText)) return;
      out.push({ key: checkKey(x.id, i), reviewer: x.id, problem, line, field, dismissed: !!dismissed[checkKey(x.id, i)] });
    });
    return out;
  }
  function panelPrompt(panel, promptText, kindName) {
    const who = panel.map((x, i) => `${i + 1}. ${x.name}, ${x.role.toLowerCase()}. ${x.background} Skills: ${x.skills.join(', ')}.`).join('\n');
    return `You are a review panel of ${panel.length} experts. Review the prompt between the markers before it is sent to an AI${kindName ? ' (kind: ' + kindName.toLowerCase() + ')' : ''}. Do not carry out the prompt itself.

PANEL
${who}

WHAT EACH EXPERT DOES
- Speak in your own voice, from your background only.
- Name at most 3 problems that would most hurt the result: quote the exact line, or say what is missing.
- For each problem, give the replacement or added line, written so it can be pasted in.
- If you have nothing important to add, say "No concerns" in one line.

THEN, AS A PANEL
1. List the changes all experts agree on, most important first.
2. Note any disagreement in one line each, with your recommendation.
3. Give the full improved prompt in one code block. Keep every requirement of the original; do not invent facts, names or numbers; mark anything you assumed with [ASSUMED].

<<<PROMPT
${promptText}
PROMPT>>>`;
  }

  return { DOMAINS, LIST, byId, initials, eligible, relevance, ranked, pick, findings, panelPrompt, checkKey };
})();
if (typeof module !== 'undefined') module.exports = Reviewers;
