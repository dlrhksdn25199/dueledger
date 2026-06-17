import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// OS 기본 confirm()/alert() 대신 앱 디자인에 맞는 모달. Promise로 동작.
interface ConfirmOpts {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean; // 삭제 등 위험 동작 → 확인 버튼 빨강
}
interface AlertOpts {
  title?: string;
  message: string;
  confirmText?: string;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOpts; resolve: () => void };

interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  alert: (opts: AlertOpts) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })),
    [],
  );
  const alert = useCallback(
    (opts: AlertOpts) => new Promise<void>((resolve) => setPending({ kind: 'alert', opts, resolve })),
    [],
  );

  function close(result: boolean) {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(result);
    else pending.resolve();
    setPending(null);
  }

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {pending && (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div
            className="modal dialog"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(false);
              if (e.key === 'Enter') close(true);
            }}
          >
            <h2>{pending.opts.title ?? (pending.kind === 'confirm' ? '확인' : '알림')}</h2>
            <p className="dialog-msg">{pending.opts.message}</p>
            <div className="form-actions dialog-actions">
              {pending.kind === 'confirm' && (
                <button onClick={() => close(false)}>{pending.opts.cancelText ?? '취소'}</button>
              )}
              <button
                className={pending.kind === 'confirm' && pending.opts.danger ? 'danger-solid' : 'primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {pending.opts.confirmText ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
