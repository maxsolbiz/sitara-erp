import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenantContext } from '../lib/prisma';
import { rbacMiddleware } from '../middleware/rbac';
import { ACCOUNT_CODES } from '../constants/accounts';
import { parseIdParam, requireAuthUserId } from '../utils/helpers';
import logger from '../utils/logger';

const router = Router();

// Reject malformed numeric IDs with 400 instead of 500/P2025 downstream
// (BigInt('') silently coerces to 0n; BigInt('abc') throws).
router.param('id', (req, res, next, val) => {
  if (parseIdParam(val) === null) {
    res.status(400).json({ status: 400, title: 'Bad Request', detail: 'Invalid id parameter' });
    return;
  }
  next();
});

// ---- Loan Parties ----
router.get('/parties', rbacMiddleware('loans.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const parties = await prisma.loanParty.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: 'asc' }, include: { _count: { select: { loansGiven: true, loansTaken: true } } } });
    res.json({ data: parties.map((p) => ({ id: p.id.toString(), name: p.name, phone: p.phone, email: p.email, type: p.type, cnic: p.cnic, isActive: p.isActive, loansGivenCount: p._count.loansGiven, loansTakenCount: p._count.loansTaken })) });
  } catch { res.json({ data: [] }); }
});

router.post('/parties', rbacMiddleware('loans.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { name, phone, email, address, type, cnic } = req.body;
    if (!name) { res.status(400).json({ status: 400, detail: 'Name required' }); return; }
    const party = await prisma.loanParty.create({ data: { tenantId: ctx.tenantId, name, phone: phone || null, email: email || null, address: address || null, type: type || 'INDIVIDUAL', cnic: cnic || null } });
    res.status(201).json({ data: { id: party.id.toString(), name: party.name } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

// ---- Loans ----
router.get('/stats', rbacMiddleware('loans.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: {} }); return; }
    const loans = await prisma.loan.findMany({ where: { tenantId: ctx.tenantId } });
    let totalGiven = 0, totalTaken = 0, totalReceivable = 0, totalPayable = 0;
    for (const l of loans) {
      if (l.type === 'GIVEN') { totalGiven += Number(l.principalAmount); totalReceivable += Number(l.remainingAmount); }
      else { totalTaken += Number(l.principalAmount); totalPayable += Number(l.remainingAmount); }
    }
    res.json({ data: { totalGiven, totalTaken, totalReceivable, totalPayable } });
  } catch { res.json({ data: {} }); }
});

router.get('/', rbacMiddleware('loans.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.json({ data: [] }); return; }
    const where: any = { tenantId: ctx.tenantId };
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.partyId) { where.OR = [{ borrowerId: BigInt(req.query.partyId as string) }, { lenderId: BigInt(req.query.partyId as string) }]; }
    const loans = await prisma.loan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { borrower: { select: { name: true } }, lender: { select: { name: true } } } });
    res.json({ data: loans.map((l) => ({ id: l.id.toString(), loanNumber: l.loanNumber, type: l.type, partyName: l.borrower?.name || l.lender?.name || '', principalAmount: Number(l.principalAmount), interestRate: Number(l.interestRate), startDate: l.startDate, dueDate: l.dueDate, status: l.status, totalPaid: Number(l.totalPaid), remainingAmount: Number(l.remainingAmount) })) });
  } catch { res.json({ data: [] }); }
});

router.get('/:id', rbacMiddleware('loans.view'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const loan = await prisma.loan.findFirst({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, include: { borrower: { select: { name: true, phone: true } }, lender: { select: { name: true, phone: true } }, payments: { orderBy: { paymentDate: 'desc' } } } });
    if (!loan) { res.status(404).json({ status: 404 }); return; }
    res.json({ data: { id: loan.id.toString(), loanNumber: loan.loanNumber, type: loan.type, partyName: loan.borrower?.name || loan.lender?.name || '', partyPhone: loan.borrower?.phone || loan.lender?.phone || '', principalAmount: Number(loan.principalAmount), interestRate: Number(loan.interestRate), startDate: loan.startDate, dueDate: loan.dueDate, status: loan.status, notes: loan.notes, totalPaid: Number(loan.totalPaid), remainingAmount: Number(loan.remainingAmount), payments: loan.payments.map((p) => ({ id: p.id.toString(), amount: Number(p.amount), paymentDate: p.paymentDate, paymentMethod: p.paymentMethod, notes: p.notes })) } });
  } catch { res.status(500).json({ status: 500 }); }
});

router.post('/', rbacMiddleware('loans.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { type, partyId, principalAmount, interestRate, startDate, dueDate, notes } = req.body;
    if (!type || !principalAmount || principalAmount <= 0) { res.status(400).json({ status: 400, detail: 'Type and positive amount required' }); return; }
    const tenantId = ctx.tenantId;
    // FK ownership: the loan party must belong to this tenant.
    if (partyId) {
      const party = await prisma.loanParty.findFirst({ where: { id: BigInt(partyId), tenantId }, select: { id: true } });
      if (!party) { res.status(403).json({ status: 403, detail: 'Loan party not found or not accessible' }); return; }
    }
    const loanNumber = `LN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const result = await prisma.$transaction(async (tx: any) => {
      const loan = await tx.loan.create({
        data: { tenantId, loanNumber, type: type.toUpperCase(), borrowerId: type === 'GIVEN' ? BigInt(partyId) : null, lenderId: type === 'TAKEN' ? BigInt(partyId) : null, principalAmount, interestRate: interestRate || 0, startDate: startDate ? new Date(startDate) : new Date(), dueDate: dueDate ? new Date(dueDate) : null, status: 'ACTIVE', remainingAmount: principalAmount },
      });
      const [cashAcct, loansRecAcct, loansPayAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.LOANS_RECEIVABLE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.LOANS_PAYABLE } } }),
      ]);
      const amt = Number(principalAmount);
      if (cashAcct && loansRecAcct && type === 'GIVEN') {
        await tx.journalEntry.create({
          data: { tenantId, entryNumber: 'LN-' + loanNumber.replace('LN-', ''), entryDate: new Date(), description: 'Loan given ' + loanNumber, totalDebit: amt, totalCredit: amt, createdBy: requireAuthUserId(req),
            lines: { create: [{ tenantId, accountId: loansRecAcct.id, debitAmount: amt, creditAmount: 0, description: 'Loan given' }, { tenantId, accountId: cashAcct.id, debitAmount: 0, creditAmount: amt, description: 'Cash disbursement' }] },
          },
        });
      }
      if (cashAcct && loansPayAcct && type === 'TAKEN') {
        await tx.journalEntry.create({
          data: { tenantId, entryNumber: 'LN-' + loanNumber.replace('LN-', ''), entryDate: new Date(), description: 'Loan taken ' + loanNumber, totalDebit: amt, totalCredit: amt, createdBy: requireAuthUserId(req),
            lines: { create: [{ tenantId, accountId: cashAcct.id, debitAmount: amt, creditAmount: 0, description: 'Loan received' }, { tenantId, accountId: loansPayAcct.id, debitAmount: 0, creditAmount: amt, description: 'Loan payable' }] },
          },
        });
      }
      return loan;
    });
    res.status(201).json({ data: { id: result.id.toString(), loanNumber } });
  } catch (error: any) { logger.error('Loan create failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

router.put('/:id', rbacMiddleware('loans.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const { notes, status } = req.body;
    const data: any = {};
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) data.status = status;
    await prisma.loan.updateMany({ where: { id: BigInt(req.params.id), tenantId: ctx.tenantId }, data });
    res.json({ data: { message: 'Loan updated' } });
  } catch (error: any) { res.status(500).json({ status: 500, detail: error.message }); }
});

router.post('/:id/payments', rbacMiddleware('loans.manage'), async (req: Request, res: Response) => {
  try {
    const ctx = getTenantContext(); if (!ctx) { res.status(401).json({ status: 401 }); return; }
    const tenantId = ctx.tenantId;
    const loan = await prisma.loan.findFirst({ where: { id: BigInt(req.params.id), tenantId } });
    if (!loan) { res.status(404).json({ status: 404, detail: 'Loan not found' }); return; }
    const { amount, paymentDate, paymentMethod, notes } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ status: 400, detail: 'Positive amount required' }); return; }
    const payAmount = Number(amount);
    await prisma.$transaction(async (tx: any) => {
      await tx.loanPayment.create({ data: { tenantId, loanId: loan.id, amount: payAmount, paymentDate: paymentDate ? new Date(paymentDate) : new Date(), paymentMethod: paymentMethod || 'CASH', notes: notes || null } });
      const newTotalPaid = Number(loan.totalPaid) + payAmount;
      const newRemaining = Math.max(0, Number(loan.remainingAmount) - payAmount);
      const newStatus = newRemaining <= 0 ? 'PAID' : 'ACTIVE';
      await tx.loan.update({ where: { id: loan.id }, data: { totalPaid: newTotalPaid, remainingAmount: newRemaining, status: newStatus } });
      const [cashAcct, loansRecAcct, loansPayAcct] = await Promise.all([
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.CASH_ON_HAND } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.LOANS_RECEIVABLE } } }),
        tx.chartOfAccount.findUnique({ where: { tenantId_accountCode: { tenantId, accountCode: ACCOUNT_CODES.LOANS_PAYABLE } } }),
      ]);
      if (loan.type === 'GIVEN' && cashAcct && loansRecAcct) {
        await tx.journalEntry.create({
          data: { tenantId, entryNumber: 'LNP-' + String(Date.now()), entryDate: new Date(), description: 'Loan payment received ' + loan.loanNumber, totalDebit: payAmount, totalCredit: payAmount, createdBy: requireAuthUserId(req),
            lines: { create: [{ tenantId, accountId: cashAcct.id, debitAmount: payAmount, creditAmount: 0, description: 'Payment received' }, { tenantId, accountId: loansRecAcct.id, debitAmount: 0, creditAmount: payAmount, description: 'Loan receivable reduction' }] },
          },
        });
      }
      if (loan.type === 'TAKEN' && cashAcct && loansPayAcct) {
        await tx.journalEntry.create({
          data: { tenantId, entryNumber: 'LNP-' + String(Date.now()), entryDate: new Date(), description: 'Loan payment made ' + loan.loanNumber, totalDebit: payAmount, totalCredit: payAmount, createdBy: requireAuthUserId(req),
            lines: { create: [{ tenantId, accountId: loansPayAcct.id, debitAmount: payAmount, creditAmount: 0, description: 'Loan payable reduction' }, { tenantId, accountId: cashAcct.id, debitAmount: 0, creditAmount: payAmount, description: 'Payment made' }] },
          },
        });
      }
    });
    res.status(201).json({ data: { message: 'Payment recorded' } });
  } catch (error: any) { logger.error('Loan payment failed', { error: error.message }); res.status(500).json({ status: 500, detail: error.message }); }
});

export default router;
