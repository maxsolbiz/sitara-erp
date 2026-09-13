/**
 * Centralized account codes for journal entry generation.
 * These are the only place account codes are defined as strings.
 */
export const ACCOUNT_CODES = {
  SALES_REVENUE: '4000',
  SALES_RETURNS: '4100',
  ACCOUNTS_PAYABLE: '2000',
  CASH_ON_HAND: '1000',
  BANK_ACCOUNT: '1010',
  ACCOUNTS_RECEIVABLE: '1100',
  COST_OF_GOODS_SOLD: '5000',
  INVENTORY: '1200',
  LOANS_RECEIVABLE: '1300',
  LOANS_PAYABLE: '2100',
} as const;
