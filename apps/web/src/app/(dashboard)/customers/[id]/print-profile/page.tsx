'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Printer } from 'lucide-react';

function isDebit(type: string) { return ['SALE', 'ADJUSTMENT', 'VOID', 'MIGRATION'].includes(type); }
function isCredit(type: string) { return ['PAYMENT', 'REFUND'].includes(type); }

export default function PrintProfilePage() {
  const params = useParams(); const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    Promise.all([
      apiGet(`/customers/${params.id}`).catch(() => null),
      apiGet(`/customers/${params.id}/stats`).catch(() => null),
      apiGet(`/customers/${params.id}/activity`).catch(() => null),
      apiGet(`/customers/${params.id}/ledger?perPage=20`).catch(() => null),
    ]).then(([c, s, a, l]) => {
      if (c?.data) setCustomer(c.data);
      if (s?.data) setStats(s.data);
      if (a?.data) setActivity(a.data);
      if (l?.data) setLedger(l.data);
      apiGet('/settings/company').then((s: any) => {
        if (s?.data) setCompanyName(s.data.company_name || s.data.companyName || '');
      }).catch(() => {});
    });
  }, [params.id]);

  useEffect(() => {
    const styleId = 'print-profile-page';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
  @page {
    size: A4 portrait !important;
    margin: 0 !important;
    background: white !important;
  }
  @media print {
    html, body {
      background: white !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .statement {
      position: static !important;
      padding: 0.6cm 1cm 0.8cm 1cm !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .statement .print-header-wrap { padding-bottom: 5px !important; margin-bottom: 8px !important; }
    .statement .print-company-name { font-size: 7pt !important; font-weight: 500 !important; letter-spacing: 0.08em !important; text-transform: uppercase !important; color: #666 !important; margin-bottom: 1px !important; display: block !important; }
    .statement .print-header-name { font-size: 13pt !important; margin-bottom: 1px !important; line-height: 1.2 !important; }
    .statement .print-header-title { font-size: 8pt !important; letter-spacing: 0.15em !important; }
    .statement .print-header-period { font-size: 7.5pt !important; margin-top: 1px !important; }
    .statement .print-info-box { font-size: 8pt !important; padding: 5px 8px !important; margin-bottom: 8px !important; }
    .statement .print-cards-wrap { gap: 5px !important; margin-bottom: 8px !important; }
    .statement .print-card { padding: 4px 6px !important; border-radius: 3px !important; }
    .statement .print-card-label { font-size: 6.5pt !important; margin-bottom: 1px !important; }
    .statement .print-card-value { font-size: 9.5pt !important; line-height: 1.2 !important; }
    .statement .print-table { font-size: 8pt !important; }
    .statement .print-table th { padding: 4px 5px !important; font-size: 7.5pt !important; font-weight: 700 !important; }
    .statement .print-table td { padding: 3px 5px !important; line-height: 1.3 !important; }
    .statement .print-table td:nth-child(3), .statement .print-table th:nth-child(3) { min-width: 120px !important; white-space: normal !important; }
    .statement .print-table td:not(:nth-child(3)), .statement .print-table th:not(:nth-child(3)) { white-space: nowrap !important; }
    .statement .print-table thead { display: table-header-group !important; }
    .statement .print-table tfoot { display: table-footer-group !important; }
    .statement .print-table tbody tr { page-break-inside: avoid !important; }
    .statement .print-footer { margin-top: 8px !important; padding-top: 5px !important; font-size: 7pt !important; }
    .statement .print-footer-left { text-align: left !important; }
    .statement .print-footer-right { text-align: right !important; }
  }
`;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(styleId); if (el) el.remove(); };
  }, []);

  const handlePrint = () => window.print();

  if (!customer) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const totalDebit = ledger.filter((e) => isDebit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalCredit = ledger.filter((e) => isCredit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="screen-only">
        <PageHeader title="Customer Profile" description={customer?.fullName ? `Profile for ${customer.fullName}` : 'Loading...'}>
          <Button variant="outline" size="sm" onClick={() => window.close()}><ArrowLeft className="h-4 w-4 mr-1.5" />Close</Button>
          <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </PageHeader>
      </div>

      <div className="statement print-area">
        <div className="text-center border-b-2 border-gray-900 pb-3 mb-5 print-header-wrap">
          {companyName && (
            <span className="print-company-name block text-xs text-muted-foreground tracking-widest uppercase mb-0.5">
              {companyName}
            </span>
          )}
          <h1 className="text-2xl font-bold mb-1 print-header-name">{customer.fullName}</h1>
          <h2 className="text-lg font-semibold tracking-wide print-header-title">CUSTOMER PROFILE</h2>
          <p className="text-sm text-muted-foreground print-header-period">Code: {customer.customerCode} &mdash; Printed on {format(new Date(), 'MMM d, yyyy HH:mm')}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-5 border rounded p-3 bg-muted/30 print-info-box">
          <div><span className="font-semibold">Customer:</span> {customer.fullName}</div>
          <div><span className="font-semibold">Code:</span> {customer.customerCode}</div>
          <div><span className="font-semibold">Phone:</span> {customer.phone || '-'}</div>
          <div><span className="font-semibold">Email:</span> {customer.email || '-'}</div>
          <div><span className="font-semibold">Address:</span> {customer.address || 'N/A'}</div>
          <div><span className="font-semibold">Tax Number:</span> {customer.taxNumber || '-'}</div>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-5 print-cards-wrap">
          <div className="rounded-lg p-3 text-center bg-gradient-indigo print-card">
            <p className="text-xs opacity-80 print-card-label">Total Purchases</p>
            <p className="text-lg font-bold print-card-value">{stats ? formatPkr(stats.totalPurchases) : '-'}</p>
          </div>
          <div className="rounded-lg p-3 text-center bg-gradient-green print-card">
            <p className="text-xs opacity-80 print-card-label">Total Payments</p>
            <p className="text-lg font-bold print-card-value">{stats ? formatPkr(stats.totalPayments) : '-'}</p>
          </div>
          <div className="rounded-lg p-3 text-center bg-gradient-red print-card">
            <p className="text-xs opacity-80 print-card-label">Total Returns</p>
            <p className="text-lg font-bold print-card-value">{stats ? formatPkr(stats.totalReturns) : '-'}</p>
          </div>
          <div className="rounded-lg p-3 text-center border bg-card print-card">
            <p className="text-xs text-muted-foreground print-card-label">Balance</p>
            <p className="text-lg font-bold print-card-value">{customer ? formatPkr(customer.currentBalance) : '-'}</p>
          </div>
          <div className="rounded-lg p-3 text-center border bg-card print-card">
            <p className="text-xs text-muted-foreground print-card-label">Credit Limit</p>
            <p className="text-lg font-bold print-card-value">{customer ? formatPkr(customer.creditLimit) : '-'}</p>
          </div>
        </div>

        <h3 className="text-sm font-bold mb-2 border-b border-muted-foreground/30 pb-1">Recent Transactions</h3>
        <table className="w-full border-collapse text-sm mb-5 print-table">
          <thead>
            <tr className="text-white" style={{ background: '#333' }}>
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Type</th>
              <th className="text-left p-2 font-medium">Description</th>
              <th className="text-right p-2 font-medium">Debit</th>
              <th className="text-right p-2 font-medium">Credit</th>
              <th className="text-right p-2 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions</td></tr>}
            {[...ledger].reverse().map((e: any, i: number) => (
              <tr key={e.id} className={i < ledger.length - 1 ? 'border-b border-border/50' : ''}>
                <td className="p-2">{format(new Date(e.createdAt), 'MMM d, yyyy')}</td>
                <td className="p-2">{e.type}</td>
                <td className="p-2">{e.notes || '-'}</td>
                <td className="text-right p-2">{isDebit(e.type) ? formatPkr(e.amount) : '-'}</td>
                <td className="text-right p-2">{isCredit(e.type) ? formatPkr(e.amount) : '-'}</td>
                <td className="text-right p-2 font-semibold">{formatPkr(e.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #333' }} className="bg-muted">
              <td className="p-2 font-bold" colSpan={3}>Totals</td>
              <td className="text-right p-2 font-bold">{formatPkr(totalDebit)}</td>
              <td className="text-right p-2 font-bold">{formatPkr(totalCredit)}</td>
              <td className="text-right p-2 font-bold">{customer ? formatPkr(customer.currentBalance) : '-'}</td>
            </tr>
          </tfoot>
        </table>

        <h3 className="text-sm font-bold mb-2 border-b border-muted-foreground/30 pb-1">Recent Activity</h3>
        <table className="w-full border-collapse text-sm print-table">
          <thead>
            <tr className="text-white" style={{ background: '#333' }}>
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Action</th>
              <th className="text-left p-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No activity</td></tr>}
            {activity.map((a: any, i: number) => (
              <tr key={a.id} className={i < activity.length - 1 ? 'border-b border-border/50' : ''}>
                <td className="p-2">{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className="p-2 font-semibold">{a.action.replace(/_/g, ' ')}</td>
                <td className="p-2">{a.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center text-xs text-muted-foreground mt-6 pt-4 border-t border-border print-footer">
          <span className="print-footer-left">
            {companyName && <span>{companyName} &mdash; </span>}
            Customer Profile &mdash; {customer.fullName}
          </span>
          <span className="print-footer-right">
            Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}
          </span>
        </div>
      </div>
    </div>
  );
}
