'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { formatPkr } from '@/lib/utils';

export default function ReceiptPage() {
  const params = useParams();
  const [sale, setSale] = useState<any>(null);

  useEffect(() => {
    apiGet(`/sales/${params.id}`).then((r: any) => { if (r?.data) setSale(r.data); }).catch(() => {});
  }, [params.id]);

  useEffect(() => {
    if (sale) setTimeout(() => window.print(), 500);
  }, [sale]);

  if (!sale) return <div className="flex justify-center p-8 font-mono">Loading receipt...</div>;

  const copy = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('copy') === 'customer');
  const items = sale.items || [];
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.lineTotal), 0);
  const discount = Number(sale.discountAmount) || 0;
  const returns = items.filter((i: any) => Number(i.quantity) < 0);
  const saleItems = items.filter((i: any) => Number(i.quantity) > 0);
  const grandTotal = Number(sale.totalAmount);
  const paid = Number(sale.paidAmount);
  const change = Number(sale.changeAmount);
  const payment = sale.payments?.[0];
  const settings = sale.tenant?.settings || {};
  const companyName = settings?.companyName || sale.tenant?.name || 'Sitara ERP';
  const companyAddress = settings?.address || '123 Business Avenue, City';
  const companyPhone = settings?.phone || '042-1112233';
  const companyEmail = settings?.email || 'info@company.com';
  const cashierName = sale.createdByUser?.fullName || '';

  return (
    <div style={{ fontFamily: "'Courier New', monospace", fontSize: '11px', color: '#000', background: '#fff', maxWidth: '80mm', margin: '0 auto', padding: '8px', position: 'relative', overflow: 'hidden' }}>
      {copy && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-30deg)', fontSize: '24px', fontWeight: 'bold', color: 'rgba(200,200,200,0.4)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1 }}>
          CUSTOMER COPY
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0', padding: '0 0 5px 0', borderBottom: '2px solid #000' }}>
          {companyName}
        </h1>
        <p style={{ margin: '2px 0', fontSize: '11px' }}>{companyAddress}</p>
        <p style={{ margin: '2px 0', fontSize: '11px' }}>Phone: {companyPhone} | {companyEmail}</p>
        <p style={{ margin: '5px 0', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>SALES RECEIPT</p>
      </div>

      {/* Sale Info */}
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', marginBottom: '6px' }}>
        <p style={{ margin: '2px 0' }}>Receipt #: <strong>{sale.saleNumber}</strong></p>
        <p style={{ margin: '2px 0' }}>Date: {new Date(sale.saleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
        <p style={{ margin: '2px 0' }}>Time: {new Date(sale.saleDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
        {cashierName && <p style={{ margin: '2px 0' }}>Cashier: {cashierName}</p>}
      </div>

      {/* Customer Info */}
      {sale.customer && (
        <div style={{ marginBottom: '6px', padding: '3px 0' }}>
          <strong style={{ fontSize: '10px' }}>CUSTOMER</strong>
          <p style={{ margin: '2px 0' }}>Name: {sale.customer.fullName}</p>
        </div>
      )}

      {/* Pricing Tier */}
      {sale.tierName && (
        <div style={{ background: '#e8f5e9', padding: '3px 6px', marginBottom: '6px', borderRadius: '2px', fontSize: '10px' }}>
          Pricing Tier: {sale.tierName} ({sale.tierDiscount}% off)
        </div>
      )}

      {/* Items Header */}
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px solid #000', display: 'flex', padding: '4px 0', fontWeight: 'bold', fontSize: '10px' }}>
        <div style={{ flex: '3' }}>Item</div>
        <div style={{ flex: '1', textAlign: 'center' }}>Qty</div>
        <div style={{ flex: '1.5', textAlign: 'right' }}>Price</div>
        <div style={{ flex: '1.5', textAlign: 'right' }}>Total</div>
      </div>

      {/* Sale Items */}
      {saleItems.map((i: any) => (
        <div key={i.id} style={{ display: 'flex', padding: '3px 0', borderBottom: '1px dotted #eee', fontSize: '10px' }}>
          <div style={{ flex: '3' }}><span>{i.product?.name || `Item #${i.productId}`}</span></div>
          <div style={{ flex: '1', textAlign: 'center' }}>{Math.abs(i.quantity)}</div>
          <div style={{ flex: '1.5', textAlign: 'right' }}>{formatPkr(Number(i.unitPrice))}</div>
          <div style={{ flex: '1.5', textAlign: 'right' }}>{formatPkr(Number(i.lineTotal))}</div>
        </div>
      ))}

      {/* Return Items */}
      {returns.length > 0 && (
        <>
          <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '10px', padding: '3px 0', borderTop: '1px dashed #000' }}>RETURNS APPLIED:</div>
          {returns.map((i: any) => (
            <div key={i.id} style={{ display: 'flex', padding: '2px 0', fontSize: '10px', color: '#ef4444' }}>
              <div style={{ flex: '3' }}>{i.product?.name || `Item #${i.productId}`}</div>
              <div style={{ flex: '1', textAlign: 'center' }}>{Math.abs(i.quantity)}</div>
              <div style={{ flex: '1.5', textAlign: 'right' }}>{formatPkr(Number(i.unitPrice))}</div>
              <div style={{ flex: '1.5', textAlign: 'right' }}>-{formatPkr(Number(i.lineTotal))}</div>
            </div>
          ))}
        </>
      )}

      {/* Totals */}
      <div style={{ borderTop: '1px dashed #000', padding: '4px 0', marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
          <span>Subtotal</span><span>{formatPkr(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span>Discount</span><span style={{ color: '#ef4444' }}>-{formatPkr(discount)}</span>
          </div>
        )}
        {returns.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#ef4444' }}>
            <span>Returns Applied</span><span>-{formatPkr(returns.reduce((s: number, i: any) => s + Math.abs(Number(i.lineTotal)), 0))}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', borderTop: '2px solid #000', paddingTop: '4px', marginTop: '4px' }}>
          <span>GRAND TOTAL</span><span>{formatPkr(grandTotal)}</span>
        </div>
        <p style={{ fontSize: '10px', margin: '2px 0', textAlign: 'center' }}>
          Items: {saleItems.length} | Total Qty: {saleItems.reduce((s: number, i: any) => s + i.quantity, 0)}
        </p>
      </div>

      {/* Payment */}
      <div style={{ background: '#f9f9f9', padding: '4px 6px', marginTop: '4px', borderRadius: '2px' }}>
        <p style={{ margin: '2px 0', fontWeight: 'bold', fontSize: '10px' }}>PAYMENT</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
          <span>{payment?.paymentMethod || 'CASH'}</span><span>{formatPkr(paid)}</span>
        </div>
        {change > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span>Change</span><span>{formatPkr(change)}</span>
          </div>
        )}
      </div>

      {/* QR Code */}
      <div style={{ textAlign: 'center', marginTop: '8px', background: '#f9f9f9', padding: '6px', borderRadius: '4px' }}>
        <img
          src={`https://quickchart.io/qr?text=${encodeURIComponent(
            `${typeof window !== 'undefined' ? window.location.origin : ''}/public/receipt/${params.id}`
          )}&size=80&margin=2`}
          alt="QR"
          width="80"
          height="80"
          style={{ display: 'block', margin: '0 auto' }}
        />
        <p style={{ fontSize: '8px', margin: '2px 0 0 0' }}>Scan for digital receipt</p>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px' }}>
        {copy && <p style={{ fontWeight: 'bold', fontSize: '10px' }}>CUSTOMER COPY</p>}
        <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '2px 0' }}>THANK YOU!</p>
        <p style={{ fontSize: '10px', margin: '2px 0' }}>Thank you for your business!</p>
        {sale.notes && <p style={{ fontSize: '9px', margin: '2px 0', fontStyle: 'italic' }}>{sale.notes}</p>}
        <p style={{ fontSize: '9px', margin: '2px 0', color: '#888' }}>Powered by Sitara ERP</p>
      </div>

      {/* Action Buttons (hidden during print) */}
      <div className="no-print" style={{ textAlign: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #ccc' }}>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px' }}>Print</button>
        <button onClick={() => { const u = new URL(window.location.href); u.searchParams.set('copy', 'customer'); window.location.href = u.toString(); }} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px' }}>Customer Copy</button>
        <button onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`Receipt: ${sale.saleNumber} | Total: ${formatPkr(grandTotal)} | ${window.location.origin}/receipt/${params.id}`)}`, '_blank'); }} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '4px' }}>WhatsApp</button>
        <button onClick={async () => { const email = prompt('Enter email:', sale.customer?.email || ''); if (!email) return; try { const r = await fetch(`/api/v1/sales/${params.id}/send-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const d = await r.json(); if (d.data?.sent) alert(`Receipt sent to ${email}`); else alert(d.data?.reason || 'Failed'); } catch { alert('Failed to send email'); } }} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px' }}>Email</button>
        <button onClick={() => window.close()} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px' }}>Close</button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { width: 80mm; margin: 0; padding: 0; }
          @page { size: 80mm auto; margin: 0; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
