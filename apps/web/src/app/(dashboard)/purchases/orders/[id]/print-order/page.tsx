'use client'; import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils'; import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { ArrowLeft, Printer } from 'lucide-react';

export default function PrintPurchaseOrderPage() {
  const params = useParams(); const router = useRouter();
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    apiGet(`/purchases/orders/${params.id}`).then((r: any) => { if (r?.data) setOrder(r.data); }).catch(() => null);
  }, [params.id]);

  useEffect(() => {
    const styleId = 'print-po-style';
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
  if (!order) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  const subtotal = Number(order.subtotal) || 0;
  const total = Number(order.totalAmount) || 0;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader title="Purchase Order" description={`PO #${order.orderNumber}`}>
          <Button variant="outline" size="sm" onClick={() => window.close()}><ArrowLeft className="h-4 w-4 mr-1.5" />Close</Button>
          <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </PageHeader>
      </div>

      <div className="invoice">
        {/* Title */}
        <div className="text-center border-b-2 border-gray-900 pb-4 mb-5">
          <h1 className="text-2xl font-bold tracking-wide">PURCHASE ORDER</h1>
          <p className="text-sm text-muted-foreground print-header-sub">#{order.orderNumber}</p>
        </div>

        {/* Vendor & Order Details */}
        <div className="grid grid-cols-2 gap-6 mb-5">
          <div className="border rounded p-3 print-info-text">
            <p className="font-bold mb-1 print-section-title">Vendor</p>
            <p className="font-medium">{order.vendor?.companyName || 'N/A'}</p>
            {order.vendor?.contactPerson && <p className="text-muted-foreground">Attn: {order.vendor.contactPerson}</p>}
            {order.vendor?.phone && <p className="text-muted-foreground">{order.vendor.phone}</p>}
            {order.vendor?.email && <p className="text-muted-foreground">{order.vendor.email}</p>}
            {order.vendor?.address && <p className="text-muted-foreground">{order.vendor.address}</p>}
          </div>
          <div className="border rounded p-3 print-info-text">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Order Date:</span><span className="font-medium text-right">{format(new Date(order.orderDate), 'MMM d, yyyy')}</span>
              {order.expectedDate && <><span className="text-muted-foreground">Expected:</span><span className="font-medium text-right">{format(new Date(order.expectedDate), 'MMM d, yyyy')}</span></>}
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium text-right">
                <span style={{
                  display: 'inline-block', padding: '1px 8px', borderRadius: '3px', fontWeight: 700, fontSize: '0.85em',
                  background: order.status === 'RECEIVED' ? '#dcfce7' : order.status === 'CANCELLED' ? '#fee2e2' : order.status === 'DRAFT' ? '#f3f4f6' : '#fef3c7',
                  color: order.status === 'RECEIVED' ? '#166534' : order.status === 'CANCELLED' ? '#991b1b' : order.status === 'DRAFT' ? '#4b5563' : '#92400e',
                }}>
                  {order.status}
                </span>
              </span>
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
              <th className="text-right p-2 font-medium" style={{ width: '70px' }}>Qty</th>
              <th className="text-right p-2 font-medium" style={{ width: '100px' }}>Unit Cost</th>
              <th className="text-right p-2 font-medium" style={{ width: '100px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item: any, idx: number) => (
              <tr key={item.id} className="border-b border-border/50">
                <td className="p-2 text-muted-foreground">{idx + 1}</td>
                <td className="p-2 font-medium">{item.product?.name || `Product #${item.productId}`}</td>
                <td className="p-2 text-muted-foreground">{item.product?.sku || '-'}</td>
                <td className="text-right p-2">{item.quantityOrdered}{item.quantityReceived > 0 && <span className="text-muted-foreground text-xs ml-1">(recv {item.quantityReceived})</span>}</td>
                <td className="text-right p-2">{formatPkr(Number(item.unitCost))}</td>
                <td className="text-right p-2 font-medium">{formatPkr(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1 text-sm print-info-text">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPkr(subtotal)}</span></div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-1"><span>Total</span><span>{formatPkr(total)}</span></div>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="mt-5 pt-4 border-t text-sm print-info-text">
            <p className="font-semibold mb-1">Notes</p>
            <p className="text-muted-foreground">{order.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-muted-foreground mt-6 pt-4 border-t print-footer">
          <span>PURCHASE ORDER &mdash; {order.orderNumber}</span>
          <span>Printed: {format(new Date(), 'MMM d, yyyy HH:mm')}</span>
        </div>
      </div>
    </div>
  );
}
