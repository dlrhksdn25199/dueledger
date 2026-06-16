// IPC 핸들러 등록 — 채널 → repository 호출 매핑. 렌더러는 이 채널로만 데이터에 닿는다 (P0 #5).
import { ipcMain } from 'electron';
import type { DB } from '../repository/db';
import { createVendorRepository } from '../repository/vendorRepository';
import { createCategoryRepository } from '../repository/categoryRepository';
import { createTransactionRepository } from '../repository/transactionRepository';
import { createLedgerRepository } from '../repository/ledgerRepository';

export function registerIpcHandlers(db: DB): void {
  const vendors = createVendorRepository(db);
  const categories = createCategoryRepository(db);
  const transactions = createTransactionRepository(db);
  const ledger = createLedgerRepository(db);

  ipcMain.handle('vendor:list', () => vendors.getAll());
  ipcMain.handle('vendor:create', (_e, input) => vendors.create(input));
  ipcMain.handle('vendor:update', (_e, id, input) => vendors.update(id, input));
  ipcMain.handle('vendor:remove', (_e, id) => vendors.remove(id));

  ipcMain.handle('category:list', () => categories.getAll());
  ipcMain.handle('category:create', (_e, name) => categories.create(name));
  ipcMain.handle('category:rename', (_e, id, name) => categories.rename(id, name));
  ipcMain.handle('category:countItemsUsing', (_e, id) => categories.countItemsUsing(id));
  // remove는 사용 중이면 CategoryInUseError를 throw → IPC가 거부 프라미스로 렌더러에 전파.
  ipcMain.handle('category:remove', (_e, id) => categories.remove(id));

  ipcMain.handle('transaction:get', (_e, id) => transactions.getById(id));
  ipcMain.handle('transaction:create', (_e, input) => transactions.create(input));
  ipcMain.handle('transaction:update', (_e, id, input) => transactions.update(id, input));
  ipcMain.handle('transaction:remove', (_e, id) => transactions.remove(id));

  ipcMain.handle('ledger:list', (_e, query) => ledger.list(query));
}
