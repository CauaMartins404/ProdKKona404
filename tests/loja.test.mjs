// Testes da API da loja (rodar com: npm test). Banco e arquivos falsos, sem internet.
import test from "node:test";
import assert from "node:assert/strict";
import { createLojaApi } from "../server/loja.mjs";
import { fakeDb, fakeIds } from "./fake-db.mjs";

const env = { JWT_SECRET: "k".repeat(32), ADMIN_PASSWORD: "senha-do-painel" };

function setup() {
  const db = fakeDb();
  const arquivos = new Map();
  const midia = { put: async (k, b, t) => arquivos.set(k, { bytes: b, tipo: t }), get: async k => arquivos.get(k) || null };
  const api = createLojaApi({ db, midia, ...fakeIds, env });
  const chamar = (method, path, extra = {}) => api({ method, path, headers: {}, ...extra });
  return { db, api, chamar, arquivos };
}

async function admin(chamar) {
  const r = await chamar("POST", "/api/admin/login", { corpo: { senha: "senha-do-painel" } });
  assert.equal(r.status, 200);
  return { authorization: `Bearer ${r.json.token}` };
}

test("primeira visita cadastra o beat que já existia, só uma vez", async () => {
  const { chamar, db } = setup();
  const r1 = await chamar("GET", "/api/beats");
  assert.equal(r1.json.beats.length, 1);
  assert.equal(r1.json.beats[0].titulo, "Mas você não vem");
  await chamar("GET", "/api/beats");
  assert.equal(db.collections.beats.docs.length, 1);
});

test("depois que o dono apaga todos os beats, eles não voltam sozinhos", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  const [beat] = (await chamar("GET", "/api/beats")).json.beats;
  await chamar("DELETE", `/api/admin/beats/${beat.id}`, { headers: h });
  assert.equal((await chamar("GET", "/api/beats")).json.beats.length, 0);
});

test("painel exige senha certa", async () => {
  const { chamar } = setup();
  assert.equal((await chamar("POST", "/api/admin/login", { corpo: { senha: "errada" } })).status, 401);
  assert.equal((await chamar("GET", "/api/admin/pedidos")).status, 401);
  assert.equal((await chamar("GET", "/api/admin/pedidos", { headers: { authorization: "Bearer xyz" } })).status, 401);
});

test("cadastrar, editar, esconder e apagar beat", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  const novo = await chamar("POST", "/api/admin/beats", { headers: h, corpo: { titulo: "Hard não é massagem", genero: "Trap", bpm: "150", tom: "F Minor", audio: "assets/audio/hardnaoemassagem.mp3", capa: "assets/img/hardnaoemassagem.jpeg", precoBase: "45,50", precoStems: 70 } });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.beat.precoBase, 45.5);
  const id = novo.json.beat.id;

  const editado = await chamar("PUT", `/api/admin/beats/${id}`, { headers: h, corpo: { bpm: 160, ativo: false } });
  assert.equal(editado.json.beat.bpm, 160);
  assert.equal(editado.json.beat.ativo, false);
  assert.equal(editado.json.beat.titulo, "Hard não é massagem");

  const publicos = (await chamar("GET", "/api/beats")).json.beats.map(b => b.titulo);
  assert.ok(!publicos.includes("Hard não é massagem"), "beat escondido não aparece na loja");
  assert.equal((await chamar("GET", "/api/admin/beats", { headers: h })).json.beats.length, 2);

  assert.equal((await chamar("DELETE", `/api/admin/beats/${id}`, { headers: h })).status, 200);
  assert.equal((await chamar("DELETE", `/api/admin/beats/${id}`, { headers: h })).status, 404);
});

test("beat recusa links perigosos e campos obrigatórios vazios", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  assert.equal((await chamar("POST", "/api/admin/beats", { headers: h, corpo: { titulo: "X", audio: "javascript:alert(1)" } })).status, 400);
  assert.equal((await chamar("POST", "/api/admin/beats", { headers: h, corpo: { titulo: "", audio: "assets/audio/a.mp3" } })).status, 400);
  assert.equal((await chamar("POST", "/api/admin/beats", { headers: h, corpo: { titulo: "X" } })).status, 400);
});

test("pedido de licença salva no banco com preço do servidor e gera link do WhatsApp", async () => {
  const { chamar, db } = setup();
  const [beat] = (await chamar("GET", "/api/beats")).json.beats;
  const r = await chamar("POST", "/api/pedidos", { corpo: { tipo: "licenca", beatId: beat.id, licenca: "stems", nome: "Cliente Teste", contato: "16 99999-0000", valor: 1 }, ip: "1.2.3.4" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.match(r.json.pedido.codigo, /^KK-[0-9A-F]{6}$/);
  assert.ok(r.json.whatsapp.startsWith("https://wa.me/5516994586033?text="));
  assert.ok(decodeURIComponent(r.json.whatsapp).includes("Beat + Stems"));
  const salvo = db.collections.pedidos.docs[0];
  assert.equal(salvo.valor, 60);
  assert.equal(salvo.status, "novo");
  assert.ok(!("ip" in salvo) && salvo.ipHash.length === 32, "não guarda o IP puro");
});

test("pedido valida dados e bloqueia excesso", async () => {
  const { chamar } = setup();
  assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "hack", nome: "Ana", contato: "123456" } })).status, 400);
  assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "mixagem", nome: "A", contato: "123456" } })).status, 400);
  assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "licenca", beatId: "f".repeat(24), licenca: "base", nome: "Ana", contato: "123456" } })).status, 404);
  for (let i = 0; i < 5; i++) {
    assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "mixagem", nome: "Ana", contato: "123456" }, ip: "9.9.9.9" })).status, 200);
  }
  assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "mixagem", nome: "Ana", contato: "123456" }, ip: "9.9.9.9" })).status, 429);
  assert.equal((await chamar("POST", "/api/pedidos", { corpo: { tipo: "mixagem", nome: "Ana", contato: "123456" }, ip: "8.8.8.8" })).status, 200);
});

test("robô que preenche o campo escondido não salva pedido", async () => {
  const { chamar, db } = setup();
  const r = await chamar("POST", "/api/pedidos", { corpo: { tipo: "contato", nome: "Bot", contato: "spam@spam", site: "http://spam" } });
  assert.equal(r.status, 200);
  assert.equal(db.collections.pedidos?.docs.length ?? 0, 0);
});

test("painel lista, filtra, atualiza e apaga pedidos", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  await chamar("POST", "/api/pedidos", { corpo: { tipo: "exclusivo", nome: "Ana", contato: "ana@email.com", mensagem: "beat estilo doomshop" } });
  await chamar("POST", "/api/pedidos", { corpo: { tipo: "feat", nome: "Beto", contato: "@beto_mc" } });
  const lista = (await chamar("GET", "/api/admin/pedidos", { headers: h })).json.pedidos;
  assert.equal(lista.length, 2);
  const id = lista.find(p => p.nome === "Ana").id;
  const atualizado = await chamar("PATCH", `/api/admin/pedidos/${id}`, { headers: h, corpo: { status: "em andamento", nota: "pagou sinal" } });
  assert.equal(atualizado.json.pedido.status, "em andamento");
  assert.equal((await chamar("PATCH", `/api/admin/pedidos/${id}`, { headers: h, corpo: { status: "xyz" } })).status, 400);
  assert.equal((await chamar("GET", "/api/admin/pedidos", { headers: h, query: { status: "novo" } })).json.pedidos.length, 1);
  const resumo = (await chamar("GET", "/api/admin/resumo", { headers: h })).json.resumo;
  assert.deepEqual([resumo.novos, resumo.andamento], [1, 1]);
  assert.equal((await chamar("DELETE", `/api/admin/pedidos/${id}`, { headers: h })).status, 200);
});

test("configuração da promoção e do WhatsApp", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  assert.equal((await chamar("PUT", "/api/admin/config", { headers: h, corpo: { whatsapp: "123", promoAtiva: true } })).status, 400);
  await chamar("PUT", "/api/admin/config", { headers: h, corpo: { whatsapp: "+55 (16) 98888-7777", promoAtiva: false, promoTexto: "Black Friday" } });
  const c = (await chamar("GET", "/api/config")).json.config;
  assert.deepEqual(c, { promoAtiva: false, promoTexto: "Black Friday", whatsapp: "5516988887777" });
  const r = await chamar("POST", "/api/pedidos", { corpo: { tipo: "contato", nome: "Ana", contato: "123456" } });
  assert.ok(r.json.whatsapp.startsWith("https://wa.me/5516988887777"));
});

test("envio de arquivo: aceita MP3/imagem, recusa outros e serve com Range", async () => {
  const { chamar } = setup();
  const h = await admin(chamar);
  const bytes = new Uint8Array(1000).map((_, i) => i % 256);
  assert.equal((await chamar("POST", "/api/admin/upload", { headers: { ...h, "content-type": "text/html" }, bytes })).status, 415);
  assert.equal((await chamar("POST", "/api/admin/upload", { headers: { ...h, "content-type": "audio/mpeg" }, bytes: new Uint8Array(6_000_000) })).status, 413);
  const up = await chamar("POST", "/api/admin/upload", { headers: { ...h, "content-type": "audio/mpeg" }, bytes });
  assert.match(up.json.url, /^\/api\/midia\/[\w-]+\.mp3$/);

  const inteiro = await chamar("GET", up.json.url);
  assert.equal(inteiro.status, 200);
  assert.equal(inteiro.bruto.length, 1000);
  assert.equal(inteiro.headers["Content-Type"], "audio/mpeg");
  const parte = await chamar("GET", up.json.url, { headers: { range: "bytes=100-199" } });
  assert.equal(parte.status, 206);
  assert.equal(parte.bruto.length, 100);
  assert.equal(parte.bruto[0], 100);
  assert.equal(parte.headers["Content-Range"], "bytes 100-199/1000");
  assert.equal((await chamar("GET", "/api/midia/nao-existe.mp3")).status, 404);
  assert.equal((await chamar("POST", "/api/admin/upload", { headers: { "content-type": "audio/mpeg" }, bytes })).status, 401);
});
