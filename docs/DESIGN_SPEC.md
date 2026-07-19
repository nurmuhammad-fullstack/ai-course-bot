# Mini App dizayn spetsifikatsiyasi

Foydalanuvchi bergan mockup (mobil task-manager: ko'k header-karta, kun chiplari, timeline ro'yxat, "Chose activity" kategoriya kartalari, FAB) uslubiga **1:1**, lekin ko'k → **YASHIL**.

## Ranglar
- Primary (yashil): `#1FA05A`; to'q gradient varianti: `#178A4C`
- Primary yumshoq fon: `#E7F6EE`
- Sahifa foni: `#F1F2F4`
- Karta foni: `#FFFFFF`
- Matn asosiy: `#17212B`; ikkilamchi: `#8A94A6`
- Xato/red: `#E5484D`, ogohlantirish: `#F5A623`
- Kontrast: matnlar 4.5:1 dan yuqori bo'lsin (ikkilamchi matn faqat kichik yordamchi yozuvlarda)

## Shakl tili (mockupdagidek)
- Katta radius: kartalar `border-radius: 24px`, kichik elementlar 14–16px
- Header-karta: to'liq yashil (`#1FA05A`), oq matn, pastki burchaklari 24px, ichida sana + katta sarlavha + oq pill-tugma (masalan «Add New» o'rnida «Darsni yakunlash»)
- Kun chiplari: qator bo'ylab kichik kartochkalar (kun raqami katta, hafta kuni kichik), tanlangani yashil fon + oq matn, qolganlari oq fon
- Ro'yxat (timeline): chap tomonda vaqt/label ustuni, o'ng tomonda oq kartalar; tanlangan/faol qator yashil karta bo'lishi mumkin
- Kategoriya kartalari («Chose activity» uslubi): oq karta, chapda ikonka, nomi qalin, ostida kichik ikkilamchi matn, o'ngda chevron
- FAB: pastki o'ngda yashil kvadrat-yumaloq (radius 16px) «+» tugma
- Soyalar juda yumshoq: `0 8px 24px rgba(23,33,43,0.06)`

## Tipografika
- Poppins (Google Fonts, 400/500/600/700), fallback: system-ui
- Body min 15–16px, sarlavhalar 20–28px semibold

## Qoidalar (majburiy)
- Emoji IKONKA sifatida ishlatilmasin — inline SVG (Lucide uslubi, 24x24 viewBox, stroke 2)
- Barcha bosiladigan elementlarga `cursor:pointer` + 44px min touch target
- O'tishlar 150–300ms (`transition: background-color, box-shadow, opacity`), scale-layout-shift yo'q
- Loading holatlari: skeleton yoki spinner; tugma async paytida disabled
- Xatolar element yonida qizil matn bilan
- `prefers-reduced-motion` hurmat qilinsin
- Faqat mobil (Telegram WebView): max-width 480px markazda, gorizontal scroll yo'q

## Ekranlar

### Umumiy skelet
- Yuqorida yashil header-karta (kontekstga qarab mazmun o'zgaradi)
- Pastda bottom-nav (oq, radius 24px yuqori burchaklar, soyali): rolga qarab tablar
- SPA: bitta `index.html`, vanilla JS, `styles.css`, `app.js` — build talab qilinmasin

### Admin tablar: Bosh / O'quvchilar / Vazifalar / Shop / Inbox
1. **Bosh**: header-kartada bugungi kun + «Bugun dars bor/yo'q, 18:00» + «Darsni yakunlash» pill. Ostida kun chiplari (Du..Ya, dars kunlari belgilangan; chipni bosib vaqtni tahrirlash — kichik modal/inline input). Ostida «Inbox» hisoblagichlari (zaproslar N, topshiriqlar N, buyurtmalar N) kategoriya-karta ko'rinishida.
2. **O'quvchilar**: har biri kategoriya-karta: ism, coin, qoldiq (`800 000 so'm · 8 dars`), davomat (✅3 ❌1 — matn sifatida, emoji emas, kichik SVG + raqam). Bosilganda batafsil (davomat tarixi).
3. **Vazifalar**: ro'yxat (turi belgisi SVG, nomi, coin, faol/nofaol) + FAB «+» → yaratish formasi: tur tanlash (segment), nomi, coin, tavsif; quiz bo'lsa savollar dinamik qo'shiladi (savol, variantlar, to'g'ri javob select).
4. **Shop**: sovg'alar ro'yxati + FAB qo'shish; pastda pending buyurtmalar («Berildi» yashil / «Rad» qizil tugmalar).
5. **Inbox**: zaproslar (Tasdiqlash → O'quvchi | Ota-ona (o'quvchi tanlash bottom-sheet) | Rad), topshiriqlar (matni ko'rinadi, photo/document uchun «Botda ko'ring»; Qabul/Rad), buyurtmalar.

«Darsni yakunlash» oqimi: bosilganda o'quvchilar ro'yxati chiqadi, har birida 3 segment tugma (Keldi / Sababsiz / Ogohlantirgan), belgilagach karta ostida to'lov holati yozuvi ko'rinadi.

### O'quvchi tablar: Bosh / Vazifalar / Shop
1. **Bosh**: header-kartada «Salom, Ism» + katta coin balans. Ostida coin tarixi (timeline uslubida) va davomat.
2. **Vazifalar**: ro'yxat status belgilari bilan; quiz ochilsa savollar birma-bir (variantlar tugma), oxirida natija karta; assignment — tavsif + matn yuborish (textarea) + «rasm/fayl bo'lsa botga yuboring» eslatmasi.
3. **Shop**: balans header'da, sovg'a kartalari, yetarli bo'lmasa qulf holati (opacity + narx qizil emas, shunchaki disabled), sotib olish tasdiq bilan.

### Ota-ona: bitta ekran
Har farzand uchun karta: to'lov progress (12 katakli yoki progress-bar: to'langan yashil), qoldiq summa katta, ostida davomat ro'yxati.

### Pending/guest
Markazda karta: «Botda ro'yxatdan o'ting» + botga qaytish tugmasi (`Telegram.WebApp.close()`).

## Telegram WebApp integratsiyasi
- `<script src="https://telegram.org/js/telegram-web-app.js"></script>`
- Har API so'rovda `X-Init-Data: Telegram.WebApp.initData`
- `Telegram.WebApp.ready(); Telegram.WebApp.expand();`
- Header rangi: `Telegram.WebApp.setHeaderColor('#1FA05A')`
- Tasdiqlar uchun `Telegram.WebApp.showConfirm` ishlatish mumkin, fallback: oddiy confirm
