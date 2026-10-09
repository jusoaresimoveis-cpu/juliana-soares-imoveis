import { supabase } from '@/lib/supabase';

// O bucket da mídia e o endereço público de cada arquivo. Moram aqui, e não num
// dos hooks da mídia, porque useMidiaDoImovel.ts e useMutacoesDaMarca.ts usam os
// dois: assim nenhum hook importa valor do outro de volta (useMutacoesDaMarca
// importa de useMidiaDoImovel só tipos, que somem no build).

export const BUCKET = 'property-media';

export function urlPublica(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}
