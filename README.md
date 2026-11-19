# KKona404 · Beats & Services

Loja online do produtor musical **KKona404**: catálogo de beats com player, licenças, serviços e um painel para o produtor gerenciar tudo.
Feita com HTML, CSS e JavaScript puro, uma função serverless no **Netlify**, **MongoDB Atlas** para os dados e **Netlify Blobs** para capas e áudios enviados pelo painel.

## O que ele faz

**Loja (`/`)**
- Catálogo vindo do banco, com busca e filtros por gênero e BPM.
- Player fixo com anterior/próxima, barra de progresso, volume e tecla espaço para tocar/pausar.
- Pedido de licença (beat completo ou com stems) e de serviços (beat exclusivo, mix & master, feat, contato).
- Cada pedido é **salvo no banco com um código** (ex.: `KK-3F9A21`) e o cliente segue para o WhatsApp com a mensagem pronta.
- Termos de uso na primeira visita e faixa de promoção configurável.

**Painel (`/admin.html`)**
- Login com senha.
- **Pedidos**: lista, filtro por status, mudança de status, anotação interna e botão para responder o cliente.
- **Beats**: cadastrar, editar, esconder/mostrar e apagar. Capa e áudio podem ser **enviados direto pelo painel** (até 5,5 MB) ou por link.
- **Configurações**: texto da promoção e número de WhatsApp que recebe os pedidos.

## Segurança

- Nenhuma senha no código: tudo vem das **variáveis de ambiente do Netlify**.
- O `.gitignore` bloqueia arquivos `.env` e de credenciais.
- O preço do pedido é calculado no servidor (não dá para mudar pelo navegador).
- Proteção contra spam: campo-armadilha para robôs e limite de pedidos por visitante. O IP não é guardado, só um código embaralhado.
- Links de capa/áudio só aceitam arquivos da própria loja ou `https://`.

## Estrutura

```text
public/
  index.html, admin.html
  css/loja.css, css/admin.css
  js/loja.js, js/admin.js, js/comum.js
  assets/img, assets/audio     arquivos que já existiam
server/
  loja.mjs                     regras da API (testáveis sem banco)
  token.mjs                    token de login do painel
netlify/functions/
  api.mjs                      liga a API ao MongoDB e ao Netlify Blobs (rotas /api/*)
tests/                         testes automáticos
scripts/demo.mjs               demonstração local sem banco
```

## Publicar no Netlify

1. Suba este projeto para um repositório no GitHub.
2. No Netlify: **Add new project → Import an existing project → GitHub** e escolha o repositório (ou, no site que já existe, **Site configuration → Build & deploy → Link repository**).
3. Em **Site configuration → Environment variables**, crie:

| Variável | O que é |
|---|---|
| `MONGODB_URI` | Link de conexão do MongoDB Atlas |
| `MONGODB_DB` | Nome do banco, ex.: `kkona404` |
| `JWT_SECRET` | Texto aleatório com 24+ caracteres |
| `ADMIN_PASSWORD` | Senha para entrar em `/admin.html` |

4. Em **Deploys**, clique em **Trigger deploy**.
5. No MongoDB Atlas, em **Network Access**, libere `0.0.0.0/0`.

Na primeira visita, a loja cadastra sozinha o beat "Mas você não vem". Os áudios `hardnaoemassagem.mp3` e `fim2.mp3` já estão em `assets/audio`: é só cadastrar pelo painel usando os links `assets/audio/hardnaoemassagem.mp3` e `assets/audio/fim2.mp3` (capas em `assets/img`).

## Rodar no computador

Precisa do Node.js 20 ou mais novo.

```bash
npm test        # roda os testes da API
npm run demo    # loja em http://localhost:8888 e painel em /admin.html (senha demo1234)
```
