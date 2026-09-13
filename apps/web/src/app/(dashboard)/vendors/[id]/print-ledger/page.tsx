'use client'; import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { format } from 'date-fns';
import { Button } from '@/components/ui/button'; import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Printer, Search } from 'lucide-react';

function isDebit(type: string) { return ['PURCHASE'].includes(type); }
function isCredit(type: string) { return ['PAYMENT', 'RETURN'].includes(type); }

export default function PrintVendorLedgerPage() {
  const params = useParams(); const router = useRouter();
  const searchParams = useSearchParams();
  const [vendor, setVendor] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(searchParams?.get('startDate') || '');
  const [endDate, setEndDate] = useState(searchParams?.get('endDate') || '');
  const [filterType, setFilterType] = useState(searchParams?.get('type') || '');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (start: string, end: string, type: string) => {
    setLoaded(false);
    let url = `/vendors/${params.id}/ledger?perPage=1000`;
    if (start) url += `&startDate=${start}`;
    if (end) url += `&endDate=${end}`;
    if (type) url += `&type=${type}`;
    const [v, l] = await Promise.all([
      apiGet(`/vendors/${params.id}`).catch(() => null),
      apiGet(url).catch(() => null),
    ]);
    if (v?.data) setVendor(v.data);
    if (l?.data) setEntries(l.data);
    setLoaded(true);
  }, [params.id]);

  useEffect(() => { load(startDate, endDate, filterType); }, [params.id]);

  useEffect(() => {
    const styleId = 'print-vendor-ledger-style';
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
        .statement .print-header-wrap {
          padding-bottom: 5px !important;
          margin-bottom: 8px !important;
        }
        .statement .print-header-name {
          font-size: 13pt !important;
          margin-bottom: 1px !important;
          line-height: 1.2 !important;
        }
        .statement .print-header-title {
          font-size: 8pt !important;
          letter-spacing: 0.15em !important;
        }
        .statement .print-header-period {
          font-size: 7.5pt !important;
          margin-top: 1px !important;
        }
        .statement .print-info-box {
          font-size: 8pt !important;
          padding: 5px 8px !important;
          margin-bottom: 8px !important;
        }
        .statement .print-cards-wrap {
          gap: 5px !important;
          margin-bottom: 8px !important;
        }
        .statement .print-card {
          padding: 4px 6px !important;
          border-radius: 3px !important;
        }
        .statement .print-card-label {
          font-size: 6.5pt !important;
          margin-bottom: 1px !important;
        }
        .statement .print-card-value {
          font-size: 9.5pt !important;
          line-height: 1.2 !important;
        }
        .statement .print-table {
          font-size: 8pt !important;
        }
        .statement .print-table th {
          padding: 4px 5px !important;
          font-size: 7.5pt !important;
          font-weight: 700 !important;
          letter-spacing: 0.03em !important;
        }
        .statement .print-table td {
          padding: 3px 5px !important;
          line-height: 1.3 !important;
        }
        .statement .print-table thead {
          display: table-header-group !important;
        }
        .statement .print-table tfoot {
          display: table-footer-group !important;
        }
        .statement .print-table tbody tr {
          page-break-inside: avoid !important;
        }
        @page { counter-increment: page; }
        .statement .print-footer {
          margin-top: 8px !important;
          padding-top: 5px !important;
          font-size: 7pt !important;
        }
        .statement .print-footer-left  { text-align: left !important; }
        .statement .print-footer-right { text-align: right !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(styleId); if (el) el.remove(); };
  }, []);

  const handlePrint = () => window.print();

  if (!vendor) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const totalDebit = entries.filter((e) => isDebit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalCredit = entries.filter((e) => isCredit(e.type)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const openingBalance = entries.length > 0 ? entries[entries.length - 1].balanceBefore : 0;
  const closingBalance = entries.length > 0 ? entries[0].balanceAfter : 0;
  const reversed = [...entries].reverse();

  return (
    <div className="space-y-6">
      <div className="screen-only">
        <PageHeader title="Vendor Ledger" description={vendor?.companyName ? `Ledger for ${vendor.companyName}` : 'Loading...'}>
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
              <div className="space-y-1">
                <Label>Type</Label>
                <select className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">All</option><option value="PURCHASE">Purchase</option><option value="PAYMENT">Payment</option><option value="RETURN">Return</option>
                </select>
              </div>
              <Button onClick={() => load(startDate, endDate, filterType)}><Search className="h-4 w-4 mr-1.5" />Generate</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="statement">
        <div className="text-center border-b-2 border-gray-900 pb-3 mb-5 print-header-wrap">
            <h1 className="text-2xl font-bold mb-1 print-header-name">{vendor.companyName}</h1>
            <h2 className="text-lg font-semibold tracking-wide print-header-title">VENDOR LEDGER</h2>
            <p className="text-sm text-muted-foreground print-header-period">
              {startDate ? `Period: ${format(new Date(startDate), 'MMM d, yyyy')} to ${format(new Date(endDate), 'MMM d, yyyy')}` : 'All transactions'}
              {filterType && <span> &mdash; Type: {filterType}</span>}
            </p>
          </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-5 border rounded p-3 bg-muted/30 print-info-box">
          <div><span className="font-semibold">Vendor:</span> {vendor.companyName}</div>
          <div><span className="font-semibold">Code:</span> {vendor.code}</div>
          <div><span className="font-semibold">Phone:</span> {vendor.phone || '-'}</div>
          <div><span className="font-semibold">Balance:</span> <span className="font-bold">{formatPkr(vendor.currentBalance)}</span></div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5 print-cards-wrap">
          <div className="rounded-lg p-3 text-center border bg-card print-card">
            <p className="text-xs text-muted-foreground print-card-label">Current Payable</p>
            <p className="text-lg font-bold print-card-value">{formatPkr(vendor.currentBalance)}</p>
          </div>
          <div className="rounded-lg p-3 text-center bg-gradient-red print-card">
            <p className="text-xs opacity-80 print-card-label">Total Purchases</p>
            <p className="text-lg font-bold print-card-value">{formatPkr(totalDebit)}</p>
          </div>
          <div className="rounded-lg p-3 text-center bg-gradient-green print-card">
            <p className="text-xs opacity-80 print-card-label">Total Payments</p>
            <p className="text-lg font-bold print-card-value">{formatPkr(totalCredit)}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-sm print-table">
          <thead>
            <tr className="text-white" style={{ background: '#333' }}>
              <th className="text-left p-2 font-medium whitespace-nowrap w-[110px]">Date</th>
              <th className="text-left p-2 font-medium whitespace-nowrap w-[140px]">Reference</th>
              <th className="text-left p-2 font-medium whitespace-nowrap w-[90px]">Type</th>
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
            {reversed.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions in this period</td></tr>
            )}
            {reversed.map((e: any, i: number) => (
              <tr key={e.id} className={i < reversed.length - 1 ? 'border-b border-border/50' : ''}>
                <td className="p-2">{format(new Date(e.createdAt), 'MMM d, yyyy')}</td>
                <td className="p-2 text-muted-foreground">{e.referenceNumber || e.referenceType || '-'}</td>
                <td className="p-2">
                      <span style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '0.7em',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        background: ['PURCHASE'].includes(e.type) ? '#fee2e2' : '#dcfce7',
                        color: ['PURCHASE'].includes(e.type) ? '#991b1b' : '#166534',
                      }}>
                        {e.type}
                      </span>
                    </td>
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

        <div className="flex justify-between items-center text-xs text-muted-foreground mt-6 pt-4 border-t border-border print-footer">
            <span className="print-footer-left">
              Vendor Ledger &mdash; {vendor.companyName} &mdash; {vendor.code}
            </span>
            <span className="print-footer-right">
              Printed: {format(new Date(), 'MMM d, yyyy HH:mm')}
            </span>
          </div>
      </div>
    </div>
  );
}
