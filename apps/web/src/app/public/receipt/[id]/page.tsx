'use client'; import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation'; import { formatPkr } from '@/lib/utils';

export default function PublicReceiptPage() {
  const params = useParams();
  const [sale, setSale] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/v1/public/receipts/${params.id}`).then((r) => r.json()).then((res) => { if (res?.data) setSale(res.data); }).catch(() => {});
  }, [params.id]);

  if (!sale) return <div className="flex justify-center p-8 font-mono">Loading receipt...</div>;

  return (<div style={{ fontFamily: "'Courier New', monospace", fontSize: '11px', color: '#000', background: '#fff', maxWidth: '80mm', margin: '0 auto', padding: '8px' }}>
    <div style={{ textAlign: 'center', marginBottom: '8px' }}>
      <h1 style={{ fontSize: '16px', fontWeight: 'bold', borderBottom: '2px solid #000', paddingBottom: '5px' }}>{sale.companyName}</h1>
      {sale.companyAddress && <p style={{ margin: '2px 0', fontSize: '11px' }}>{sale.companyAddress}</p>}
      {sale.companyPhone && <p style={{ margin: '2px 0', fontSize: '11px' }}>Phone: {sale.companyPhone}</p>}
      <p style={{ margin: '5px 0', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>SALES RECEIPT</p>
    </div>
    <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', marginBottom: '6px', fontSize: '11px' }}>
      <p>Receipt #: <strong>{sale.saleNumber}</strong></p>
      <p>Date: {new Date(sale.saleDate).toLocaleDateString()}</p>
    </div>
    <div style={{ marginBottom: '6px', padding: '3px 0', fontSize: '11px' }}>
      <strong>CUSTOMER</strong>
      <p>{sale.customerName}</p>
    </div>
    <div style={{ borderTop: '1px dashed #000', borderBottom: '1px solid #000', display: 'flex', padding: '4px 0', fontWeight: 'bold', fontSize: '10px' }}>
      <div style={{ flex: '3' }}>Item</div><div style={{ flex: '1', textAlign: 'center' }}>Qty</div><div style={{ flex: '1.5', textAlign: 'right' }}>Price</div><div style={{ flex: '1.5', textAlign: 'right' }}>Total</div>
    </div>
    {sale.items?.map((i: any, idx: number) => (<div key={idx} style={{ display: 'flex', padding: '3px 0', borderBottom: '1px dotted #eee', fontSize: '10px' }}>
      <div style={{ flex: '3' }}>{i.productName}</div><div style={{ flex: '1', textAlign: 'center' }}>{i.quantity}</div><div style={{ flex: '1.5', textAlign: 'right' }}>{formatPkr(i.unitPrice)}</div><div style={{ flex: '1.5', textAlign: 'right' }}>{formatPkr(i.lineTotal)}</div>
    </div>))}
    {sale.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}><span>Discount</span><span>-{formatPkr(sale.discount)}</span></div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', borderTop: '2px solid #000', paddingTop: '4px', marginTop: '4px' }}><span>Total</span><span>{formatPkr(sale.total)}</span></div>
    <div style={{ fontSize: '11px', margin: '4px 0' }}>Paid: {formatPkr(sale.paid)} via {sale.paymentMethod}</div>
    <div style={{ textAlign: 'center', marginTop: '10px', borderTop: '1px dashed #000', paddingTop: '6px' }}>
      <p style={{ fontSize: '12px', fontWeight: 'bold' }}>THANK YOU!</p>
      <p style={{ fontSize: '10px' }}>Thank you for your business!</p>
    </div>
    <div className="no-print" style={{ textAlign: 'center', marginTop: '12px' }}>
      <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Receipt: ${sale.saleNumber} | Total: ${formatPkr(sale.total)} | ${window.location.href}`)}`, '_blank')} style={{ padding: '6px 16px', margin: '2px', cursor: 'pointer', fontSize: '11px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '4px' }}>WhatsApp</button>
    </div>
    <style>{`@media print{.no-print{display:none!important}body{width:80mm;margin:0;padding:0}@page{size:80mm auto;margin:0}}`}</style>
  </div>);
}
