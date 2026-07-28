import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, Db } from '../db/db.module';
import { quizQuestions, quizResults, submissions, tasks, users } from '../db/schema';

export type Task = typeof tasks.$inferSelect;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type Submission = typeof submissions.$inferSelect;

@Injectable()
export class TasksRepo {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async create(data: {
    groupId: number;
    type: 'quiz' | 'assignment';
    title: string;
    description?: string;
    coinReward: number;
    isActive?: boolean;
  }): Promise<Task> {
    const rows = await this.db.insert(tasks).values(data).returning();
    return rows[0];
  }

  async activate(taskId: number) {
    await this.db.update(tasks).set({ isActive: true }).where(eq(tasks.id, taskId));
  }

  async deactivate(taskId: number) {
    await this.db.update(tasks).set({ isActive: false }).where(eq(tasks.id, taskId));
  }

  async byId(id: number): Promise<Task | undefined> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id));
    return rows[0];
  }

  async listActive(groupId: number): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.isActive, true), eq(tasks.groupId, groupId)))
      .orderBy(desc(tasks.createdAt));
  }

  async addQuestion(taskId: number, question: string, options: string[], correctIndex: number) {
    await this.db
      .insert(quizQuestions)
      .values({ taskId, question, options: JSON.stringify(options), correctIndex });
  }

  async questions(taskId: number): Promise<QuizQuestion[]> {
    return this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.taskId, taskId))
      .orderBy(quizQuestions.id);
  }

  async quizResult(taskId: number, studentId: number) {
    const rows = await this.db
      .select()
      .from(quizResults)
      .where(and(eq(quizResults.taskId, taskId), eq(quizResults.studentId, studentId)));
    return rows[0];
  }

  /** true — yangi natija saqlandi; false — allaqachon mavjud (takror urinish) */
  async saveQuizResult(
    taskId: number,
    studentId: number,
    score: number,
    total: number,
    coins: number,
  ): Promise<boolean> {
    const rows = await this.db
      .insert(quizResults)
      .values({ taskId, studentId, score, total, coins })
      .onConflictDoNothing()
      .returning();
    return rows.length > 0;
  }

  async upsertSubmission(data: {
    taskId: number;
    studentId: number;
    contentType: string;
    content: string;
  }): Promise<Submission> {
    const rows = await this.db
      .insert(submissions)
      .values(data)
      .onConflictDoUpdate({
        target: [submissions.taskId, submissions.studentId],
        set: { contentType: data.contentType, content: data.content, status: 'pending' },
      })
      .returning();
    return rows[0];
  }

  async submissionById(id: number) {
    const rows = await this.db
      .select({ submission: submissions, task: tasks, student: users })
      .from(submissions)
      .innerJoin(tasks, eq(submissions.taskId, tasks.id))
      .innerJoin(users, eq(submissions.studentId, users.id))
      .where(eq(submissions.id, id));
    return rows[0];
  }

  async setSubmissionStatus(id: number, status: 'approved' | 'rejected') {
    await this.db.update(submissions).set({ status }).where(eq(submissions.id, id));
  }

  async pendingSubmissions(groupId?: number) {
    const where = groupId != null
      ? and(eq(submissions.status, 'pending'), eq(tasks.groupId, groupId))
      : eq(submissions.status, 'pending');
    return this.db
      .select({ submission: submissions, task: tasks, student: users })
      .from(submissions)
      .innerJoin(tasks, eq(submissions.taskId, tasks.id))
      .innerJoin(users, eq(submissions.studentId, users.id))
      .where(where)
      .orderBy(submissions.createdAt);
  }

  async submissionFor(taskId: number, studentId: number): Promise<Submission | undefined> {
    const rows = await this.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.taskId, taskId), eq(submissions.studentId, studentId)));
    return rows[0];
  }
}
