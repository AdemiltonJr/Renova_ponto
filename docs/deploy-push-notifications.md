# Deploy De Notificacoes Push

## Variaveis obrigatorias

Gere as chaves VAPID uma vez:

```bash
npx web-push generate-vapid-keys
```

Adicione no `.env` da VPS:

```bash
WEB_PUSH_PUBLIC_KEY=cole-a-chave-publica
WEB_PUSH_PRIVATE_KEY=cole-a-chave-privada
WEB_PUSH_SUBJECT=mailto:admin@empreendemjuntos.com.br
TIME_ZONE=America/Sao_Paulo
```

Sem `WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY`, o app continua funcionando, mas o botao de ativar notificacoes informa que push nao esta configurado.

## Backup antes de atualizar

```bash
cd /opt/renova-ponto
backup_dir="backups/pre-push-notifications-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp -a data "$backup_dir/"
```

## Atualizacao segura

```bash
cd /opt/renova-ponto
git fetch origin codex/collaborator-daily-journey-panel
git checkout main
git merge --ff-only origin/codex/collaborator-daily-journey-panel
docker compose up -d --build ponto-renova
```

## Verificacao

```bash
docker compose ps
curl -I http://127.0.0.1:3001
ls -la data
```

Arquivos novos esperados em `data/`:

- `work-schedules.json`
- `push-subscriptions.json`
- `notification-log.json`

## Teste manual

1. Entre no app pelo celular.
2. Toque em `Ativar notificacoes`.
3. Aceite a permissao do navegador.
4. Confirme o texto `Notificacoes ativas neste aparelho.`
5. Ajuste temporariamente uma grade para um horario proximo.
6. Confirme uma notificacao antes do ponto.
7. Nao bata o ponto.
8. Confirme um unico lembrete 5 minutos depois.
