# Evolução de Relatórios, Perfis e Apuração Contábil

Data: 2026-05-28
Status: rascunho para revisão
Branch: `codex/admin-reports-accounting-planning`

## Contexto

O Renova Ponto já resolve o registro de ponto com geolocalização, edição administrativa e espelho de ponto. A dor atual está na leitura administrativa: a tela mostra uma lista cronológica de eventos, mas não mostra claramente a jornada de cada pessoa, o que falta bater, quais dias estão incompletos, nem como transformar os pontos em informação útil para contabilidade.

Também há uma nova necessidade de negócio: perfis diferentes de colaboradores precisam ter regras diferentes de apuração. Professores podem receber por aula dada, professores horistas por horas, e outros perfis podem seguir carga horária/jornada fixa.

## Objetivos

- Dar ao admin uma visão visual e rápida da jornada de cada colaborador.
- Mostrar inconsistências sem exigir que o admin monte a sequência mentalmente.
- Dar ao colaborador uma visão clara do próprio dia, com o que já foi batido e o que ainda falta.
- Criar o conceito de perfis/regras de apuração para preparar relatórios internos e contábeis.
- Separar presença registrada de cálculo de pagamento/apuração.
- Evoluir em fases pequenas, mantendo o app confiável em produção.

## Não Objetivos Neste Momento

- Não implementar folha de pagamento completa.
- Não enviar dados automaticamente para contabilidade na primeira fase.
- Não alterar a forma básica de bater ponto.
- Não substituir imediatamente o espelho de ponto atual, que continua útil para auditoria.
- Não definir regras trabalhistas finais sem validação operacional/contábil.

## Problema Atual Observado

### Admin

A aba "Espelho de Ponto" mostra cada batida como uma linha independente. Isso é bom para auditoria, mas ruim para responder perguntas operacionais:

- Quem já completou a jornada hoje?
- Quem está sem saída?
- Quem iniciou intervalo e não finalizou?
- Quem tem marcação manual ou recusada?
- Quem bateu ponto em horário fora do esperado?
- Quem deveria ter aula hoje, mas não marcou presença?
- Para quem recebe por aula, quantas aulas devem ser consideradas no período?

### Colaborador

O colaborador vê botões e histórico, mas ainda não tem uma leitura visual do próprio dia:

- Qual etapa da jornada estou agora?
- O que já bati hoje?
- O que ainda falta?
- Há algo inconsistente que eu preciso pedir ajuste?

## Conceitos De Produto

### Perfil

Perfil é a categoria operacional da pessoa. Exemplos iniciais:

- `Professor(a)`
- `Professor Horista`
- `Auxiliar`
- `Limpeza`

O perfil ajuda o admin a organizar pessoas e escolher uma regra padrão, mas não deve ser a única fonte de cálculo. O ideal é separar perfil de regra de apuração.

### Regra De Apuração

Regra de apuração define como transformar marcações em relatório.

Tipos iniciais propostos:

- `jornada`: apuração por presença, horários e carga diária/semanal.
- `horista`: apuração por duração entre entrada/saída, descontando intervalo quando aplicável.
- `aula`: apuração por aulas previstas e presença válida no dia.
- `mensal_administrativo`: presença e inconsistências, sem cálculo financeiro detalhado no app.

Um colaborador pode ter um perfil e uma regra. Exemplo:

- Perfil: `Professor(a)`
- Regra: `aula`

Outro exemplo:

- Perfil: `Professor Horista`
- Regra: `horista`

### Jornada

Jornada é a sequência esperada ou real de pontos em um dia:

- Entrada trabalho
- Início intervalo
- Fim intervalo
- Saída trabalho

Nem todo perfil precisa exigir todos os pontos, mas o sistema deve conseguir mostrar o estado do dia em uma linha visual.

### Inconsistência

Inconsistência é qualquer situação operacional que exige atenção do admin dentro do fluxo normal de uso:

- Sem entrada
- Sem saída
- Intervalo iniciado e não finalizado
- Ponto recusado por localização/precisão
- Registro manual
- Marcações fora da grade esperada
- Aula prevista sem presença
- Presença em dia sem aula prevista

O app já bloqueia sequências inválidas pelo estado dos botões:

- Antes da primeira entrada, apenas `Entrada` fica disponível.
- Após `Entrada`, ficam disponíveis `Saída` e `Iniciar Intervalo`.
- Após `Saída`, apenas uma nova `Entrada` fica disponível.
- Após `Iniciar Intervalo`, apenas `Finalizar Intervalo` fica disponível.
- Após `Finalizar Intervalo`, voltam a ficar disponíveis `Saída` e `Iniciar Intervalo`.

Por isso, casos como saída antes de entrada ou pontos duplicados do mesmo tipo em sequência não devem ser tratados como inconsistências operacionais esperadas. Se aparecerem, devem ser considerados anomalias técnicas/auditoria, indicando bug, manipulação manual indevida ou dado legado.

## Visões Propostas

### 1. Painel Geral Renovado

Substituir gradualmente o foco em "eventos aprovados" por indicadores mais operacionais:

- Pessoas com jornada completa hoje
- Pessoas em jornada aberta
- Pessoas com inconsistência
- Pontos recusados hoje
- Registros manuais hoje
- Professores com aula prevista hoje
- Professores com aula prevista sem presença

O painel ainda pode manter "Registros recentes", mas como seção secundária.

### 2. Jornada Diária Por Colaborador

Nova visualização principal para o admin.

Formato sugerido:

| Colaborador | Entrada | Intervalo início | Intervalo fim | Saída | Estado |
| --- | --- | --- | --- | --- | --- |
| Gabrielle | 07:58 | 12:03 | 13:01 | - | Em aberto |
| Talita | 08:04 | 12:01 | 13:00 | 17:02 | Completa |

Além da tabela, pode haver uma linha visual por pessoa:

`Entrada -> Intervalo -> Retorno -> Saída`

Cada etapa pode ter cor/estado:

- Verde: batido e aprovado
- Amarelo: pendente esperado
- Vermelho: inconsistente/recusado
- Azul: manual/editado
- Cinza: não se aplica

### 3. Calendário Mensal Por Colaborador

Visão para analisar histórico:

- Cada dia como um bloco.
- Cores por situação: completo, incompleto, ausente, manual, recusado, sem aula prevista.
- Clique no dia abre detalhes da jornada daquele dia.

Essa visão é útil para fechamento mensal e revisão antes de enviar para contabilidade.

### 4. Painel Do Colaborador

O colaborador deve ver algo semelhante, mas apenas sobre si:

- Linha do tempo do dia.
- Próxima ação esperada.
- Alertas simples, como "Você iniciou intervalo e ainda não finalizou".
- Histórico recente com estados mais claros.
- A mesma experiência de batida para todos os perfis, sem expor regras internas de cálculo ao colaborador.

Exemplo:

`Entrada 07:59` -> `Intervalo pendente` -> `Retorno pendente` -> `Saída pendente`

### 5. Relatório Para Contabilidade

Relatório por período com uma linha por colaborador e detalhes por dia.

Campos prováveis:

- Período
- Colaborador
- Perfil
- Regra de apuração
- Dias com presença
- Dias completos
- Dias com inconsistência
- Aulas previstas
- Aulas consideradas
- Horas consideradas
- Ajustes manuais
- Observações

O primeiro passo deve ser exportação CSV/Excel. Envio automático vem depois.

Observação: a contabilidade usa o sistema Onvio. Nesta etapa, o objetivo não é integrar diretamente com o Onvio, mas estruturar o relatório em um formato limpo, consistente e fácil de usar em uma automação futura com Codex ou outra ferramenta.

## Regras Por Perfil

### Professor(a) Com Apuração Por Aula

Admin cadastra grade prevista:

- Colaborador
- Dia da semana ou data específica
- Quantidade de aulas
- Horário ou turno, se necessário
- Vigência inicial e final
- Observação opcional

Regra sugerida:

- Se existe aula prevista no dia e há pelo menos uma marcação aprovada no dia, considerar as aulas previstas como dadas.
- Se existe aula prevista e não há marcação aprovada, marcar como "aula prevista sem presença".
- Se há marcação aprovada em dia sem aula prevista, marcar como "presença fora da grade".
- Ajustes manuais podem autorizar presença/aula com justificativa.

Decisão inicial: uma marcação aprovada no dia confirma as aulas previstas daquele professor nessa data. Essa regra é intencionalmente simples para a primeira versão e poderá ser refinada depois.

Importante: a forma de bater ponto permanece igual para todos os perfis. As diferenciações de perfil e apuração são internas, administrativas e usadas em relatórios. Isso preserva o valor legal e o efeito psicológico positivo da marcação de ponto pelo colaborador.

### Professor Horista

Regra provável:

- Calcular horas entre entrada e saída.
- Descontar intervalo quando houver.
- Apontar inconsistências quando faltar entrada/saída.
- Permitir ajuste manual com justificativa.

Questão aberta: a apuração horista deve arredondar minutos? Se sim, qual regra?

### Auxiliar e Limpeza

Regra inicial:

- Jornada diária esperada.
- Alertas para ausência, saída pendente, intervalo incompleto e ponto manual.
- Carga horária semanal/mensal pode ser usada em relatórios futuros.

Questão aberta: esses perfis têm horários fixos diferentes ou apenas carga diária/semanal?

## Dados Necessários

### Usuário

Campos novos propostos:

- `profile`: perfil operacional.
- `calculationRule`: regra de apuração.
- `expectedWorkload`: carga esperada, quando aplicável.
- `active`: já existe.

### Grade De Aula

Nova coleção/tabela futura:

- `id`
- `userId`
- `weekday` ou `date`
- `lessonsCount`
- `startTime`
- `endTime`
- `validFrom`
- `validUntil`
- `active`
- `notes`

### Apuração

A princípio, pode ser calculada sob demanda a partir de:

- usuários
- pontos
- grade prevista
- ajustes manuais

Persistir apuração mensal só deve ser considerado depois que as regras estiverem maduras.

## Fases De Implementação Sugeridas

### Fase 1: Jornada Visual Diária

Criar uma visão admin agrupada por colaborador/dia.

Entregas:

- Agrupar pontos por colaborador.
- Mostrar colunas da jornada.
- Calcular estado do dia.
- Destacar inconsistências.
- Manter espelho atual como auditoria detalhada.

Valor: resolve a dor visual imediata.

### Fase 2: Painel Do Colaborador

Criar linha do tempo da própria jornada.

Entregas:

- Próxima ação esperada.
- Alertas de inconsistência.
- Histórico do dia mais claro.

Valor: reduz dúvidas e pedidos de suporte.

### Fase 3: Perfis e Regras Básicas

Adicionar perfil e regra de apuração ao cadastro de usuários.

Entregas:

- Campos de perfil/regra no cadastro/edição.
- Valores padrão.
- Filtros por perfil no admin.

Valor: prepara relatórios sem mudar ainda a apuração final.

### Fase 4: Grade De Aulas

Adicionar cadastro de aulas previstas para professores.

Entregas:

- Grade semanal/data específica.
- Vigência.
- Quantidade de aulas.
- Detecção de presença em dia previsto.

Valor: começa a transformar ponto em aulas consideradas.

### Fase 5: Relatório De Fechamento

Criar relatório por período para revisão administrativa.

Entregas:

- Resumo por colaborador.
- Detalhe por dia.
- Exportação CSV/Excel.
- Alertas pendentes antes do fechamento.

Valor: base para contabilidade.

### Fase 6: Envio Para Contabilidade

Automatizar envio somente depois de validar o relatório.

Entregas:

- Configurar destinatários.
- Gerar arquivo mensal.
- Registrar histórico de envio.
- Permitir reenvio.

## Decisões Fechadas Para A Primeira Versão

- Perfis da primeira versão: `Professor(a)`, `Professor Horista`, `Auxiliar` e `Limpeza`.
- Para professor com apuração por aula, uma batida aprovada confirma inicialmente as aulas previstas do dia.
- A forma de bater ponto permanece igual para todos os perfis; diferenciações ficam apenas na apuração administrativa.
- O relatório contábil deve ser pensado primeiro como base otimizada para automação futura no Onvio, sem integração direta nesta fase.

## Decisões Ainda Pendentes

- Quais cargos têm carga horária fixa?
- Haverá tolerância de atraso/saída antecipada?
- O relatório para automação futura do Onvio deve sair em CSV simples, Excel ou outro formato tabular?
- Quem aprova ajustes manuais antes do fechamento?
- Depois de fechado o mês, registros podem ser editados?

## Primeira Entrega Recomendada

Começar pela Fase 1: Jornada Visual Diária.

Motivos:

- Ataca a dor mais visível agora.
- Não exige definir todas as regras contábeis.
- Usa os dados que já existem.
- Ajuda a descobrir inconsistências reais antes de automatizar cálculo.
- Prepara componentes visuais que também serão úteis para o colaborador.

## Critérios De Sucesso Da Fase 1

- Admin consegue ver, em menos de um minuto, quem está com jornada completa ou incompleta no dia.
- Admin consegue identificar pontos recusados/manuais sem abrir cada registro.
- A tela deixa claro qual foi a sequência de batidas de cada pessoa.
- O espelho detalhado continua disponível para auditoria.
- Nenhum dado de ponto existente precisa ser migrado para a primeira versão.
