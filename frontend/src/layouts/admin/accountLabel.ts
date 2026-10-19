import { ROLE_LABELS, type Me } from '@/types/domain'

/** Accessible name for an account-menu trigger. It starts with the visible name (WCAG 2.5.3). */
export function accountLabel(me: Me) {
  return `${me.full_name}, ${ROLE_LABELS[me.role]}: account menu`
}
