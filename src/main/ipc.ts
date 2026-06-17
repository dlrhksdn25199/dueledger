// IPC 핸들러 등록 — 채널 → repository 호출 매핑. 렌더러는 이 채널로만 데이터에 닿는다 (P0 #5).
import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { DB } from '../repository/db';
import { createVendorRepository } from '../repository/vendorRepository';
import { createCategoryRepository } from '../repository/categoryRepository';
import { createTransactionRepository } from '../repository/transactionRepository';
import { createLedgerRepository } from '../repository/ledgerRepository';
import { createImportRepository } from '../repository/importRepository';
import { createSummaryRepository } from '../repository/summaryRepository';
import { parseLedgerWorkbook } from '../parser/excelImport';
import { writeLedgerWorkbook } from '../parser/excelExport';

export function registerIpcHandlers(db: DB): void {
  const vendors = createVendorRepository(db);
  const categories = createCategoryRepository(db);
  const transactions = createTransactionRepository(db);
  const ledger = createLedgerRepository(db);
  const importer = createImportRepository(db);
  const summary = createSummaryRepository(db);

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
  ipcMain.handle('transaction:setPaymentStatus', (_e, id, status) => transactions.setPaymentStatus(id, status));
  ipcMain.handle('transaction:setIssueDate', (_e, id, date) => transactions.setIssueDate(id, date));
  ipcMain.handle('transaction:setDueDate', (_e, id, date) => transactions.setDueDate(id, date));
  ipcMain.handle('transaction:remove', (_e, id) => transactions.remove(id));
  ipcMain.handle('transaction:listSummaries', () => transactions.listSummaries());
  ipcMain.handle('transaction:listRecent', (_e, limit) => transactions.listRecent(limit));

  ipcMain.handle('ledger:list', (_e, query) => ledger.list(query));

  ipcMain.handle('summary:monthly', () => summary.monthly());
  ipcMain.handle('summary:byVendor', () => summary.byVendor());
  ipcMain.handle('summary:byItem', () => summary.byItem());
  ipcMain.handle('summary:vendorItems', (_e, vendorId) => summary.vendorItems(vendorId));
  ipcMain.handle('summary:itemTransactions', (_e, itemName) => summary.itemTransactions(itemName));

  // 엑셀 임포트 — 파일 선택은 메인의 네이티브 대화상자, 파싱→적재는 parser+importRepository.
  ipcMain.handle('import:openDialog', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = dialog.showOpenDialogSync(win!, {
      title: '거래명세서 엑셀 선택',
      filters: [{ name: '엑셀 파일', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    });
    return res && res.length ? res[0] : null;
  });
  ipcMain.handle('import:preview', (_e, filePath: string) => importer.preview(parseLedgerWorkbook(filePath)));
  ipcMain.handle('import:commit', (_e, filePath: string) => importer.commit(parseLedgerWorkbook(filePath)));

  // 엑셀 내보내기(외부 공유) — 현재 조회 결과를 저장 대화상자로 .xlsx 저장.
  ipcMain.handle('export:ledger', (e, query, defaultName?: string) => {
    const rows = ledger.list(query);
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const filePath = dialog.showSaveDialogSync(win!, {
      title: '엑셀로 내보내기',
      defaultPath: defaultName && defaultName.trim() !== '' ? defaultName : 'DueLedger-거래명세.xlsx',
      filters: [{ name: '엑셀 파일', extensions: ['xlsx'] }],
    });
    if (!filePath) return null; // 취소
    writeLedgerWorkbook(filePath, rows);
    return { path: filePath, count: rows.length };
  });
}
