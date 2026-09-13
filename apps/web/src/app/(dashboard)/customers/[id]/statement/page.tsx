'use client'; import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Printer, Search } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

interface LedgerEntry {
  id: string; type: string; amount: number; balanceBefore: number; balanceAfter: number;
  description: string; referenceNumber: string | null; createdAt: string;
}

function isDebit(type: string) { return ['SALE', 'ADJUSTMENT', 'VOID', 'MIGRATION'].includes(type); }
function isCredit(type: string) { return ['PAYMENT', 'REFUND'].includes(type); }

export default function CustomerStatementPage() {
  const params = useParams(); const router = useRouter();
  const searchParams = useSearchParams();
  const [customer, setCustomer] = useState<any>(null);
  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
  const [startDate, setStartDate] = useState(searchParams?.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams?.get('endDate') || '');
  const [companyName, setCompanyName] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadStatement = useCallback(async (start: string, end: string) => {
    setLoaded(false);
    const [c, l, settings] = await Promise.all([
      apiGet(`/customers/${params.id}`).catch(() => null),
      apiGet(`/customers/${params.id}/ledger?perPage=500&startDate=${start}&endDate=${end}`).catch(() => null),
      apiGet('/settings/company').catch(() => null),
    ]);
    if (c?.data) setCustomer(c.data);
    if (l?.data) setAllEntries(l.data);
    if (settings?.data) setCompanyName(settings.data.company_name || settings.data.companyName || '');
    setLoaded(true);
  }, [params.id]);

  useEffect(() => {
    loadStatement(startDate, endDate);
  }, [params.id]);

  // Inject @page rule into document head (must be in <head> to work)
  useEffect(() => {
    const styleId = 'statement-page-size';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
  @page {
    size: A4 landscape !important;
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
    .statement .print-table th { padding: 4px 5px !important; font-size: 7.5pt !important; font-weight: 700 !important; letter-spacing: 0.03em !important; }
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

  const openingBalance = allEntries.length > 0 ? allEntries[allEntries.length - 1].balanceBefore : 0;
  const closingBalance = allEntries.length > 0 ? allEntries[0].balanceAfter : 0;
  const totalDebit = allEntries.filter((e) => isDebit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalCredit = allEntries.filter((e) => isCredit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const sorted = [...allEntries].reverse();

  return (
    <div className="space-y-6">
      {/* Screen-only header + filter */}
      <div className="screen-only">
        <PageHeader title="Account Statement" description={customer?.fullName ? `Statement for ${customer.fullName}` : 'Loading...'}>
          <Button variant="outline" size="sm" onClick={() => window.close()}><ArrowLeft className="h-4 w-4 mr-1.5" />Close</Button>
          <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </PageHeader>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" className="h-9 w-44" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" className="h-9 w-44" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <Button onClick={() => { loadStatement(startDate, endDate); }}><Search className="h-4 w-4 mr-1.5" />Generate</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statement content */}
      {!customer ? (
        <div className="text-center py-12 text-muted-foreground">Loading statement...</div>
      ) : (
        <div className="statement print-area">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-900 pb-3 mb-5 print-header-wrap">
            {companyName && <p className="text-lg font-bold mb-1 print-company-name">{companyName}</p>}
            <h1 className="text-2xl font-bold mb-1 print-header-name">{customer.fullName}</h1>
            <h2 className="text-lg font-semibold tracking-wide print-header-title">ACCOUNT STATEMENT</h2>
            <p className="text-sm text-muted-foreground print-header-period">{startDate ? `Period: ${format(new Date(startDate), 'MMM d, yyyy')} to ${format(new Date(endDate), 'MMM d, yyyy')}` : 'All transactions'}</p>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-5 border rounded p-3 bg-muted/30 print-info-box">
            <div><span className="font-semibold">Customer:</span> {customer.fullName}</div>
            <div><span className="font-semibold">Code:</span> {customer.customerCode}</div>
            <div><span className="font-semibold">Address:</span> {customer.address || 'N/A'}</div>
            <div><span className="font-semibold">Phone:</span> {customer.phone || '-'}</div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3 mb-5 print-cards-wrap">
            <div className="rounded-lg p-3 text-center border bg-card print-card">
              <p className="text-xs text-muted-foreground print-card-label">Opening Balance</p>
              <p className="text-lg font-bold print-card-value">{formatPkr(openingBalance)}</p>
            </div>
            <div className="rounded-lg p-3 text-center bg-gradient-red print-card">
              <p className="text-xs opacity-80 print-card-label">Total Debit</p>
              <p className="text-lg font-bold print-card-value">{formatPkr(totalDebit)}</p>
            </div>
            <div className="rounded-lg p-3 text-center bg-gradient-green print-card">
              <p className="text-xs opacity-80 print-card-label">Total Credit</p>
              <p className="text-lg font-bold print-card-value">{formatPkr(totalCredit)}</p>
            </div>
            <div className="rounded-lg p-3 text-center bg-gradient-indigo print-card">
              <p className="text-xs opacity-80 print-card-label">Closing Balance</p>
              <p className="text-lg font-bold print-card-value">{formatPkr(closingBalance)}</p>
            </div>
          </div>

          {/* Transactions Table */}
          <table className="w-full border-collapse text-sm print-table">
            <thead>
              <tr className="text-white" style={{ background: '#333' }}>
                <th className="text-left p-2 font-medium whitespace-nowrap w-[110px]">Date</th>
                <th className="text-left p-2 font-medium whitespace-nowrap w-[140px]">Reference</th>
                <th className="text-left p-2 font-medium">Description</th>
                <th className="text-right p-2 font-medium whitespace-nowrap w-[100px]">Debit (PKR)</th>
                <th className="text-right p-2 font-medium whitespace-nowrap w-[100px]">Credit (PKR)</th>
                <th className="text-right p-2 font-medium whitespace-nowrap w-[110px]">Balance (PKR)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-dashed border-muted-foreground/30">
                <td className="p-2 font-semibold" colSpan={3}>Opening Balance</td>
                <td className="text-right p-2 text-muted-foreground">-</td>
                <td className="text-right p-2 text-muted-foreground">-</td>
                <td className="text-right p-2 font-bold">{formatPkr(openingBalance)}</td>
              </tr>
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions in this period</td></tr>
              )}
              {sorted.map((e: LedgerEntry, i: number) => (
                  <tr key={e.id} className={i < sorted.length - 1 ? 'border-b border-border/50' : ''}>
                    <td className="p-2">{format(new Date(e.createdAt), 'MMM d, yyyy')}</td>
                    <td className="p-2 text-muted-foreground">{e.referenceNumber || '-'}</td>
                    <td className="p-2">{e.description || e.type}</td>
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
                <td className="text-right p-2 font-bold">{formatPkr(closingBalance)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div className="flex justify-between items-center text-xs text-muted-foreground mt-6 pt-4 border-t border-border print-footer">
            <span className="print-footer-left">
              This is a computer-generated statement and requires no signature.
            </span>
            <span className="print-footer-right">
              {companyName && <span>{companyName} &mdash; </span>}
              Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
