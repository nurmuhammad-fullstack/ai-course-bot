import { createHmac } from 'crypto';

/**
 * Telegram Mini App initData imzosini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): { userId: string } | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expected !== hash) return null;

    const authDate = parseInt(params.get('auth_date') ?? '0', 10);
    if (!authDate || Date.now() / 1000 - authDate > 24 * 60 * 60) return null; // 24 soat

    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    return { userId: String(user.id) };
  } catch {
    return null;
  }
}
