# CLAUDE.md

**gerenciador_zap** — monta os mailings de campanhas de HSM (WhatsApp) e cria cada um, já agendado, no Chat Ativo do Loopiee. Substitui o trabalho manual de: pegar a base do marketing, tirar quem saiu, pôr o link da imagem e gerar o CSV.

## Stack

Node ≥ 20, Express, sem build. Front em `public/` (JS puro). Estado em um JSON (`data/db.json`, gravação atômica).
O processo lê o `db.json` uma vez e mantém em memória: editar o arquivo por fora exige `pm2 stop` antes e `start` depois, senão a mudança não aparece e é sobrescrita no próximo salvamento. `data/` e `*.csv` ficam fora do git: têm nome e telefone de pessoas.

## Integração com o Loopiee

Só pela API HTTP do `apiLoopiee` (na .101 roda no pm2 como `apiMidiaHub`, porta 3535), com um usuário do sistema (`LOOPIEE_USERNAME`/`PASSWORD`). Rotas usadas:
- `POST /signin` → token JWT (relogin automático no 401)
- `GET /multichannel/channel`, `GET /multichannel/channel/:id` (templates em `waba_templates`)
- `POST /multichannel/mailing/upload` (multipart: `file` .csv `;`, `name`, `channel_id`, `template_id`, `scheduled_at` ISO com fuso). Sem `scheduled_at` dispara na hora: é o envio avulso.
- O upload **não devolve o id**: o id é achado por `GET /multichannel/mailing?q=<nome>`. O Loopiee **corta o nome em 50 caracteres**, por isso o nome começa com `zap-<8 primeiros do id>` e é cortado em 50 antes do upload (`mailingName` em `server.js`).
- `GET /multichannel/channel/:id/meta-health` → qualidade/status/limite do número e status/qualidade de cada template, lidos na hora na Meta com o token do canal. Template fora de `APPROVED` barra a criação do mailing e o envio avulso; se a rota falhar, não barra.
- `GET /multichannel/mailing/:id/details` (máx. 1000 por página) → retornos: `name`, `delivery_status`, `delivery_status_at` (horário de Brasília sem fuso), `delivery_error_code`/`_message`, `button_reply`. A aba Envios lista essas linhas, só do último "Atualizar retornos".

Nenhum acesso direto ao banco do Loopiee.

## Regras de quem recebe (`src/campaign.js`)

Telefone interno = DDD + número, sem o 55. Ao criar um mailing, o sistema primeiro relê os retornos de todos os mailings da campanha. Tira:
- remoção manual (tabela `removals`, desfazível);
- quem clicou no botão com o texto `optout_text` da campanha (padrão "Parar de receber"), em qualquer mailing da campanha, inclusive avulso;
- `131050` (desligou o marketing da empresa no próprio WhatsApp): conta como quem pediu para sair, para sempre;
- `131026` (não entregável / sem WhatsApp): sai para sempre;
- `131049` (limite de marketing da Meta): sai **só do envio seguinte** que a base dele teria recebido, e volta depois.

A prévia confere com a criação via `expected`: se a lista mudou entre a prévia e o clique, a criação é recusada.

Horários são de Brasília, guardados como `YYYY-MM-DDTHH:mm` e enviados com `-03:00`. A janela de 24h (limite da BM, `limit_24h`) conta as pessoas diferentes nas 24h que terminam no horário de cada mensagem. Usa quem foi de fato nos mailings criados e a prévia nos rascunhos.

## Acesso

Senha única (`APP_PASSWORD`). Cookie HttpOnly assinado com HMAC (`SESSION_SECRET`), válido por 7 dias. 5 erros travam o IP por 15 minutos. Em produção, colocar atrás de HTTPS com `COOKIE_SECURE=1` e `TRUST_PROXY=1`.

## Seed da VGX CMS 2026

`npm run seed:vgx -- base-geral.csv gerentes.csv` cria a campanha com as 7 mensagens, os horários e as imagens do S3 (`app-loopiee-1/campanhas/vgx-cms26/`). O canal e os templates são escolhidos na tela.

## Deploy

No ar na .54 em `https://devlp.loopiee.com.br/zap/` (nginx tira o `/zap`, pm2 `gerenciadorZap`, porta 3090). Por isso o front usa só caminhos relativos (`api/...`), sem `/` na frente.
