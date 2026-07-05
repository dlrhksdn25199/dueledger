// preload — contextBridge로 안전한 api 표면만 렌더러에 노출. 렌더러는 ipcRenderer/Node 직접 접근 불가.
import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  vendor: {
    list: () => ipcRenderer.invoke('vendor:list'),
    create: (input) => ipcRenderer.invoke('vendor:create', input),
    update: (id, input) => ipcRenderer.invoke('vendor:update', id, input),
    remove: (id) => ipcRenderer.invoke('vendor:remove', id),
  },
  category: {
    list: () => ipcRenderer.invoke('category:list'),
    create: (name) => ipcRenderer.invoke('category:create', name),
    rename: (id, name) => ipcRenderer.invoke('category:rename', id, name),
    countItemsUsing: (id) => ipcRenderer.invoke('category:countItemsUsing', id),
    remove: (id) => ipcRenderer.invoke('category:remove', id),
  },
  transaction: {
    get: (id) => ipcRenderer.invoke('transaction:get', id),
    create: (input) => ipcRenderer.invoke('transaction:create', input),
    update: (id, input) => ipcRenderer.invoke('transaction:update', id, input),
    setPaymentStatus: (id, status) => ipcRenderer.invoke('transaction:setPaymentStatus', id, status),
    setIssueDate: (id, date) => ipcRenderer.invoke('transaction:setIssueDate', id, date),
    setDueDate: (id, date) => ipcRenderer.invoke('transaction:setDueDate', id, date),
    remove: (id) => ipcRenderer.invoke('transaction:remove', id),
    listSummaries: () => ipcRenderer.invoke('transaction:listSummaries'),
    listRecent: (limit) => ipcRenderer.invoke('transaction:listRecent', limit),
  },
  ledger: {
    list: (query) => ipcRenderer.invoke('ledger:list', query),
  },
  import: {
    openDialog: () => ipcRenderer.invoke('import:openDialog'),
    preview: (filePath) => ipcRenderer.invoke('import:preview', filePath),
    commit: (filePath) => ipcRenderer.invoke('import:commit', filePath),
  },
  exportLedger: (query, defaultName) => ipcRenderer.invoke('export:ledger', query, defaultName),
  summary: {
    monthly: () => ipcRenderer.invoke('summary:monthly'),
    byVendor: () => ipcRenderer.invoke('summary:byVendor'),
    byItem: () => ipcRenderer.invoke('summary:byItem'),
    vendorItems: (vendorId) => ipcRenderer.invoke('summary:vendorItems', vendorId),
    itemTransactions: (itemName) => ipcRenderer.invoke('summary:itemTransactions', itemName),
    outstandingByVendor: (month) => ipcRenderer.invoke('summary:outstandingByVendor', month),
    outstandingVendorItems: (vendorId, month) =>
      ipcRenderer.invoke('summary:outstandingVendorItems', vendorId, month),
  },
};

contextBridge.exposeInMainWorld('api', api);
