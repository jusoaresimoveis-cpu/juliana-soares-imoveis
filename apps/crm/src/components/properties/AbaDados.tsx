import {
  CIDADES_ATENDIDAS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABEL,
  reaisComCentavos,
  type ResumoDoEmpreendimento,
} from '@contracts';
import type { Property } from '@/hooks/useProperties';
import { Switch } from '@/components/Switch';
import { cn } from '@/lib/utils';
import { Campo, inputCls } from './CampoDoFormulario';
import { CamposDoEmpreendimento } from './CamposDoEmpreendimento';
import { ValoresDoImovel } from './ValoresDoImovel';
import { apenasDigitos } from './formularioDoImovel';
import type { EstadoDoImovel, MudarCampo } from './PropertyFormDialog';

interface Props {
  imovel: Property | null;
  f: EstadoDoImovel;
  set: MudarCampo;
  alternarRegime: (k: 'for_sale' | 'for_rent') => (v: boolean) => void;
  alternarEmpreendimento: (v: boolean) => void;
  resumo: ResumoDoEmpreendimento | null;
  aPartir: number | null;
  precoCents: number | null;
  tabelaCents: number | null;
  deCents: number | null;
  tabelaSemDesconto: boolean;
  entregaInvalida: boolean;
}

/** A aba "Dados": nome, endereço, tipo, situação, regime, valores, medidas e o empreendimento. */
export function AbaDados({
  imovel,
  f,
  set,
  alternarRegime,
  alternarEmpreendimento,
  resumo,
  aPartir,
  precoCents,
  tabelaCents,
  deCents,
  tabelaSemDesconto,
  entregaInvalida,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Campo className="col-span-2 sm:col-span-4" rotulo="Título (no CRM)">
        <input
          autoFocus
          required
          value={f.title}
          onChange={(e) => set('title')(e.target.value)}
          placeholder="Apto 302 do Ed. Mar Azul"
          className={inputCls}
        />
      </Campo>

      {/*
        O nome público é outro campo porque o título do CRM é de uso
        interno (costuma ter nome de dono e de prédio). Trocar o nome
        público muda o endereço da página; o antigo continua levando a
        ela.
      */}
      <Campo className="col-span-2 sm:col-span-4" rotulo="Nome no site (opcional)">
        <input
          value={f.public_title}
          onChange={(e) => set('public_title')(e.target.value)}
          placeholder="Vazio: o site monta, como “Apartamento com 2 quartos em Meia Praia, Itapema”"
          className={inputCls}
        />
        {/* No empreendimento, o título que o site monta sai das plantas com
            unidade à venda (`tituloPadrao`): a planta que esgota muda o título. */}
        {f.has_units && !f.public_title.trim() && (
          <span className="text-sm font-semibold text-warn">
            Dê um nome no site: sem ele, o título do anúncio muda sozinho conforme as plantas se esgotam.
          </span>
        )}
      </Campo>

      {/* Moravam numa aba só para elas; são três campos e cabem aqui. */}
      <Campo className="col-span-2" rotulo="Bairro">
        <input value={f.neighborhood} onChange={(e) => set('neighborhood')(e.target.value)} className={inputCls} />
      </Campo>
      {/* Sugere as cidades atendidas pelo nome exato: é por ele que o site
          monta as páginas de cidade. */}
      <Campo rotulo="Cidade">
        <input list="cidades-atendidas" value={f.city} onChange={(e) => set('city')(e.target.value)} className={inputCls} />
        <datalist id="cidades-atendidas">
          {CIDADES_ATENDIDAS.map((c) => (
            <option key={c.slug} value={c.nome} />
          ))}
        </datalist>
      </Campo>
      <Campo rotulo="UF">
        <input maxLength={2} value={f.state} onChange={(e) => set('state')(e.target.value.toUpperCase())} className={inputCls} />
      </Campo>

      <Campo className="col-span-2" rotulo="Tipo">
        <select value={f.property_type} onChange={(e) => set('property_type')(e.target.value)} className={inputCls}>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Campo>

      <Campo className="col-span-2" rotulo="Situação">
        {/* Com unidades, a situação é a delas (o banco calcula); a única
            decisão de quem cadastra é tirar da vitrine. */}
        {f.has_units ? (
          <select
            value={f.status === 'suspenso' ? 'suspenso' : 'unidades'}
            onChange={(e) => set('status')(e.target.value === 'suspenso' ? 'suspenso' : 'disponivel')}
            className={inputCls}
          >
            <option value="unidades">
              {imovel?.has_units && !imovel.units_table_month ? 'Pelas unidades, a partir da 1ª tabela' : 'Pelas unidades'}
              {imovel?.has_units && imovel.status !== 'suspenso' ? ` (${PROPERTY_STATUS_LABEL[imovel.status]})` : ''}
            </option>
            <option value="suspenso">Suspenso</option>
          </select>
        ) : (
          <select value={f.status} onChange={(e) => set('status')(e.target.value)} className={inputCls}>
            {PROPERTY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROPERTY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
      </Campo>

      <div className="col-span-2 flex flex-col gap-1 rounded-md border border-line bg-card-2 px-3.5 py-3 sm:col-span-4">
        <Switch marcado={f.has_units} onMudar={alternarEmpreendimento} rotulo="Empreendimento com várias unidades" />
        <p className="pl-[46px] text-sm text-tx-3">
          {f.has_units
            ? 'Um imóvel só no site (uma página, um código, os mesmos leads), com as unidades embaixo, cada uma com planta, preço e situação. É venda: sem aluguel.'
            : 'Prédio na planta ou em obras com várias unidades à venda. As salas comerciais de um prédio são outro cadastro, do tipo Sala comercial.'}
        </p>
        {!f.has_units && imovel?.has_units && (
          <p className="pl-[46px] text-sm font-semibold text-warn">
            As unidades continuam cadastradas, mas o preço e a situação voltam a ser digitados aqui.
          </p>
        )}
      </div>

      {!f.has_units && (
        <div className="col-span-2 flex items-center gap-4 sm:col-span-4">
          <Switch marcado={f.for_sale} onMudar={alternarRegime('for_sale')} rotulo="À venda" />
          <Switch marcado={f.for_rent} onMudar={alternarRegime('for_rent')} rotulo="Para alugar (anual)" />
        </div>
      )}

      {f.has_units && (
        <p className="col-span-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2 sm:col-span-4">
          {resumo && resumo.total > 0 ? (
            // Antes da primeira tabela o banco não calcula nada das
            // unidades (todas nascem vendidas).
            imovel?.has_units && !imovel.units_table_month ? (
              'Nenhuma tabela aplicada ainda: o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades. Aplique a tabela do mês em “Unidades”, na ficha do imóvel.'
            ) : aPartir !== null ? (
              <>
                Calculado das unidades: a partir de <b>{reaisComCentavos(aPartir)}</b> ·{' '}
                {resumo.disponiveis === 1 ? '1 disponível' : `${resumo.disponiveis} disponíveis`}
                {resumo.disponiveis === 0 && ' (só reservadas)'}
              </>
            ) : (
              'Calculado das unidades: nenhuma disponível nem reservada.'
            )
          ) : imovel?.has_units ? (
            'Sem unidades ainda: cadastre as plantas e as unidades em “Unidades”, na ficha do imóvel.'
          ) : (
            'Cadastre as plantas e as unidades depois de salvar.'
          )}
        </p>
      )}

      <ValoresDoImovel
        f={f}
        set={set}
        precoCents={precoCents}
        tabelaCents={tabelaCents}
        deCents={deCents}
        tabelaSemDesconto={tabelaSemDesconto}
      />

      {f.has_units ? (
        <p className="col-span-2 text-sm text-tx-3 sm:col-span-4">
          Quartos, suítes, banheiros, vagas e área vêm das plantas, cadastradas em “Unidades”.
        </p>
      ) : (
        <>
          <Campo rotulo="Área privativa (m²)">
            <input inputMode="decimal" value={f.area_built} onChange={(e) => set('area_built')(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Área total (m²)">
            <input inputMode="decimal" value={f.area_total} onChange={(e) => set('area_total')(e.target.value)} className={inputCls} />
          </Campo>
          {/* Os quartos que NÃO são suíte: o site soma os dois (2 quartos e
              1 suíte são 3 dormitórios) e mostra os dois lado a lado. */}
          <Campo rotulo="Quartos (sem as suítes)">
            <input inputMode="numeric" value={f.bedrooms} onChange={(e) => set('bedrooms')(apenasDigitos(e.target.value))} className={inputCls} />
          </Campo>
          <Campo rotulo="Suítes">
            <input inputMode="numeric" value={f.suites} onChange={(e) => set('suites')(apenasDigitos(e.target.value))} className={inputCls} />
          </Campo>
          <Campo rotulo="Banheiros">
            <input inputMode="numeric" value={f.bathrooms} onChange={(e) => set('bathrooms')(apenasDigitos(e.target.value))} className={inputCls} />
          </Campo>
          <Campo rotulo="Vagas">
            <input inputMode="numeric" value={f.parking_spots} onChange={(e) => set('parking_spots')(apenasDigitos(e.target.value))} className={inputCls} />
          </Campo>
        </>
      )}

      {f.has_units && <CamposDoEmpreendimento f={f} set={set} entregaInvalida={entregaInvalida} />}

      <Campo className="col-span-2 sm:col-span-4" rotulo="Descrição">
        <textarea
          rows={3}
          value={f.description}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="O texto que aparece na página do imóvel no site."
          className={cn(inputCls, 'resize-none')}
        />
      </Campo>

      <div className="col-span-2 flex items-center gap-4 sm:col-span-4">
        <Switch marcado={f.is_published} onMudar={(v) => set('is_published')(v)} rotulo="Publicado" />
        <Switch marcado={f.is_featured} onMudar={(v) => set('is_featured')(v)} rotulo="Destaque" />
      </div>
    </div>
  );
}
