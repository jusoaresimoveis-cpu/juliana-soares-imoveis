import { Loader2, X } from 'lucide-react';

export function DialogoQR({
  qrcode,
  carregando,
  onFechar,
}: {
  qrcode: string | null;
  carregando: boolean;
  onFechar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ler código para conectar"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="w-full max-w-[380px] rounded-[22px] bg-sheet p-6 text-center shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3 text-left">
          <div>
            <h2 className="text-xl font-bold">Leia o código</h2>
            <p className="mt-0.5 text-sm text-tx-2">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid aspect-square w-full place-items-center rounded-2xl bg-white p-4">
          {qrcode ? (
            <img
              src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
              alt="Código para conectar o WhatsApp"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="flex items-center gap-2 text-base text-tx-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              {carregando ? 'Gerando código…' : 'Sem código disponível'}
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-tx-3">
          O código se renova sozinho a cada 20 segundos. A tela fecha quando conectar.
        </p>
      </div>
    </div>
  );
}
