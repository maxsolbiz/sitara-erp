import { prisma, setup, teardown, api, apiFormData, pass, fail, hasFailures, tenantId, authToken } from './test-util';
import { generateAccessToken, hashPassword } from '../src/utils/helpers';

async function main() {
  await setup(); console.log('\n=== Product & Category Tests ===\n');
  let catId = '', subCatId = '', prodId = '', prod2Id = '';

  // A1-A7: Categories
  try { const r = await api('POST', '/api/v1/product-categories', { name: 'TestCat' }); if (r.status === 201) { pass('A1: Create category'); catId = r.body?.data?.id; } else fail('A1', `Status ${r.status}`); } catch (e: any) { fail('A1', e.message); }
  try { const r = await api('GET', '/api/v1/product-categories'); if (r.body?.data?.some((c: any) => c.id === catId)) pass('A2: List includes'); else fail('A2', 'Not found'); } catch (e: any) { fail('A2', e.message); }
  try { const r = await api('PUT', `/api/v1/product-categories/${catId}`, { name: 'TestCatRenamed' }); if (r.status === 200) pass('A3: Updated'); else fail('A3', `Status ${r.status}`); } catch (e: any) { fail('A3', e.message); }
  try { const r = await api('POST', '/api/v1/product-categories', { name: 'SubCat', parentId: catId }); if (r.status === 201) { pass('A4: Subcategory'); subCatId = r.body?.data?.id; } else fail('A4', `Status ${r.status}`); } catch (e: any) { fail('A4', e.message); }
  try { const r = await api('DELETE', `/api/v1/product-categories/${subCatId}`); if (r.status === 200) pass('A5: Delete empty'); else fail('A5', `Status ${r.status}`); } catch (e: any) { fail('A5', e.message); }
  // Create a product in category first for A6
  try {
    const p = await api('POST', '/api/v1/products', { name: 'CatTestProd', sku: 'CAT-TEST', costPrice: 100, sellingPrice: 200, categoryId: Number(catId) });
    prod2Id = p.body?.data?.id;
    const r = await api('DELETE', `/api/v1/product-categories/${catId}`);
    if (r.status === 409) pass('A6: Block delete with products'); else fail('A6', `Status ${r.status}`);
  } catch (e: any) { fail('A6', e.message); }
  try { const r = await api('PATCH', `/api/v1/product-categories/${catId}/toggle`, {}); if (r.status === 200) pass('A7: Toggle'); else fail('A7', `Status ${r.status}`); } catch (e: any) { fail('A7', e.message); }

  // B1-B5: Products
  try { const r = await api('POST', '/api/v1/products', { name: 'E2E Product', sku: 'E2E-PROD', costPrice: 500, sellingPrice: 1000, barcode: 'E2E-BAR' }); if (r.status === 201) { pass('B1: Create product'); prodId = r.body?.data?.id; if (r.body?.data?.sku) pass('B1: Auto SKU'); else fail('B1: No SKU', ''); } else fail('B1', `Status ${r.status}`); } catch (e: any) { fail('B1', e.message); }
  try { const r = await api('GET', `/api/v1/products/${prodId}`); if (r.status === 200 && r.body?.data?.name === 'E2E Product') pass('B2: Get product'); else fail('B2', `Status ${r.status}`); } catch (e: any) { fail('B2', e.message); }
  try { const r = await api('PUT', `/api/v1/products/${prodId}`, { name: 'E2E Renamed' }); if (r.status === 200) pass('B3: Updated'); else fail('B3', `Status ${r.status}`); } catch (e: any) { fail('B3', e.message); }
  try { const r = await api('DELETE', `/api/v1/products/${prodId}`); if (r.status === 200) pass('B4: Deleted'); else fail('B4', `Status ${r.status}`); } catch (e: any) { fail('B4', e.message); }
  try { const r = await api('GET', '/api/v1/products/search?q=E2E'); if (r.body?.data?.length === 0) pass('B5: Not in search'); else fail('B5', `Found ${r.body?.data?.length}`); } catch (e: any) { fail('B5', e.message); }

  // C1-C5: Import/Export
  try { const r = await api('GET', '/api/v1/products/import/template'); if (r.status === 200) pass('C1: Template'); else fail('C1', `Status ${r.status}`); } catch (e: any) { fail('C1', e.message); }
  try { const r = await api('GET', '/api/v1/products/export'); if (r.status === 200) pass('C2: Export'); else fail('C2', `Status ${r.status}`); } catch (e: any) { fail('C2', e.message); }
  try {
    const csv = 'SKU,Name,Category,Unit of Measure,Cost Price,Selling Price,Reorder Level,Reorder Quantity,Is Active,Barcode,Description\nIMP-001,Import Product 1,,pieces,100,200,10,50,true,,\nIMP-002,Import Product 2,,pieces,150,300,,,true,,';
    const r = await apiFormData('POST', '/api/v1/products/import', 'file', 'import.csv', csv);
    if (r.status === 201 || r.status === 200) {
      if (r.body?.data?.imported > 0) pass(`C3: Imported ${r.body.data.imported}`); else fail('C3: Imported', `Got ${r.body?.data?.imported}`);
      if (r.body?.data?.errors?.length === 0) pass('C3: No errors'); else fail('C3: Errors', JSON.stringify(r.body.data.errors));
    } else fail('C3', `Status ${r.status}`);
  } catch (e: any) { fail('C3', e.message); }
  try {
    const csv2 = 'SKU,Name,Category,Unit of Measure,Cost Price,Selling Price,Reorder Level,Reorder Quantity,Is Active,Barcode,Description\nIMP-001,Duplicate SKU Test,,pieces,100,200,10,50,true,,\nIMP-003,New Product,,pieces,200,400,5,25,true,,';
    const r = await apiFormData('POST', '/api/v1/products/import', 'file', 'import2.csv', csv2);
    if (r.status === 200 || r.status === 201) {
      if (r.body?.data?.skipped > 0 && r.body?.data?.errors?.some((e: any) => e.reason.includes('Duplicate'))) pass('C4: Duplicate SKU handled'); else fail('C4', `Skipped ${r.body?.data?.skipped}`);
      if (r.body?.data?.imported > 0) pass('C4: Other rows imported'); else fail('C4: Other rows', 'Not imported');
    } else fail('C4', `Status ${r.status}`);
  } catch (e: any) { fail('C4', e.message); }
  try {
    const csv3 = 'SKU,Name,Category,Unit of Measure,Cost Price,Selling Price,Reorder Level,Reorder Quantity,Is Active,Barcode,Description\nIMP-004,,,pieces,100,200,10,50,true,,\nIMP-005,Valid Import,,pieces,300,500,10,50,true,,';
    const r = await apiFormData('POST', '/api/v1/products/import', 'file', 'import3.csv', csv3);
    if (r.status === 200 || r.status === 201) {
      if (r.body?.data?.errors?.some((e: any) => e.reason.includes('Name'))) pass('C5: Bad row reported'); else fail('C5: Bad row', `Errors: ${JSON.stringify(r.body?.data?.errors)}`);
      if (r.body?.data?.imported > 0) pass('C5: Valid rows imported'); else fail('C5: Valid rows', `Imported ${r.body?.data?.imported}`);
    } else fail('C5', `Status ${r.status}`);
  } catch (e: any) { fail('C5', e.message); }

  // D1-D4: costPrice visibility (products.export holders + superadmin only)
  try {
    const perm = await prisma.permission.upsert({
      where: { tenantId_slug: { tenantId, slug: 'products.view' } },
      update: {},
      create: { tenantId, name: 'Products View', slug: 'products.view', module: 'products' },
    });
    let role = await prisma.role.findFirst({ where: { tenantId, slug: 'cost-test-viewer' } });
    if (!role) {
      role = await prisma.role.create({ data: { tenantId, name: 'Cost Test Viewer', slug: 'cost-test-viewer' } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    let viewer = await prisma.user.findFirst({ where: { username: 'costviewer', tenantId } });
    if (!viewer) {
      viewer = await prisma.user.create({
        data: { tenantId, username: 'costviewer', email: 'costviewer@test.com', passwordHash: await hashPassword('viewer123'), fullName: 'Cost Viewer', isActive: true, status: 'active' },
      });
    }
    const existing = await prisma.roleUser.findUnique({ where: { userId_roleId: { userId: viewer.id, roleId: role.id } } });
    if (!existing) await prisma.roleUser.create({ data: { userId: viewer.id, roleId: role.id } });
    const viewerToken = generateAccessToken({ userId: viewer.id, tenantId, tenantSlug: 'test-tenant' });

    const adminList = await api('GET', '/api/v1/products?perPage=5', undefined, authToken);
    if (adminList.status === 200 && (adminList.body?.data || []).length > 0 && 'costPrice' in (adminList.body.data[0] || {})) pass('D1: Admin sees costPrice'); else fail('D1', `Status ${adminList.status}`);
    const viewerList = await api('GET', '/api/v1/products?perPage=5', undefined, viewerToken);
    if (viewerList.status === 200 && (viewerList.body?.data || []).every((p: any) => !('costPrice' in p))) pass('D2: Viewer hidden costPrice'); else fail('D2', `Status ${viewerList.status}`);
    const pid = adminList.body?.data?.[0]?.id;
    const adminDetail = await api('GET', `/api/v1/products/${pid}`, undefined, authToken);
    if (adminDetail.status === 200 && 'costPrice' in (adminDetail.body?.data || {})) pass('D3: Admin detail costPrice'); else fail('D3', `Status ${adminDetail.status}`);
    const viewerDetail = await api('GET', `/api/v1/products/${pid}`, undefined, viewerToken);
    if (viewerDetail.status === 200 && !('costPrice' in (viewerDetail.body?.data || {}))) pass('D4: Viewer detail hidden'); else fail('D4', `Status ${viewerDetail.status}`);
  } catch (e: any) { fail('D-cost', e.message); }

  // Cleanup
  await prisma.product.deleteMany({ where: { tenantId, sku: { in: ['IMP-001','IMP-002','IMP-003','IMP-004','CAT-TEST','E2E-PROD'] } } }).catch(() => {});
  await prisma.productCategory.deleteMany({ where: { tenantId, name: { in: ['TestCat','TestCatRenamed','SubCat'] } } }).catch(() => {});

  await teardown(); await prisma.$disconnect();
  console.log(hasFailures ? '\nFAILURES DETECTED' : '\nAll product tests done');
  process.exit(hasFailures ? 1 : 0);
}
main().catch((e) => { console.error('PRODUCT TEST FAILED:', e); process.exit(1); });
