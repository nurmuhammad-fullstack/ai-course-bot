import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  unique,
} from 'drizzle-orm/pg-core';

// role: 'pending' | 'student' | 'parent' | 'admin'
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: text('telegram_id').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  username: text('username'),
  role: text('role').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const parentLinks = pgTable(
  'parent_links',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.parentId, t.studentId)],
);

// Du/Chor/Ju jadvali: dayOfWeek 1=Dushanba ... 0=Yakshanba
export const schedule = pgTable('schedule', {
  id: serial('id').primaryKey(),
  dayOfWeek: integer('day_of_week').notNull().unique(),
  lessonTime: text('lesson_time').notNull(), // "18:00"
});

// Bo'lib o'tgan (admin tasdiqlagan) darslar
export const courseLessons = pgTable('course_lessons', {
  id: serial('id').primaryKey(),
  lessonDate: date('lesson_date').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// status: 'came' | 'missed_unexcused' | 'missed_excused'
export const attendance = pgTable(
  'attendance',
  {
    id: serial('id').primaryKey(),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => courseLessons.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
  },
  (t) => [unique().on(t.lessonId, t.studentId)],
);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  total: integer('total').notNull(),
  lessonsCount: integer('lessons_count').notNull(),
  dueDate: date('due_date'), // keyingi to'lov sanasi (eslatma uchun)
});

export const paymentCharges = pgTable(
  'payment_charges',
  {
    id: serial('id').primaryKey(),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => courseLessons.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.lessonId, t.studentId)],
);

// type: 'quiz' | 'assignment'
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  coinReward: integer('coin_reward').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const quizQuestions = pgTable('quiz_questions', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  options: text('options').notNull(), // JSON array of strings
  correctIndex: integer('correct_index').notNull(),
});

// status: 'pending' | 'approved' | 'rejected'
export const submissions = pgTable(
  'submissions',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(), // 'text' | 'photo' | 'document'
    content: text('content').notNull(), // matn yoki telegram file_id
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.taskId, t.studentId)],
);

export const quizResults = pgTable(
  'quiz_results',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    total: integer('total').notNull(),
    coins: integer('coins').notNull(),
  },
  (t) => [unique().on(t.taskId, t.studentId)],
);

export const coinTransactions = pgTable('coin_transactions', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // + kirim, - chiqim
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const shopItems = pgTable('shop_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

// kalit-qiymat sozlamalar (masalan group_chat_id)
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// status: 'pending' | 'given' | 'rejected'
export const shopOrders = pgTable('shop_orders', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .notNull()
    .references(() => shopItems.id, { onDelete: 'cascade' }),
  studentId: integer('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
