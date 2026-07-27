# Mini App API kontrakti

Barcha endpointlar `/api/*`. Har bir so'rovda `X-Init-Data` header (Telegram WebApp initData xom satri) bo'lishi shart. Guard: `TgAuthGuard` (src/webapp/auth.guard.ts) imzoni tekshiradi, `req.tgUser` (users jadval qatori yoki null), `req.isAdmin` ni qo'yadi. Admin endpointlarda qo'shimcha `AdminGuard`.

Javoblar JSON. Xato: NestJS standart (`statusCode`, `message`).

## Umumiy

### GET /api/profile
```json
{ "role": "admin|student|parent|pending|guest", "name": "...", "userId": 1 }
```
`guest` — users jadvalida yo'q. `pending` — tasdiqlanmagan.

## Admin (`/api/admin/*`, AdminGuard)

### GET /api/admin/home
```json
{
  "today": { "dayOfWeek": 1, "dayName": "Dushanba", "lessonTime": "18:00", "isLessonDay": true },
  "schedule": [ { "dayOfWeek": 1, "lessonTime": "18:00" }, ... ],
  "counts": { "requests": 2, "submissions": 1, "orders": 0 },
  "studentsCount": 5
}
```

### PUT /api/admin/schedule  body: `{ "dayOfWeek": 1, "lessonTime": "18:30" }` → `{ "ok": true }`

### POST /api/admin/lesson/finish  body: `{}` 
Bugungi darsni yaratadi (yoki mavjudini oladi):
```json
{ "lessonId": 3, "lessonNumber": 4, "date": "2026-07-19",
  "students": [ { "id": 1, "name": "Ali", "attendance": "came|missed_unexcused|missed_excused|null" } ] }
```

### POST /api/admin/attendance  body: `{ "lessonId": 3, "studentId": 1, "status": "came|missed_unexcused|missed_excused" }`
`LessonFlowService.markAttendance` chaqiradi (to'lov + ota-ona xabari avtomatik). Javob:
```json
{ "ok": true, "paymentNote": "...", "remaining": 800000, "lessonsLeft": 8 }
```

### GET /api/admin/requests → `[ { "id": 7, "name": "...", "phone": "...", "username": "..." } ]`
(pending role + name/phone to'ldirilganlar)

### POST /api/admin/requests/:id  body: `{ "action": "student" | "parent" | "reject", "studentId": 1 }`
`parent` uchun `studentId` shart. Tasdiqlanganga Telegram xabar + menyu yuboriladi (NotifyService; menyu yubora olmasa oddiy xabar yetarli — matnda «Botga /start yozing» deyilsin). → `{ "ok": true }`

### GET /api/admin/students
```json
[ { "id": 1, "name": "Ali", "phone": "...", "coins": 30,
    "pay": { "charged": 400000, "chargedCount": 4, "remaining": 800000, "lessonsLeft": 8, "total": 1200000, "lessonsCount": 12 },
    "attendance": { "came": 3, "missed": 1 } } ]
```

### GET /api/admin/tasks → `[ { "id", "type": "quiz|assignment", "title", "coinReward", "isActive", "questionsCount" } ]`

### POST /api/admin/tasks
body: `{ "type": "assignment", "title": "...", "description": "...", "coinReward": 10 }`
yoki `{ "type": "quiz", "title": "...", "coinReward": 10, "questions": [ { "question": "...", "options": ["a","b"], "correctIndex": 0 } ] }`
Yaratib bo'lgach NotifyService orqali o'quvchilarga broadcast. → `{ "ok": true, "id": 5 }`

### POST /api/admin/tasks/:id/deactivate → `{ "ok": true }`

### GET /api/admin/submissions
`[ { "id", "taskTitle", "coinReward", "studentName", "contentType": "text|photo|document", "content": "matn yoki file_id", "createdAt" } ]`
(photo/document uchun frontend «Botda ko'ring» deb ko'rsatadi, content ko'rsatilmaydi)

### POST /api/admin/submissions/:id  body: `{ "action": "approve" | "reject" }`
approve → coin qo'shiladi + o'quvchiga xabar. → `{ "ok": true }`

### GET /api/admin/shop → `{ "items": [ { "id", "name", "price" } ], "orders": [ { "id", "itemName", "price", "studentName" } ] }`
### POST /api/admin/shop  body: `{ "name", "price" }` → broadcast + `{ "ok": true }`
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

### GET /api/tasks
```json
[ { "id", "type", "title", "description", "coinReward",
    "status": "new|pending|approved|rejected|done", "score": "3/5|null",
    "questions": [ { "id", "question", "options": ["...",""] } ] } ]
```
`questions` faqat quiz va hali ishlanmagan bo'lsa. `correctIndex` YUBORILMAYDI!

### POST /api/tasks/:id/quiz  body: `{ "answers": [0,2,1] }`
Server tekshiradi, natijani saqlaydi, coin beradi, adminga xabar:
`{ "score": 2, "total": 3, "coins": 7, "balance": 37 }`

### POST /api/tasks/:id/submit  body: `{ "text": "..." }`
Matnli topshiriq. Adminga Telegram push ham ketadi. → `{ "ok": true }`
(Rasm/fayl topshirish faqat bot chati orqali — frontendda shu eslatma chiqsin.)

### GET /api/shop → `{ "balance": 30, "items": [ { "id", "name", "price" } ] }`
### POST /api/shop/:id/buy → `{ "ok": true, "balance": 20 }` (coin yetmasa 400 + message)

## Ota-ona (`/api/parent`, role=parent)

### GET /api/parent
```json
{ "children": [ { "name": "Ali", "pay": { ... }, "attendance": [ { "lessonDate", "status" } ] } ],
  "schedule": [ { "dayOfWeek": 1, "lessonTime": "18:00" }, ... ] }
```

## Mavjud kod (o'zgartirmasdan foydalanish)
- `src/repos/*.repo.ts` — barcha ma'lumot amallari shu yerda bor
- `src/services/notify.service.ts` — Telegram xabarlar (broadcast, notifyParents, toAdmin)
- `src/services/lesson-flow.service.ts` — davomat + to'lov mantig'i
- `src/webapp/auth.guard.ts` — TgAuthGuard, AdminGuard, @TgUser() dekorator
- `src/config.ts` — COURSE konstantalar, `src/bot/format.ts` — fmtMoney, DAY_NAMES, todayDate
