/**
 * A lista de "Sobre o imóvel": os quadradinhos que o CRM mostra em cada
 * categoria. Mora fora de `caracteristicas.ts` porque é dado, não regra; as
 * regras de lá (busca, normalização) leem esta lista, e aquele módulo a
 * reexporta.
 */

import type { CategoriaComLista, GrupoDeItens } from './caracteristicas';

/*
 * A lista saiu da pesquisa do usuário em portais (08/10/2026), curada: sem
 * sinônimo lado a lado (eles viram `sinonimos`), sem o que todo imóvel tem e
 * sem repetir o que o cadastro já tem em campo próprio (quartos, suítes,
 * banheiros, vagas, área). O que faltar, a corretora digita no campo livre.
 * Itens próprios da região: Frente mar, Quadra mar, Box de praia.
 */
export const ITENS_DO_IMOVEL: Record<CategoriaComLista, readonly GrupoDeItens[]> = {
  unidade: [
    {
      grupo: 'Posição e vista',
      itens: [
        { id: 'frente_mar', rotulo: 'Frente mar' },
        { id: 'quadra_mar', rotulo: 'Quadra mar' },
        { id: 'vista_mar', rotulo: 'Vista para o mar' },
        { id: 'vista_mar_parcial', rotulo: 'Vista parcial para o mar' },
        { id: 'vista_panoramica', rotulo: 'Vista panorâmica' },
        { id: 'face_norte', rotulo: 'Face norte' },
        { id: 'sol_manha', rotulo: 'Sol da manhã', sinonimos: ['Face leste'] },
      ],
    },
    {
      grupo: 'Planta e acesso',
      itens: [
        { id: 'duplex', rotulo: 'Duplex' },
        { id: 'pe_direito_duplo', rotulo: 'Pé-direito duplo' },
        { id: 'hall_privativo', rotulo: 'Hall privativo' },
        { id: 'elevador_privativo', rotulo: 'Elevador privativo' },
      ],
    },
    {
      grupo: 'Ambientes',
      itens: [
        { id: 'sala_tv', rotulo: 'Sala de TV', sinonimos: ['Sala íntima'] },
        { id: 'escritorio', rotulo: 'Escritório', sinonimos: ['Home office'] },
        { id: 'cozinha_americana', rotulo: 'Cozinha americana', sinonimos: ['Cozinha integrada'] },
        { id: 'cozinha_ilha', rotulo: 'Cozinha com ilha', sinonimos: ['Ilha'] },
        { id: 'adega', rotulo: 'Adega' },
        { id: 'dependencia_servico', rotulo: 'Dependência de serviço', sinonimos: ['Dependência de empregada', 'Quarto de serviço'] },
      ],
    },
    {
      grupo: 'Quartos e banheiros',
      itens: [
        { id: 'suite_master', rotulo: 'Suíte master' },
        { id: 'demi_suite', rotulo: 'Demi-suíte' },
        { id: 'closet', rotulo: 'Closet' },
        { id: 'lavabo', rotulo: 'Lavabo' },
        { id: 'banheira', rotulo: 'Banheira', sinonimos: ['Banheira na suíte'] },
        { id: 'hidromassagem', rotulo: 'Hidromassagem' },
      ],
    },
    {
      grupo: 'Sacada e churrasqueira',
      itens: [
        { id: 'sacada', rotulo: 'Sacada', sinonimos: ['Varanda'] },
        { id: 'varanda_gourmet', rotulo: 'Sacada gourmet', sinonimos: ['Varanda gourmet'] },
        { id: 'sacada_integrada', rotulo: 'Sacada integrada à sala', sinonimos: ['Varanda integrada', 'Varanda integrada à sala'] },
        { id: 'sacada_envidracada', rotulo: 'Sacada com fechamento em vidro', sinonimos: ['Fechamento de varanda', 'Fechamento em vidro', 'Cortina de vidro'] },
        { id: 'churrasqueira_carvao', rotulo: 'Churrasqueira a carvão' },
        { id: 'churrasqueira_gas', rotulo: 'Churrasqueira a gás' },
        { id: 'churrasqueira_eletrica', rotulo: 'Churrasqueira elétrica' },
      ],
    },
    {
      grupo: 'Área externa privativa',
      itens: [
        { id: 'terraco', rotulo: 'Terraço', sinonimos: ['Terraço privativo'] },
        { id: 'jardim_privativo', rotulo: 'Jardim privativo', sinonimos: ['Garden'] },
        { id: 'quintal', rotulo: 'Quintal' },
        { id: 'espaco_gourmet', rotulo: 'Espaço gourmet' },
        { id: 'edicula', rotulo: 'Edícula' },
        { id: 'piscina_privativa', rotulo: 'Piscina privativa' },
      ],
    },
    {
      grupo: 'Acabamentos',
      itens: [
        { id: 'piso_porcelanato', rotulo: 'Piso porcelanato' },
        { id: 'piso_laminado', rotulo: 'Piso laminado' },
        { id: 'piso_vinilico', rotulo: 'Piso vinílico' },
        { id: 'piso_madeira', rotulo: 'Piso de madeira' },
        { id: 'acabamento_gesso', rotulo: 'Acabamento em gesso', sinonimos: ['Rebaixamento em gesso', 'Teto em gesso'] },
        { id: 'isolamento_acustico', rotulo: 'Isolamento acústico' },
      ],
    },
    {
      grupo: 'Conforto e tecnologia',
      itens: [
        { id: 'ar_condicionado', rotulo: 'Ar-condicionado' },
        { id: 'infra_ar_condicionado', rotulo: 'Infraestrutura para ar-condicionado' },
        { id: 'aquecimento_gas', rotulo: 'Aquecimento a gás', sinonimos: ['Aquecedor a gás'] },
        { id: 'aquecimento_solar', rotulo: 'Aquecimento solar' },
        { id: 'energia_solar', rotulo: 'Energia solar' },
        { id: 'automacao', rotulo: 'Automação residencial', sinonimos: ['Casa inteligente'] },
        { id: 'fechadura_eletronica', rotulo: 'Fechadura eletrônica' },
      ],
    },
    {
      grupo: 'Segurança da casa',
      itens: [
        { id: 'portao_eletronico', rotulo: 'Portão eletrônico', sinonimos: ['Portão automático'] },
        { id: 'alarme', rotulo: 'Alarme' },
        { id: 'cerca_eletrica', rotulo: 'Cerca elétrica' },
        { id: 'cameras_seguranca', rotulo: 'Câmeras de segurança' },
      ],
    },
    {
      grupo: 'Vaga e depósito',
      itens: [
        { id: 'vaga_coberta', rotulo: 'Vaga coberta' },
        { id: 'vaga_privativa', rotulo: 'Vaga privativa' },
        { id: 'vaga_independente', rotulo: 'Vaga independente', sinonimos: ['Vaga livre'] },
        { id: 'vaga_carro_eletrico', rotulo: 'Vaga preparada para carro elétrico', sinonimos: ['Vaga para carro elétrico', 'Vaga com carregador elétrico', 'Infraestrutura para carro elétrico'] },
        { id: 'deposito_privativo', rotulo: 'Depósito privativo', sinonimos: ['Box privativo', 'Hobby box'] },
      ],
    },
    {
      grupo: 'Mobília e condições',
      itens: [
        { id: 'mobiliado', rotulo: 'Mobiliado' },
        { id: 'semimobiliado', rotulo: 'Semimobiliado' },
        { id: 'decorado', rotulo: 'Decorado' },
        { id: 'reformado', rotulo: 'Reformado', sinonimos: ['Recém-reformado'] },
        { id: 'nunca_habitado', rotulo: 'Nunca habitado' },
        { id: 'aceita_pet', rotulo: 'Aceita pet' },
      ],
    },
  ],
  empreendimento: [
    {
      grupo: 'Portaria e segurança',
      itens: [
        { id: 'portaria_24h', rotulo: 'Portaria 24 horas' },
        { id: 'portaria_remota', rotulo: 'Portaria remota', sinonimos: ['Portaria eletrônica'] },
        { id: 'interfone', rotulo: 'Interfone', sinonimos: ['Porteiro eletrônico', 'Videoporteiro'] },
        { id: 'portao_eletronico', rotulo: 'Portão eletrônico', sinonimos: ['Portão automático'] },
        { id: 'clausura', rotulo: 'Clausura na entrada', sinonimos: ['Clausura de veículos', 'Clausura de pedestres', 'Portão duplo'] },
        { id: 'acesso_biometrico', rotulo: 'Controle de acesso por biometria', sinonimos: ['Controle de acesso por reconhecimento facial'] },
        { id: 'cameras_seguranca', rotulo: 'Câmeras de segurança', sinonimos: ['Circuito interno de TV'] },
        { id: 'monitoramento_24h', rotulo: 'Monitoramento 24 horas' },
        { id: 'seguranca_24h', rotulo: 'Segurança 24 horas', sinonimos: ['Vigilância 24 horas'] },
        { id: 'cerca_eletrica', rotulo: 'Cerca elétrica' },
      ],
    },
    {
      grupo: 'Estrutura do prédio',
      itens: [
        { id: 'elevador', rotulo: 'Elevador', sinonimos: ['Elevador social'] },
        { id: 'elevador_servico', rotulo: 'Elevador de serviço' },
        { id: 'hall_decorado', rotulo: 'Hall decorado' },
        { id: 'gerador', rotulo: 'Gerador', sinonimos: ['Gerador de emergência'] },
        { id: 'acessibilidade', rotulo: 'Acessibilidade para PCD', sinonimos: ['Condomínio acessível', 'Acesso PCD'] },
      ],
    },
    {
      grupo: 'Água, energia e gás',
      itens: [
        { id: 'energia_solar', rotulo: 'Energia solar', sinonimos: ['Painéis solares'] },
        { id: 'gas_central', rotulo: 'Gás central', sinonimos: ['Central de gás', 'Gás encanado', 'Rede de gás'] },
        { id: 'gas_individual', rotulo: 'Gás individualizado', sinonimos: ['Medição individual de gás', 'Medidor individual de gás'] },
        { id: 'hidrometro_individual', rotulo: 'Hidrômetro individual', sinonimos: ['Medição individual de água'] },
        { id: 'reuso_agua', rotulo: 'Reuso de água', sinonimos: ['Captação de água da chuva', 'Sistema de reaproveitamento de água'] },
      ],
    },
    {
      grupo: 'Garagem e mobilidade',
      itens: [
        { id: 'box_praia', rotulo: 'Box de praia' },
        { id: 'estacionamento_visitantes', rotulo: 'Estacionamento para visitantes', sinonimos: ['Vagas para visitantes'] },
        { id: 'bicicletario', rotulo: 'Bicicletário', sinonimos: ['Bicicletário coberto'] },
        { id: 'carregador_carro_eletrico', rotulo: 'Carregador para carro elétrico', sinonimos: ['Carregador para veículos elétricos', 'Carregador de carro elétrico'] },
        { id: 'lava_car', rotulo: 'Lava-car', sinonimos: ['Lavagem de carros', 'Car Wash'] },
      ],
    },
    {
      grupo: 'Serviços',
      itens: [
        { id: 'coworking', rotulo: 'Coworking' },
        { id: 'minimercado', rotulo: 'Minimercado', sinonimos: ['Mercado autônomo', 'Loja de conveniência'] },
        { id: 'espaco_delivery', rotulo: 'Espaço delivery', sinonimos: ['Delivery room', 'Guarda-entregas', 'Armários inteligentes', 'Lockers', 'Espaço para encomendas'] },
        { id: 'lavanderia_compartilhada', rotulo: 'Lavanderia compartilhada' },
        { id: 'pet_care', rotulo: 'Pet care' },
        { id: 'wifi_areas_comuns', rotulo: 'Wi-Fi nas áreas comuns', sinonimos: ['Internet nas áreas comuns'] },
      ],
    },
  ],
  lazer: [
    {
      grupo: 'Piscinas',
      itens: [
        { id: 'piscina', rotulo: 'Piscina', sinonimos: ['Piscina adulto'] },
        { id: 'piscina_infantil', rotulo: 'Piscina infantil' },
        { id: 'piscina_aquecida', rotulo: 'Piscina aquecida', sinonimos: ['Piscina climatizada'] },
        { id: 'piscina_coberta', rotulo: 'Piscina coberta' },
        { id: 'piscina_borda_infinita', rotulo: 'Piscina com borda infinita' },
        { id: 'piscina_raia', rotulo: 'Piscina com raia', sinonimos: ['Piscina semiolímpica'] },
        { id: 'solarium', rotulo: 'Solarium' },
      ],
    },
    {
      grupo: 'Festas e gastronomia',
      itens: [
        { id: 'salao_festas', rotulo: 'Salão de festas', sinonimos: ['Salão de festas adulto', 'Salão de festas infantil', 'Salão de festas temático', 'Espaço para eventos'] },
        { id: 'espaco_gourmet', rotulo: 'Espaço gourmet', sinonimos: ['Espaço gourmet externo', 'Espaço gourmet interno'] },
        { id: 'churrasqueira', rotulo: 'Churrasqueira', sinonimos: ['Churrasqueira a carvão', 'Churrasqueira a gás', 'Churrasqueira elétrica'] },
        { id: 'quiosque', rotulo: 'Quiosque', sinonimos: ['Quiosque com churrasqueira'] },
        { id: 'forno_pizza', rotulo: 'Forno de pizza', sinonimos: ['Pizzaria'] },
        { id: 'pub', rotulo: 'Pub', sinonimos: ['Bar'] },
        { id: 'adega', rotulo: 'Adega' },
      ],
    },
    {
      grupo: 'Crianças e entretenimento',
      itens: [
        { id: 'playground', rotulo: 'Playground', sinonimos: ['Playground externo', 'Playground coberto', 'Parquinho', 'Jogos infantis'] },
        { id: 'brinquedoteca', rotulo: 'Brinquedoteca', sinonimos: ['Espaço kids', 'Espaço infantil', 'Espaço baby'] },
        { id: 'salao_jogos', rotulo: 'Salão de jogos', sinonimos: ['Sala de jogos', 'Game room', 'Sala de sinuca'] },
        { id: 'cinema', rotulo: 'Sala de cinema', sinonimos: ['Cinema'] },
      ],
    },
    {
      grupo: 'Esportes',
      itens: [
        { id: 'academia', rotulo: 'Academia', sinonimos: ['Academia equipada', 'Fitness', 'Espaço fitness', 'Sala de ginástica', 'Studio fitness'] },
        { id: 'quadra', rotulo: 'Quadra poliesportiva' },
        { id: 'quadra_areia', rotulo: 'Quadra de areia', sinonimos: ['Beach tennis', 'Quadra de beach tennis', 'Quadra de vôlei de praia'] },
        { id: 'quadra_tenis', rotulo: 'Quadra de tênis' },
        { id: 'campo_futebol', rotulo: 'Campo de futebol', sinonimos: ['Futebol society'] },
        { id: 'pista_caminhada', rotulo: 'Pista de caminhada', sinonimos: ['Pista de cooper', 'Pista de corrida'] },
      ],
    },
    {
      grupo: 'Bem-estar',
      itens: [
        { id: 'sauna', rotulo: 'Sauna', sinonimos: ['Sauna seca', 'Sauna úmida', 'Sauna a vapor'] },
        { id: 'hidromassagem', rotulo: 'Hidromassagem', sinonimos: ['Piscina de hidromassagem', 'Jacuzzi', 'Ofurô'] },
        { id: 'sala_massagem', rotulo: 'Sala de massagem' },
        { id: 'sala_pilates', rotulo: 'Sala de pilates', sinonimos: ['Studio de pilates', 'Pilates'] },
        { id: 'sala_yoga', rotulo: 'Sala de yoga', sinonimos: ['Studio de yoga', 'Yoga'] },
      ],
    },
    {
      grupo: 'Ar livre e pet',
      itens: [
        { id: 'rooftop', rotulo: 'Rooftop', sinonimos: ['Sky lounge'] },
        { id: 'area_verde', rotulo: 'Área verde', sinonimos: ['Jardim', 'Parque', 'Bosque'] },
        { id: 'pet_place', rotulo: 'Pet place', sinonimos: ['Espaço pet', 'Playground pet', 'Área para cães', 'Área de recreação pet'] },
        { id: 'beach_club', rotulo: 'Beach club' },
      ],
    },
  ],
};
