'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export default function PrintReceiptPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!paymentId) return;
    apiGet(`/customers/${params.id}/payments/${paymentId}/receipt`)
      .then(r => { if (r?.data) setData(r.data); })
      .catch(console.error);
  }, [params.id, paymentId]);

  useEffect(() => {
    const styleId = 'receipt-print-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @page { size: A5 portrait !important; margin: 0 !important; }
      @media print {
        html, body { background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important; }
        .screen-only { display: none !important; }
        .receipt {
          position: static !important;
          padding: 0.8cm 1cm !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, []);

  if (!data) return (
    <div className="p-8 text-center text-muted-foreground">Loading...</div>
  );

  const { customer, payment, settings } = data;

  return (
    <div>
      <div className="screen-only p-4 flex gap-2 border-b">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />Print
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.close()}>
          Close
        </Button>
      </div>

      <div className="receipt max-w-sm mx-auto p-6">
        {/* Company header */}
        <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
          {settings?.company_name && (
            <h1 className="text-lg font-bold uppercase tracking-wide">
              {settings.company_name}
            </h1>
          )}
          {settings?.phone && (
            <p className="text-xs text-muted-foreground">{settings.phone}</p>
          )}
          {settings?.address && (
            <p className="text-xs text-muted-foreground">{settings.address}</p>
          )}
          <h2 className="text-sm font-semibold tracking-widest mt-2 uppercase">
            Payment Receipt
          </h2>
        </div>

        {/* Receipt details */}
        <div className="space-y-1 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Receipt No.</span>
            <span className="font-mono font-semibold">
              {payment.referenceNumber || `RCP-${payment.id}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{format(new Date(payment.createdAt), 'MMM d, yyyy hh:mm a')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{customer.fullName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Code</span>
            <span>{customer.customerCode}</span>
          </div>
          {payment.notes && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notes</span>
              <span className="text-right max-w-[60%]">{payment.notes}</span>
            </div>
          )}
        </div>

        {/* Amount — prominent */}
        <div className="border-y-2 border-gray-800 py-3 my-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Amount Received
          </p>
          <p className="text-3xl font-bold">{formatPkr(Number(payment.amount))}</p>
        </div>

        {/* Balance summary */}
        <div className="space-y-1 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Previous Balance</span>
            <span>{formatPkr(Number(payment.balanceBefore))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span className="text-green-600">{formatPkr(Number(payment.amount))}</span>
          </div>
          <div className="flex justify-between font-bold border-t pt-1 mt-1">
            <span>Remaining Balance</span>
            <span>{formatPkr(Number(payment.balanceAfter))}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground border-t pt-3">
          <p>Thank you for your payment.</p>
          <p className="mt-0.5">This is a computer-generated receipt.</p>
        </div>
      </div>
    </div>
  );
}
