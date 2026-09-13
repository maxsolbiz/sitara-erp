import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface SitaraOfflineDB extends DBSchema {
  pendingSales: {
    key: string;
    value: {
      id: string;
      payload: any;
      createdAt: string;
      attempts: number;
      lastError?: string;
      status: 'PENDING' | 'SYNCING' | 'FAILED';
    };
    indexes: { 'by-status': string; 'by-createdAt': string };
  };
  productsCache: { key: number; value: any; indexes: { 'by-name': string } };
  customersCache: { key: number; value: any; indexes: { 'by-name': string } };
  settingsCache: { key: string; value: any };
}

let db: IDBPDatabase<SitaraOfflineDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<SitaraOfflineDB>> {
  if (db) return db;
  db = await openDB<SitaraOfflineDB>('sitara-erp', 1, {
    upgrade(database) {
      const salesStore = database.createObjectStore('pendingSales', { keyPath: 'id' });
      salesStore.createIndex('by-status', 'status');
      salesStore.createIndex('by-createdAt', 'createdAt');
      const productsStore = database.createObjectStore('productsCache', { keyPath: 'id' });
      productsStore.createIndex('by-name', 'name');
      const customersStore = database.createObjectStore('customersCache', { keyPath: 'id' });
      customersStore.createIndex('by-name', 'fullName');
      database.createObjectStore('settingsCache', { keyPath: 'key' });
    },
  });
  return db;
}

export async function queueSale(payload: any): Promise<string> {
  const database = await getDB();
  const id = crypto.randomUUID();
  await database.put('pendingSales', { id, payload, createdAt: new Date().toISOString(), attempts: 0, status: 'PENDING' });
  return id;
}

export async function getPendingSales() {
  const database = await getDB();
  return database.getAllFromIndex('pendingSales', 'by-status', 'PENDING');
}

export async function getFailedSales() {
  const database = await getDB();
  return database.getAllFromIndex('pendingSales', 'by-status', 'FAILED');
}

export async function markSaleSynced(id: string) {
  const database = await getDB();
  await database.delete('pendingSales', id);
}

export async function markSaleFailed(id: string, error: string) {
  const database = await getDB();
  const sale = await database.get('pendingSales', id);
  if (sale) {
    await database.put('pendingSales', { ...sale, status: sale.attempts >= 3 ? 'FAILED' : 'PENDING', attempts: sale.attempts + 1, lastError: error });
  }
}

export async function getAllPendingCount(): Promise<number> {
  const database = await getDB();
  const all = await database.getAll('pendingSales');
  return all.filter(s => s.status === 'PENDING' || s.status === 'SYNCING').length;
}

export async function cacheProducts(products: any[]) {
  const database = await getDB();
  const tx = database.transaction('productsCache', 'readwrite');
  await Promise.all(products.map(p => tx.store.put(p)));
  await tx.done;
}

export async function getCachedProducts(): Promise<any[]> {
  const database = await getDB();
  return database.getAll('productsCache');
}

export async function cacheCustomers(customers: any[]) {
  const database = await getDB();
  const tx = database.transaction('customersCache', 'readwrite');
  await Promise.all(customers.map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCachedCustomers(): Promise<any[]> {
  const database = await getDB();
  return database.getAll('customersCache');
}
