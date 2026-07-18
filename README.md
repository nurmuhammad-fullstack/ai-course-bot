# AI Kurs Boti

3 oylik AI kursi uchun Telegram bot: eslatmalar, coin tizimi, coinshop, to'lov nazorati va ota-ona paneli.

**Stack:** NestJS + grammY + Drizzle ORM + Supabase (Postgres)

## Imkoniyatlar

- **Admin:** zaproslarni tasdiqlash (o'quvchi/ota-ona), dars jadvali (Du/Chor/Ju), darsni yakunlash (davomat + to'lov), test/vazifa yaratish, topshiriqlarni tekshirish, coinshop boshqarish, hisobot
- **O'quvchi:** coin balansi, testlar (avtomatik tekshiriladi) va vazifalar (admin tasdiqlaydi), coinshop, davomat
- **Ota-ona:** to'lov holati (1 200 000 so'm / 12 dars, har dars 100 000), farzand davomati
- **Eslatmalar:** dars kunlari ertalab 11:00 va dars boshlanishidan 10 daqiqa oldin (Toshkent vaqti). Dars tugagach adminga davomat/to'lov so'rovi keladi.

## To'lov qoidasi

Har yakunlangan dars uchun 100 000 so'm yechiladi:
- ✅ Keldi — yechiladi
- ❌ Kelmadi (sababsiz, ogohlantirmagan) — baribir yechiladi
- ⚠️ Kelmadi (oldindan ogohlantirgan) — yechilmaydi

Har yechimda ota-onaga qoldiq haqida xabar boradi.

## O'rnatish

1. **Supabase loyiha oching** — [supabase.com](https://supabase.com) → New project. So'ng Project Settings → Database → Connection string → **Transaction pooler** URI ni oling.

2. **.env yarating** (`.env.example` dan nusxa):

```
BOT_TOKEN=...        # @BotFather dan
ADMIN_CHAT_ID=...    # sizning Telegram ID
DATABASE_URL=...     # Supabase transaction pooler URI
```

3. **Jadval yaratish va ishga tushirish:**

```bash
npm install
npm run db:push        # jadvallarni Supabase'ga yaratadi
npm run migrate:sqlite # (ixtiyoriy) eski dars-bot/data/bot.db dan o'quvchilarni ko'chiradi
npm run dev            # lokal ishga tushirish
```

4. **Deploy (Fly.io):**

```bash
fly launch --no-deploy
fly secrets set BOT_TOKEN=... ADMIN_CHAT_ID=... DATABASE_URL=...
fly deploy
```

## Struktura

```
src/
  main.ts                     # kirish nuqtasi
  app.module.ts               # Nest wiring
  config.ts                   # kurs konstantalari (narx, jadval, vaqtlar)
  db/schema.ts                # Drizzle sxema (12 jadval)
  db/db.module.ts             # Postgres ulanish
  repos/*.repo.ts             # ma'lumot qatlami
  bot/bot.service.ts          # grammY + rol bo'yicha routing
  bot/handlers/               # registration, admin, student, parent
  bot/keyboards.ts, format.ts, state.ts
  scheduler/scheduler.service.ts  # cron eslatmalar
scripts/migrate-sqlite.ts     # eski botdan ko'chirish
```
