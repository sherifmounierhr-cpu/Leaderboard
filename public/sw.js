/*
 * Service worker بلا تخزين: وجوده شرط التثبيت كتطبيق على بعض متصفحات
 * أندرويد (Samsung Internet). كل الطلبات تروح للشبكة كما هي — لا نسخة
 * قديمة من اللوحة تتخزّن على شاشة المكتب.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
