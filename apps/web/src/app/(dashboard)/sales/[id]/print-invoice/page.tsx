'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Printer } from 'lucide-react';

export default function PrintInvoicePage() {
  const params = useParams(); const router = useRouter();
  const [sale, setSale] = useState<any>(null);

  useEffect(() => {
    apiGet(`/sales/${params.id}`).then((r: any) => { if (r?.data) setSale(r.data); }).catch(() => null);
  }, [params.id]);

  useEffect(() => {
    const styleId = 'print-invoice-style';
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
        .no-print { display: none !important; }
        .invoice {
          position: static !important;
          padding: 0.8cm 1cm 0.8cm 1cm !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .invoice .print-header-name {
          font-size: 14pt !important;
          margin-bottom: 1px !important;
        }
        .invoice .print-header-sub {
          font-size: 7.5pt !important;
        }
        .invoice .print-section-title {
          font-size: 8pt !important;
        }
        .invoice .print-info-text {
          font-size: 8pt !important;
        }
        .invoice .print-table {
          font-size: 8pt !important;
        }
        .invoice .print-table th {
          padding: 5px 6px !important;
          font-size: 7.5pt !important;
          font-weight: 700 !important;
        }
        .invoice .print-table td {
          padding: 4px 6px !important;
          line-height: 1.3 !important;
        }
        .invoice .print-table thead {
          display: table-header-group !important;
        }
        .invoice .print-table tbody tr {
          page-break-inside: avoid !important;
        }
        .invoice .print-footer {
          font-size: 7pt !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { const el = document.getElementById(styleId); if (el) el.remove(); };
  }, []);

  const handlePrint = () => window.print();
  if (!sale) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const company = (sale.tenant?.settings as any) || {};
  const companyName = company.companyName || sale.tenant?.name || 'Business Name';
  const companyAddress = company.address || '';
  const companyPhone = company.phone || '';
  const companyEmail = company.email || '';

  const subtotal = Number(sale.subtotal) || 0;
  const discount = Number(sale.discountAmount) || 0;
  const total = Number(sale.totalAmount) || 0;
  const paid = Number(sale.paidAmount) || 0;
  const due = total - paid;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader title="Sales Invoice" description={`Invoice #${sale.saleNumber}`}>
          <Button variant="outline" size="sm" onClick={() => window.close()}><ArrowLeft className="h-4 w-4 mr-1.5" />Close</Button>
          <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </PageHeader>
      </div>

      <div className="invoice">
        {/* Letterhead */}
        <div className="text-center border-b-2 border-gray-900 pb-4 mb-5">
          <h1 className="text-2xl font-bold print-header-name">{companyName}</h1>
          {companyAddress && <p className="text-sm text-muted-foreground print-header-sub">{companyAddress}</p>}
          {(companyPhone || companyEmail) && (
            <p className="text-sm text-muted-foreground print-header-sub">
              {companyPhone}{companyPhone && companyEmail ? ' | ' : ''}{companyEmail}
            </p>
          )}
        </div>

        {/* Invoice Title */}
        <div className="flex justify-between items-end mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-wide">SALES INVOICE</h2>
            <p className="text-sm text-muted-foreground">#{sale.saleNumber}</p>
          </div>
          <div className="text-right text-sm print-info-text">
            <span style={{
              display: 'inline-block', padding: '2px 10px', borderRadius: '3px', fontWeight: 700,
              background: sale.paymentStatus === 'PAID' ? '#dcfce7' : sale.paymentStatus === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
              color: sale.paymentStatus === 'PAID' ? '#166534' : sale.paymentStatus === 'PARTIAL' ? '#92400e' : '#991b1b',
            }}>
              {sale.paymentStatus}
            </span>
          </div>
        </div>

        {/* Bill To & Invoice Details */}
        <div className="grid grid-cols-2 gap-6 mb-5">
          <div className="border rounded p-3 print-info-text">
            <p className="font-bold mb-1 print-section-title">Bill To</p>
            <p className="font-medium">{sale.customer?.fullName || 'Walk-in Customer'}</p>
            {sale.customer?.phone && <p className="text-muted-foreground">{sale.customer.phone}</p>}
          </div>
          <div className="border rounded p-3 print-info-text">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Date:</span><span className="font-medium text-right">{format(new Date(sale.saleDate), 'MMM d, yyyy')}</span>
              <span className="text-muted-foreground">Status:</span><span className="font-medium text-right">{sale.status}</span>
              <span className="text-muted-foreground">Salesperson:</span><span className="font-medium text-right">{sale.createdByUser?.fullName || '-'}</span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse text-sm print-table">
          <thead>
            <tr className="text-white" style={{ background: '#333' }}>
              <th className="text-left p-2 font-medium" style={{ width: '40px' }}>#</th>
              <th className="text-left p-2 font-medium">Product</th>
              <th className="text-left p-2 font-medium" style={{ width: '90px' }}>SKU</th>
              <th className="text-right p-2 font-medium" style={{ width: '60px' }}>Qty</th>
              <th className="text-right p-2 font-medium" style={{ width: '100px' }}>Unit Price</th>
              <th className="text-right p-2 font-medium" style={{ width: '100px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items?.filter((i: any) => i.quantity > 0).map((item: any, idx: number) => (
              <tr key={item.id} className="border-b border-border/50">
                <td className="p-2 text-muted-foreground">{idx + 1}</td>
                <td className="p-2 font-medium">{item.product?.name || `Product #${item.productId}`}</td>
                <td className="p-2 text-muted-foreground">{item.product?.sku || '-'}</td>
                <td className="text-right p-2">{item.quantity}</td>
                <td className="text-right p-2">{formatPkr(Number(item.unitPrice))}</td>
                <td className="text-right p-2 font-medium">{formatPkr(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1 text-sm print-info-text">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPkr(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{formatPkr(discount)}</span></div>}
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-1"><span>Grand Total</span><span>{formatPkr(total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span className="text-emerald-600 font-medium">{formatPkr(paid)}</span></div>
            {due > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Due</span><span className="text-red-600 font-medium">{formatPkr(due)}</span></div>}
          </div>
        </div>

        {/* Notes */}
        {sale.notes && (
          <div className="mt-5 pt-4 border-t text-sm print-info-text">
            <p className="font-semibold mb-1">Notes</p>
            <p className="text-muted-foreground">{sale.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-muted-foreground mt-6 pt-4 border-t print-footer">
          <span>SALES INVOICE &mdash; {sale.saleNumber}</span>
          <span>Printed: {format(new Date(), 'MMM d, yyyy HH:mm')}</span>
        </div>
      </div>
    </div>
  );
}
