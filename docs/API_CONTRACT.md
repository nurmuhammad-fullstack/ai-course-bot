# Mini App API kontrakti

Barcha endpointlar `/api/*`. Har bir so'rovda `X-Init-Data` header (Telegram WebApp initData xom satri) bo'lishi shart. Guard: `TgAuthGuard` (src/webapp/auth.guard.ts) imzoni tekshiradi, `req.tgUser` (users jadval qatori yoki null), `req.isAdmin` ni qo'yadi. Admin endpointlarda qo'shimcha `AdminGuard`.

Javoblar JSON. Xato: NestJS standart (`statusCode`, `message`).

## Multi-guruh arxitekturasi

Har `courseGroups` yozuvi — mustaqil kichik kurs: o'z jadvali, darslari, narxi, vazifalari. Bitta o'quvchi faqat bitta guruhga tegishli (`users.groupId`). Coinshop (`shopItems`/`shopOrders`) va coin balansi — **umumiy**, guruhdan mustaqil.

Guruh-xos admin endpointlar (`home`, `schedule`, `lesson/finish`, `students`, `tasks`) `groupId` ni GET so'rovda **query param**, POST/PUT'da **body maydoni** sifatida qabul qiladi. Berilmasa, server birinchi faol guruhga ("Asosiy guruh") tushadi. Frontend `state.currentGroupId` ni `adminApi()` wrapper orqali avtomatik qo'shadi (`public/app.js`).

Student/parent endpointlarda `groupId` **hech qachon clientdan kelmaydi** — har doim `req.tgUser.groupId` (yoki ota-ona uchun bolaning guruhi) dan serverda aniqlanadi.

`/api/admin/shop*`, `/api/admin/orders/:id`, `/api/shop*` — **guruhga bog'liq emas**, o'zgarishsiz umumiy.

## Umumiy

### GET /api/profile
```json
{ "role": "admin|student|parent|pending|guest", "name": "...", "userId": 1 }
```
`guest` — users jadvalida yo'q. `pending` — tasdiqlanmagan.

## Guruhlar (`/api/admin/groups`, AdminGuard)

### GET /api/admin/groups → `[ { "id": 1, "name": "Asosiy guruh", "totalPrice": 1200000, "lessonsCount": 12, "telegramChatId": "-100...", "isActive": true } ]`

### POST /api/admin/groups
body: `{ "name": "Kechki guruh", "totalPrice": 1200000, "lessonsCount": 12, "telegramChatId": "-100..." }`
Yaratilgach `LessonsRepo.seedSchedule(newGroup.id)` avtomatik chaqiriladi (standart Du/Chor/Ju 18:00). → yaratilgan guruh obyekti.

### PUT /api/admin/groups/:id
body (barchasi ixtiyoriy): `{ "name", "totalPrice", "lessonsCount", "telegramChatId" }` → yangilangan guruh obyekti.

## Admin (`/api/admin/*`, AdminGuard)

### GET /api/admin/home?groupId=1
```json
{
  "today": { "dayOfWeek": 1, "dayName": "Dushanba", "lessonTime": "18:00", "isLessonDay": true },
  "schedule": [ { "dayOfWeek": 1, "lessonTime": "18:00" }, ... ],
  "counts": { "requests": 2, "submissions": 1, "orders": 0 },
  "studentsCount": 5,
  "totalCoins": 340
}
```
`counts.requests` va `totalCoins` — barcha guruhlar bo'yicha umumiy (zaproslar hali guruhga tegishli emas, coin — umumiy). Qolgani `groupId` bo'yicha.

### PUT /api/admin/schedule  body: `{ "groupId": 1, "dayOfWeek": 1, "lessonTime": "18:30" }` → `{ "ok": true }`

### POST /api/admin/lesson/finish  body: `{ "groupId": 1 }`
Bugungi darsni yaratadi (yoki mavjudini oladi), shu guruh doirasida raqamlanadi:
```json
{ "lessonId": 3, "lessonNumber": 4, "date": "2026-07-19",
  "students": [ { "id": 1, "name": "Ali", "attendance": "came|missed_unexcused|missed_excused|null" } ] }
```

### POST /api/admin/attendance  body: `{ "lessonId": 3, "studentId": 1, "status": "came|missed_unexcused|missed_excused" }`
`groupId` kerak emas — `lessonId` orqali serverda aniqlanadi (xavfsizlik: client guruhni almashtirolmaydi). `LessonFlowService.markAttendance` chaqiradi (to'lov + ota-ona xabari avtomatik, dars narxi shu talabaning guruh profilidan). Javob:
```json
{ "ok": true, "paymentNote": "...", "remaining": 800000, "lessonsLeft": 8 }
```

### GET /api/admin/requests → `[ { "id": 7, "name": "...", "phone": "...", "username": "..." } ]`
(pending role + name/phone to'ldirilganlar, barcha guruhlar — hali guruh tayinlanmagan)

### POST /api/admin/requests/:id  body: `{ "action": "student" | "parent" | "reject", "studentId": 1, "groupId": 1 }`
`student` uchun `groupId` shart (yangi o'quvchi shu guruhga bog'lanadi, `payments.ensure` shu guruh narxidan profil yaratadi). `parent` uchun `studentId` shart (guruhi kerak emas — o'sha o'quvchining guruhiga avtomatik mos keladi). Tasdiqlanganga Telegram xabar boradi (matnda «Botga /start yozing»). → `{ "ok": true }`

### GET /api/admin/students?groupId=1
```json
[ { "id": 1, "name": "Ali", "phone": "...", "hasParent": true, "parentNames": ["..."], "coins": 30,
    "pay": { "charged": 400000, "chargedCount": 4, "remaining": 800000, "lessonsLeft": 8, "total": 1200000, "lessonsCount": 12, "dueDay": 5 },
    "attendance": { "came": 3, "missed": 1 } } ]
```
`?allGroups=1` bersa `groupId` e'tiborga olinmaydi, **barcha guruhlardan** o'quvchilar qaytadi (ota-ona bog'lash oqimida ishlatiladi — `openStudentPicker`).

### GET /api/admin/students/:id/coins, POST /api/admin/students/:id/coins, POST /api/admin/students/:id/delete
O'zgarishsiz — studentId orqali, guruhdan mustaqil.

### PUT /api/admin/payments/:studentId  body: `{ "dueDay": 5 | null }` — o'zgarishsiz, studentId orqali.

### GET /api/admin/tasks?groupId=1 → `[ { "id", "type": "quiz|assignment", "title", "coinReward", "isActive", "questionsCount" } ]`

### POST /api/admin/tasks
body: `{ "groupId": 1, "type": "assignment", "title": "...", "description": "...", "coinReward": 10 }`
yoki `{ "groupId": 1, "type": "quiz", "title": "...", "coinReward": 10, "questions": [ { "question": "...", "options": ["a","b"], "correctIndex": 0 } ] }`
`groupId` berilmasa serverda birinchi faol guruhga tushadi. Yaratib bo'lgach NotifyService orqali **shu guruh** o'quvchilariga broadcast. → `{ "ok": true, "id": 5 }`

### POST /api/admin/tasks/:id/deactivate → `{ "ok": true }`

### GET /api/admin/submissions?groupId=1
`[ { "id", "taskTitle", "coinReward", "studentName", "contentType": "text|photo|document", "content": "matn yoki file_id", "createdAt" } ]`
`groupId` berilmasa barcha guruhlardan (ixtiyoriy filtr). (photo/document uchun frontend «Botda ko'ring» deb ko'rsatadi, content ko'rsatilmaydi)

### POST /api/admin/submissions/:id  body: `{ "action": "approve" | "reject" }`
approve → coin qo'shiladi + o'quvchiga xabar. → `{ "ok": true }`

### GET /api/admin/shop → `{ "items": [ { "id", "name", "price", "icon", "imageUrl", "description" } ], "orders": [ { "id", "itemName", "price", "studentName" } ] }` (umumiy, guruhga bog'liq emas)
### POST /api/admin/shop  body: `{ "name", "price", "icon", "description" }` → broadcast (barcha guruhlarga) + `{ "ok": true }`
### POST /api/admin/shop/:id/deactivate → `{ "ok": true }`
### POST /api/admin/orders/:id  body: `{ "action": "give" | "reject" }` (reject → coin qaytadi) → `{ "ok": true }`

## O'quvchi (`/api/*`, role=student bo'lishi shart)

### GET /api/me
```json
{ "name": "...", "coins": 30,
  "history": [ { "amount": 10, "reason": "...", "createdAt": "..." } ],
  "pay": { ...GET /api/admin/students dagi pay bilan bir xil... },
  "attendance": [ { "lessonDate": "2026-07-14", "status": "came" } ],
  "schedule": [ { "dayOfWeek": 1, "lessonTime": "18:00" }, ... ] }
```
`schedule` — talabaning **o'z guruhi** jadvali (`req.tgUser.groupId` orqali, clientdan kelmaydi).

### GET /api/tasks
```json
[ { "id", "type", "title", "description", "coinReward",
    "status": "new|pending|approved|rejected|done", "score": "3/5|null",
    "questions": [ { "id", "question", "options": ["...",""] } ] } ]
```
Faqat talabaning **o'z guruhi** vazifalari. `questions` faqat quiz va hali ishlanmagan bo'lsa. `correctIndex` YUBORILMAYDI!

### POST /api/tasks/:id/quiz  body: `{ "answers": [0,2,1] }`
Server tekshiradi, natijani saqlaydi, coin beradi, adminga xabar:
`{ "score": 2, "total": 3, "coins": 7, "balance": 37 }`

### POST /api/tasks/:id/submit  body: `{ "text": "..." }`
Matnli topshiriq. Adminga Telegram push ham ketadi. → `{ "ok": true }`
(Rasm/fayl topshirish faqat bot chati orqali — frontendda shu eslatma chiqsin.)

### GET /api/shop → `{ "balance": 30, "items": [ { "id", "name", "price", "icon", "imageUrl", "description" } ] }` (umumiy)
### POST /api/shop/:id/buy → `{ "ok": true, "balance": 20 }` (coin yetmasa 400 + message)

## Ota-ona (`/api/parent`, role=parent)

### GET /api/parent
```json
{ "children": [ { "name": "Ali", "coins": 30, "pay": { ... },
    "attendance": [ { "lessonDate", "status" } ],
    "schedule": [ { "dayOfWeek": 1, "lessonTime": "18:00" }, ... ] } ] }
```
`schedule` endi **har bola ichida** (bir nechta bola turli guruhda bo'lishi mumkin — har biri o'z guruh jadvalini ko'radi). Tashqi `data.schedule` maydoni **olib tashlandi**.

## Mavjud kod (o'zgartirmasdan foydalanish)
- `src/repos/*.repo.ts` — barcha ma'lumot amallari shu yerda bor
- `src/repos/course-groups.repo.ts` — kurs-guruh CRUD (list/byId/create/update/deactivate)
- `src/services/notify.service.ts` — Telegram xabarlar (broadcast, notifyParents, toAdmin)
- `src/services/lesson-flow.service.ts` — davomat + to'lov mantig'i (guruh narxidan dars narxini hisoblaydi)
- `src/webapp/auth.guard.ts` — TgAuthGuard, AdminGuard, @TgUser() dekorator
- `src/config.ts` — SCHEDULE_DEFAULTS, `src/bot/format.ts` — fmtMoney, DAY_NAMES, todayDate

## Telegram chat kuzatuvi vs kurs-guruh — muhim farq
`src/repos/groups.repo.ts` (`groups` jadvali) — bu bot qo'shilgan **Telegram chatlar** ro'yxati (`my_chat_member` orqali avtomatik), kurs-guruh bilan aloqasi yo'q. Kurs-guruh — `courseGroups` (`course-groups.repo.ts`). Bog'lanish: `courseGroups.telegramChatId` maydoni `groups` ro'yxatidan tanlanadi (uyga vazifa shu chatga yuboriladi).
