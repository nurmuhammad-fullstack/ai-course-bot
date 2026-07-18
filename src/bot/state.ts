import { Injectable } from '@nestjs/common';

export interface ChatState {
  step: string;
  [key: string]: unknown;
}

/** Oddiy in-memory suhbat holati (forma bosqichlari uchun) */
@Injectable()
export class StateStore {
  private readonly map = new Map<string, ChatState>();

  get(chatId: string): ChatState | undefined {
    return this.map.get(chatId);
  }

  set(chatId: string, state: ChatState) {
    this.map.set(chatId, state);
  }

  clear(chatId: string) {
    this.map.delete(chatId);
  }
}
