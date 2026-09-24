# Supabase

Um projeto só (região São Paulo) para o site e o CRM.

Ainda vazio. Aqui entram:

- `migrations/`: começa com **um schema base consolidado** do CRM de origem,
  sem nenhum dado da HV, e segue com as migrations da Juliana (aluguel,
  rastreio, portais);
- `functions/`: as edge functions (WhatsApp/uazapi, Meta, Grupo OLX,
  revalidação do site).

Configuração recomendada na criação do projeto (conferir no painel se foi
assim): Data API ligada, **exposição automática de tabelas desligada** (cada
tabela recebe `grant` explícito, como no CRM de origem) e **RLS automático
ligado**.

A senha do banco não entra no repositório nem no chat: o `supabase link` pede
no terminal.
