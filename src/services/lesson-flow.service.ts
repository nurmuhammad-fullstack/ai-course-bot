import { Injectable } from '@nestjs/common';
import { LessonsRepo } from '../repos/lessons.repo';
import { PaymentsRepo } from '../repos/payments.repo';
import { UsersRepo } from '../repos/users.repo';
import { NotifyService } from './notify.service';
import { SettingsRepo } from '../repos/settings.repo';
import { CourseGroupsRepo } from '../repos/course-groups.repo';
import { StateStore } from '../bot/state';
import { fmtMoney } from '../bot/format';

export type AttStatus = 'came' | 'missed_unexcused' | 'missed_excused';

/**
 * Davomat + to'lov mantig'i — bot va mini app ikkalasi ham shu servisdan foydalanadi.
 * came / missed_unexcused → dars narxi (guruhning total/lessonsCount) yechiladi, missed_excused → yechilmaydi.
 * Har o'zgarishda ota-onaga xabar ketadi.
 */
@Injectable()
export class LessonFlowService {
  /** Uyga vazifa so'ralgan darslar (takror so'ramaslik uchun) */
  private readonly homeworkPrompted = new Set<number>();

  constructor(
    private readonly users: UsersRepo,
    private readonly lessons: LessonsRepo,
    private readonly payments: PaymentsRepo,
    private readonly notify: NotifyService,
    private readonly state: StateStore,
    private readonly settings: SettingsRepo,
    private readonly courseGroups: CourseGroupsRepo,
  ) {}

  async markAttendance(lessonId: number, studentId: number, status: AttStatus) {
    const student = await this.users.byId(studentId);
    const lesson = await this.lessons.lessonById(lessonId);
    if (!student || !lesson) throw new Error('Topilmadi');

    await this.lessons.setAttendance(lessonId, studentId, status);
    const n = await this.lessons.lessonNumber(lesson.groupId, lesson);
    const pay0 = await this.payments.status(studentId);
    const lessonPrice = Math.round(pay0.total / pay0.lessonsCount);

    let paymentNote: string;
    if (status === 'came' || status === 'missed_unexcused') {
      const newCharge = await this.payments.charge(lessonId, studentId, lessonPrice);
      const pay = await this.payments.status(studentId);
      paymentNote = `💳 ${fmtMoney(lessonPrice)} yechildi. Qoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`;
      if (newCharge) {
        const reason =
          status === 'came'
            ? `${n}-dars bo'lib o'tdi`
            : `${n}-dars (kelmadi, oldindan ogohlantirilmagan)`;
        await this.notify.notifyParents(
          studentId,
          `💳 ${student.name}: ${reason}.\n${fmtMoney(lessonPrice)} hisobdan yechildi.\n\nQoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars qoldi)`,
        );
      }
      await this.maybeAskHomework(lesson.groupId, lessonId, n);
      return { student, n, paymentNote, pay };
    }

    const removed = await this.payments.uncharge(lessonId, studentId);
    const pay = await this.payments.status(studentId);
    paymentNote = `💳 To'lov yechilmadi. Qoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars)`;
    await this.notify.notifyParents(
      studentId,
      `⚠️ ${student.name}: ${n}-darsga kela olmasligini oldindan ogohlantirgan.\nBu dars uchun to'lov yechilmadi.${removed ? ' (Avvalgi yechilgan summa qaytarildi.)' : ''}\n\nQoldiq: ${fmtMoney(pay.remaining)} (${pay.lessonsLeft} ta dars qoldi)`,
    );
    await this.maybeAskHomework(lesson.groupId, lessonId, n);
    return { student, n, paymentNote, pay };
  }

  /** Barcha o'quvchilar davomati belgilangach admindan uyga vazifa so'raydi (bir marta), shu guruh uchun */
  private async maybeAskHomework(groupId: number, lessonId: number, lessonNumber: number) {
    if (this.homeworkPrompted.has(lessonId)) return;
    const [students, marked] = await Promise.all([
      this.users.listByRole('student', groupId),
      this.lessons.attendanceForLesson(lessonId),
    ]);
    if (!students.length || students.some((s) => !marked.has(s.id))) return;

    this.homeworkPrompted.add(lessonId);
    const group = await this.courseGroups.byId(groupId);
    this.state.set(this.notify.adminChatId, {
      step: 'homework_text',
      lessonId,
      lessonNumber,
      groupId,
    });
    // 1 soatlik eslatma uchun kutilayotgan vazifani belgilab qo'yamiz (har guruh mustaqil)
    await this.settings.set(
      `homework_pending:${groupId}`,
      JSON.stringify({ lessonId, lessonNumber, groupId, askedAt: Date.now(), lastRemind: 0 }),
    );
    await this.notify.toAdmin(
      `✅ «${group?.name ?? 'Guruh'}» — ${lessonNumber}-dars davomati to'liq belgilandi!\n\n📝 Endi uyga vazifani yozib yuboring — men uni chiroyli formatda o'quvchilar guruhiga tashlayman.\n\n(Kerak bo'lmasa «❌ Bekor qilish» deb yozing)`,
    );
  }
}
