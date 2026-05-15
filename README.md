# Renova Ponto

MVP interno de ponto eletrônico para a Escola Renova, com uso mobile pelo navegador e validação de geolocalização no servidor.

## O que esta incluso

- Login por codigo e PIN.
- Registro de entrada e saida.
- Validacao do raio da escola no backend.
- Rejeicao quando a precisao do GPS estiver ruim.
- Historico dos ultimos registros.
- Painel admin simples com resumo do dia.
- Exportacao CSV em `/api/admin/export.csv`.
- Manifest e service worker para criar atalho no celular.

## Rodar localmente

```bash
npm start
```

Abra `http://localhost:3000`.

Usuarios iniciais, criados automaticamente no primeiro start:

- Admin: `admin` / `123456`
- Colaborador demo: `colab001` / `1234`

Troque esses PINs antes de usar com a equipe. Os dados ficam em `data/users.json`, `data/punches.json` e `data/sessions.json`.

## Configuracao por variaveis de ambiente

```bash
PORT=3000
SCHOOL_NAME="Escola Renova"
SCHOOL_LATITUDE=-23.55052
SCHOOL_LONGITUDE=-46.633308
ALLOWED_RADIUS_METERS=120
MAX_ACCURACY_METERS=80
ADMIN_PIN=troque-este-pin
DEMO_PIN=troque-este-pin
SESSION_TTL_HOURS=16
```

Use a latitude e longitude reais da escola. O navegador so libera geolocalizacao em HTTPS, exceto em `localhost`, entao em producao coloque o app atras de Nginx/Caddy/Traefik com certificado TLS.

## Deploy sugerido na VPS

1. Copie a pasta do projeto para a VPS.
2. Instale Node.js 20 ou superior.
3. Configure as variaveis de ambiente com a coordenada real da escola.
4. Rode com PM2 ou systemd:

```bash
npm start
```

5. Aponte o dominio para a VPS e faça proxy reverso HTTPS para a porta `3000`.

Exemplo Nginx:

```nginx
server {
  server_name ponto.seudominio.com.br;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Depois use Certbot ou o gerenciador da sua VPS para ativar HTTPS.

## Proximos passos recomendados

- Cadastro e edicao de colaboradores pelo painel admin.
- Politica de horarios, tolerancias e justificativas.
- Relatorios por periodo e por colaborador.
- Backup automatico da pasta `data`.
- Banco SQLite/PostgreSQL quando sair do MVP.
