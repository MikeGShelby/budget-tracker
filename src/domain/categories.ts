import type { CategoryId, EventDirection } from './types'

export interface Category {
  id: CategoryId
  label: string
  /** Which side of the ledger this category normally belongs to. */
  direction: EventDirection
  /** Key into the icon set in `src/components/ui/Icon.tsx`. */
  icon: string
  /** Hue used to tint the category chip, in CSS `oklch` hue degrees. */
  hue: number
  /** Grouping header shown in the category picker. */
  group: string
}

export const CATEGORIES: readonly Category[] = [
  // ── Income ──────────────────────────────────────────────────────────────
  { id: 'paycheck', label: 'Paycheck', direction: 'income', icon: 'wallet', hue: 155, group: 'Income' },
  { id: 'bonus', label: 'Bonus', direction: 'income', icon: 'sparkle', hue: 150, group: 'Income' },
  { id: 'freelance', label: 'Freelance', direction: 'income', icon: 'briefcase', hue: 165, group: 'Income' },
  { id: 'refund', label: 'Refund', direction: 'income', icon: 'undo', hue: 172, group: 'Income' },
  { id: 'interest', label: 'Interest', direction: 'income', icon: 'trend-up', hue: 145, group: 'Income' },
  { id: 'gift', label: 'Gift', direction: 'income', icon: 'gift', hue: 180, group: 'Income' },
  { id: 'other-income', label: 'Other income', direction: 'income', icon: 'plus-circle', hue: 160, group: 'Income' },

  // ── Housing ─────────────────────────────────────────────────────────────
  { id: 'mortgage', label: 'Mortgage', direction: 'expense', icon: 'home', hue: 25, group: 'Housing' },
  { id: 'rent', label: 'Rent', direction: 'expense', icon: 'key', hue: 30, group: 'Housing' },
  { id: 'utilities', label: 'Utilities', direction: 'expense', icon: 'bolt', hue: 60, group: 'Housing' },
  { id: 'internet', label: 'Internet', direction: 'expense', icon: 'wifi', hue: 220, group: 'Housing' },
  { id: 'phone', label: 'Phone', direction: 'expense', icon: 'phone', hue: 230, group: 'Housing' },

  // ── Debt ────────────────────────────────────────────────────────────────
  { id: 'credit-card', label: 'Credit card', direction: 'expense', icon: 'card', hue: 5, group: 'Debt' },
  { id: 'loan', label: 'Loan', direction: 'expense', icon: 'bank', hue: 15, group: 'Debt' },
  { id: 'car-payment', label: 'Car payment', direction: 'expense', icon: 'car', hue: 40, group: 'Debt' },

  // ── Living ──────────────────────────────────────────────────────────────
  { id: 'groceries', label: 'Groceries', direction: 'expense', icon: 'cart', hue: 100, group: 'Living' },
  { id: 'dining', label: 'Dining out', direction: 'expense', icon: 'utensils', hue: 45, group: 'Living' },
  { id: 'transport', label: 'Transport', direction: 'expense', icon: 'bus', hue: 250, group: 'Living' },
  { id: 'insurance', label: 'Insurance', direction: 'expense', icon: 'shield', hue: 200, group: 'Living' },
  { id: 'medical', label: 'Medical', direction: 'expense', icon: 'heart', hue: 350, group: 'Living' },
  { id: 'childcare', label: 'Childcare', direction: 'expense', icon: 'child', hue: 320, group: 'Living' },
  { id: 'education', label: 'Education', direction: 'expense', icon: 'book', hue: 265, group: 'Living' },
  { id: 'subscription', label: 'Subscriptions', direction: 'expense', icon: 'repeat', hue: 290, group: 'Living' },
  { id: 'shopping', label: 'Shopping', direction: 'expense', icon: 'bag', hue: 310, group: 'Living' },
  { id: 'travel', label: 'Travel', direction: 'expense', icon: 'plane', hue: 210, group: 'Living' },
  { id: 'savings', label: 'Savings', direction: 'expense', icon: 'piggy', hue: 185, group: 'Living' },
  { id: 'other-expense', label: 'Other expense', direction: 'expense', icon: 'minus-circle', hue: 240, group: 'Living' },
] as const

const BY_ID = new Map<CategoryId, Category>(CATEGORIES.map((c) => [c.id, c]))

const FALLBACK: Record<EventDirection, CategoryId> = {
  income: 'other-income',
  expense: 'other-expense',
}

export function getCategory(id: CategoryId): Category {
  const found = BY_ID.get(id)
  if (found) return found
  // Stored data can outlive a category being renamed away; never crash a render.
  return BY_ID.get(FALLBACK.expense) as Category
}

export function categoriesFor(direction: EventDirection): Category[] {
  return CATEGORIES.filter((c) => c.direction === direction)
}

/** Picker groups, in display order, for one side of the ledger. */
export function categoryGroupsFor(direction: EventDirection): Array<{ group: string; items: Category[] }> {
  const groups: Array<{ group: string; items: Category[] }> = []
  for (const category of categoriesFor(direction)) {
    let bucket = groups.find((g) => g.group === category.group)
    if (!bucket) {
      bucket = { group: category.group, items: [] }
      groups.push(bucket)
    }
    bucket.items.push(category)
  }
  return groups
}

export function defaultCategoryFor(direction: EventDirection): CategoryId {
  return FALLBACK[direction]
}
