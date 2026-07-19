import { Keyboard } from 'grammy';

export const BTN = {
  // admin
  REQUESTS: '📥 Zaproslar',
  STUDENTS: "👨‍🎓 O'quvchilar",
  SCHEDULE: '🕐 Dars jadvali',
  FINISH_LESSON: '✅ Darsni yakunlash',
  ADD_TASK: "🎯 Vazifa qo'shish",
  SUBMISSIONS: '📤 Topshiriqlar',
  SHOP_ADMIN: '🛍 Coinshop',
  REPORT: '📊 Hisobot',
  PAYMENTS: "💳 To'lovlar",
  // student
  MY_COINS: '💰 Coinlarim',
  TASKS: '🎯 Vazifalar',
  SHOP: '🛍 Coinshop ',
  MY_ATTENDANCE: '📅 Davomatim',
  // parent
  PAYMENT_STATUS: "💳 To'lov holati",
  CHILD_ATTENDANCE: '📅 Farzandim davomati',
  // umumiy
  DONE: '✅ Yakunlash',
  CANCEL: '❌ Bekor qilish',
} as const;

export function adminMenu() {
  return new Keyboard()
    .text(BTN.REQUESTS).text(BTN.STUDENTS).row()
    .text(BTN.SCHEDULE).text(BTN.FINISH_LESSON).row()
    .text(BTN.ADD_TASK).text(BTN.SUBMISSIONS).row()
    .text(BTN.SHOP_ADMIN).text(BTN.REPORT).row()
    .text(BTN.PAYMENTS)
    .resized().persistent();
}

export function studentMenu() {
  return new Keyboard()
    .text(BTN.MY_COINS).text(BTN.TASKS).row()
    .text(BTN.SHOP).text(BTN.MY_ATTENDANCE)
    .resized().persistent();
}

export function parentMenu() {
  return new Keyboard()
    .text(BTN.PAYMENT_STATUS).text(BTN.CHILD_ATTENDANCE)
    .resized().persistent();
}

export function phoneRequestKeyboard() {
  return new Keyboard()
    .requestContact('📱 Raqamni yuborish')
    .resized().oneTime();
}

export function doneCancelKeyboard() {
  return new Keyboard().text(BTN.DONE).row().text(BTN.CANCEL).resized();
}

export function cancelKeyboard() {
  return new Keyboard().text(BTN.CANCEL).resized();
}
