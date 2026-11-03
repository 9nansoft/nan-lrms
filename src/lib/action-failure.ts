// src/lib/action-failure.ts
// One wording for "an action failed" across admin and profile (constitution V:
// what happened + what to do). Rendered through ErrorState variant="banner",
// which prefixes the remedy with "วิธีแก้:".
export const DEFAULT_ACTION_REMEDY =
  'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลระบบพร้อมข้อความนี้';

export interface ActionFailure {
  message: string;
  remedy: string;
}

/** `action` reads as the Thai phrase before "ไม่สำเร็จ": a bare verb ("บันทึก")
 *  joins directly; a phrase with an object ("ลบ รพ.น่าน") gets a space. */
export function actionFailure(action: string, detail?: string | null, remedy = DEFAULT_ACTION_REMEDY): ActionFailure {
  const head = action.trim();
  const message = `${head}${/\s/.test(head) ? ' ' : ''}ไม่สำเร็จ${detail ? `: ${detail}` : ''}`;
  return { message, remedy };
}
