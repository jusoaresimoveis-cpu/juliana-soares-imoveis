import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useMidiaAssinada, type Mensagem } from '@/hooks/useConversas';

/**
 * A mídia recebida, servida por URL assinada.
 *
 * Os quatro estados aparecem, e cada um diz uma coisa diferente ao corretor:
 * baixando, pronta, falhou, ou ainda sem arquivo. Deixar tudo como um ícone
 * genérico é o que faz alguém concluir que "o sistema não recebe foto".
 */
export function Midia({ mensagem }: { mensagem: Mensagem }) {
  const { data: url, isLoading } = useMidiaAssinada(
    mensagem.media_status === 'pronta' ? mensagem.media_path : null,
  );

  if (mensagem.media_status === 'pendente') {
    return (
      <p className="mb-1 flex items-center gap-1.5 text-sm opacity-80">
        <Loader2 className="h-3 w-3 animate-spin" />
        Baixando {mensagem.kind}…
      </p>
    );
  }

  if (mensagem.media_status === 'falhou') {
    return (
      <p className="mb-1 flex items-start gap-1.5 text-sm">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        Não foi possível baixar este arquivo.
      </p>
    );
  }

  if (isLoading) {
    return <p className="mb-1 text-sm opacity-70">Abrindo…</p>;
  }

  if (!url) {
    return <p className="mb-1 text-sm opacity-70">({mensagem.kind})</p>;
  }

  const ehImagem = mensagem.media_mime?.startsWith('image/');
  const ehAudio = mensagem.media_mime?.startsWith('audio/');
  const ehVideo = mensagem.media_mime?.startsWith('video/');

  if (ehImagem) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1 block">
        <img src={url} alt="" className="max-h-64 w-full rounded-lg object-cover" />
      </a>
    );
  }
  if (ehAudio) return <audio controls src={url} className="mb-1 w-full max-w-[240px]" />;
  if (ehVideo) return <video controls src={url} className="mb-1 max-h-64 w-full rounded-lg" />;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-1.5 text-sm font-semibold underline"
    >
      <ExternalLink className="h-3 w-3" />
      {mensagem.media_filename ?? 'Abrir arquivo'}
    </a>
  );
}
