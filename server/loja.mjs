// Regras do servidor da loja KKona404.
// Recebe o banco, o armazenamento de arquivos e as variáveis prontos ("deps"),
// então dá para testar tudo com versões falsas, sem internet.
import crypto from "node:crypto";
import { signToken, verifyToken, safeEqual, parseDuration } from "./token.mjs";

const ISSUER = "kkona404-admin";
export const TIPOS_PEDIDO = ["licenca", "exclusivo", "mixagem", "feat", "contato"];
export const STATUS_PEDIDO = ["novo", "em andamento", "concluido", "cancelado"];
const LICENCAS = ["base", "stems"];
const MIDIA_TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg" };
const MIDIA_MAX = 5_500_000; // limite do Netlify Functions é ~6 MB por envio

export const BEATS_INICIAIS = [
  {
    titulo: "Mas você não vem", genero: "Doomshop", bpm: 140, tom: "G# Major",
    capa: "assets/img/vocenaovem.jpg", audio: "assets/audio/vocenaovem.mp3",
    precoBase: 40, precoStems: 60, precoBaseAntigo: 50, precoStemsAntigo: 75, ativo: true, ordem: 1
  }
];

export const CONFIG_PADRAO = {
  promoAtiva: true,
  promoTexto: "PROMOÇÃO ESPECIAL: 20% OFF EM TODO O SITE!",
  whatsapp: "5516994586033"
};

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const texto = (v, max = 500) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const textoLongo = (v, max = 2000) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
function inteiro(v, min, max, padrao = min) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
}
function preco(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 100000) * 100) / 100 : null;
}
// Só aceita caminhos da própria loja ou links https — evita "javascript:" e afins.
function urlMidia(v) {
  const s = texto(v, 600);
  if (!s) return "";
  if (/^https:\/\//i.test(s) || /^\/api\/midia\/[\w.-]+$/.test(s) || /^assets\/[\w./-]+$/.test(s)) return s;
  fail(400, "Link de arquivo inválido. Use um link https:// ou envie o arquivo.");
}

export function createLojaApi(deps) {
  const { db, toId, idStr, midia, env = {}, agora = () => new Date() } = deps;
  const beats = () => db.collection("beats");
  const pedidos = () => db.collection("pedidos");
  const configs = () => db.collection("config");

  // ---------- autenticação do painel ----------
  function segredo() {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 24) fail(500, "Configure JWT_SECRET (24+ caracteres) no Netlify.");
    return env.JWT_SECRET;
  }
  function exigirAdmin(headers) {
    const m = String(headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (!m) fail(401, "Faça login no painel.");
    try {
      const s = verifyToken(m[1], segredo(), { issuer: ISSUER });
      if (s.role !== "admin") throw new Error();
    } catch {
      fail(401, "Sessão expirada. Entre de novo.");
    }
  }

  // ---------- formatação ----------
  const beatPublico = b => ({
    id: idStr(b._id), titulo: b.titulo, genero: b.genero, bpm: b.bpm, tom: b.tom, capa: b.capa, audio: b.audio,
    precoBase: b.precoBase, precoStems: b.precoStems, precoBaseAntigo: b.precoBaseAntigo ?? null,
    precoStemsAntigo: b.precoStemsAntigo ?? null, ordem: b.ordem ?? 0
  });
  const beatAdmin = b => ({ ...beatPublico(b), ativo: b.ativo !== false, criadoEm: b.criadoEm });
  const pedidoAdmin = p => ({
    id: idStr(p._id), codigo: p.codigo, tipo: p.tipo, beatId: p.beatId || null, beatTitulo: p.beatTitulo || "",
    licenca: p.licenca || "", valor: p.valor ?? null, nome: p.nome, contato: p.contato, mensagem: p.mensagem || "",
    status: p.status, nota: p.nota || "", criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm
  });

  function dadosBeat(corpo, parcial = false) {
    const d = {};
    const set = (k, v) => { if (!parcial || corpo[k] !== undefined) d[k] = v; };
    set("titulo", texto(corpo.titulo, 80));
    set("genero", texto(corpo.genero, 40));
    set("bpm", inteiro(corpo.bpm, 40, 300, 140));
    set("tom", texto(corpo.tom, 30));
    set("capa", urlMidia(corpo.capa));
    set("audio", urlMidia(corpo.audio));
    set("precoBase", preco(corpo.precoBase) ?? 40);
    set("precoStems", preco(corpo.precoStems) ?? 60);
    set("precoBaseAntigo", preco(corpo.precoBaseAntigo));
    set("precoStemsAntigo", preco(corpo.precoStemsAntigo));
    set("ativo", corpo.ativo !== false);
    set("ordem", inteiro(corpo.ordem, -9999, 9999, 0));
    if (!parcial || "titulo" in d) if (!d.titulo) fail(400, "O beat precisa de um título.");
    if (!parcial || "audio" in d) if (!d.audio) fail(400, "O beat precisa de um áudio (envie o arquivo ou cole um link).");
    return d;
  }

  async function lerConfig() {
    const doc = await configs().findOne({ _id: "loja" });
    return { ...CONFIG_PADRAO, ...(doc || {}) };
  }

  // Na primeira vez que o site roda, cadastra os beats que já existiam.
  async function semearSePreciso() {
    const doc = await configs().findOne({ _id: "loja" });
    if (doc?.semeado) return;
    if ((await beats().countDocuments({})) === 0) {
      for (const b of BEATS_INICIAIS) await beats().insertOne({ ...b, criadoEm: agora() });
    }
    if (doc) await configs().updateOne({ _id: "loja" }, { $set: { semeado: true } });
    else await configs().insertOne({ _id: "loja", ...CONFIG_PADRAO, semeado: true });
  }

  const novoCodigo = () => `KK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const hashIp = ip => crypto.createHash("sha256").update(`${env.JWT_SECRET || ""}:${ip || "?"}`).digest("hex").slice(0, 32);
  const reais = v => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

  function linkWhatsapp(numero, mensagem) {
    return `https://wa.me/${String(numero).replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
  }

  // ---------- rotas ----------
  const rotas = [
    ["GET", /^\/api\/config$/, async () => {
      const c = await lerConfig();
      return { config: { promoAtiva: c.promoAtiva, promoTexto: c.promoTexto, whatsapp: c.whatsapp } };
    }],

    ["GET", /^\/api\/beats$/, async () => {
      await semearSePreciso();
      const lista = await beats().find({ ativo: true }).sort({ ordem: 1, criadoEm: -1 }).toArray();
      return { beats: lista.map(beatPublico) };
    }],

    ["POST", /^\/api\/pedidos$/, async ({ corpo, ip }) => {
      if (texto(corpo.site)) return { pedido: { codigo: novoCodigo() } }; // armadilha para robôs
      const tipo = TIPOS_PEDIDO.includes(corpo.tipo) ? corpo.tipo : fail(400, "Tipo de pedido inválido.");
      const nome = texto(corpo.nome, 80);
      const contato = texto(corpo.contato, 120);
      if (nome.length < 2) fail(400, "Diga seu nome.");
      if (contato.length < 5) fail(400, "Deixe um WhatsApp, Instagram ou e-mail para contato.");

      const ipHash = hashIp(ip);
      const recentes = await pedidos().countDocuments({ ipHash, criadoEm: { $gte: new Date(agora().getTime() - 10 * 60 * 1000) } });
      if (recentes >= 5) fail(429, "Muitos pedidos seguidos. Espere alguns minutos.");

      const pedido = { tipo, nome, contato, mensagem: textoLongo(corpo.mensagem, 1500), status: "novo", ipHash, codigo: novoCodigo(), criadoEm: agora(), atualizadoEm: agora() };
      if (tipo === "licenca") {
        const _id = toId(corpo.beatId);
        const beat = _id && await beats().findOne({ _id, ativo: true });
        if (!beat) fail(404, "Beat não encontrado.");
        const licenca = LICENCAS.includes(corpo.licenca) ? corpo.licenca : fail(400, "Escolha a licença.");
        Object.assign(pedido, { beatId: idStr(beat._id), beatTitulo: beat.titulo, licenca, valor: licenca === "stems" ? beat.precoStems : beat.precoBase });
      }
      await pedidos().insertOne(pedido);

      const c = await lerConfig();
      const resumo = {
        licenca: `quero a licença ${pedido.licenca === "stems" ? "Beat + Stems" : "Beat completo"} de "${pedido.beatTitulo}" (${reais(pedido.valor ?? 0)})`,
        exclusivo: "quero encomendar um beat exclusivo",
        mixagem: "quero um orçamento de mix & master",
        feat: "tenho uma proposta de feat/colab",
        contato: "vim pelo site"
      }[tipo];
      const mensagem = `Salve KKona! Sou ${nome}, ${resumo}. Pedido ${pedido.codigo}.`;
      return { pedido: { codigo: pedido.codigo }, whatsapp: linkWhatsapp(c.whatsapp, mensagem) };
    }],

    ["GET", /^\/api\/midia\/([\w.-]+)$/, async ({ params, headers }) => {
      const arquivo = await midia.get(params[0]);
      if (!arquivo) fail(404, "Arquivo não encontrado.");
      const bytes = arquivo.bytes;
      const base = { "Content-Type": arquivo.tipo, "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes" };
      const faixa = String(headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
      if (faixa && (faixa[1] || faixa[2])) {
        let inicio = faixa[1] ? Number(faixa[1]) : bytes.length - Number(faixa[2]);
        let fim = faixa[1] && faixa[2] ? Number(faixa[2]) : bytes.length - 1;
        inicio = Math.max(0, inicio); fim = Math.min(bytes.length - 1, fim);
        if (inicio > fim) return { status: 416, bruto: new Uint8Array(), headers: { ...base, "Content-Range": `bytes */${bytes.length}` } };
        return { status: 206, bruto: bytes.subarray(inicio, fim + 1), headers: { ...base, "Content-Range": `bytes ${inicio}-${fim}/${bytes.length}` } };
      }
      return { status: 200, bruto: bytes, headers: base };
    }],

    ["POST", /^\/api\/admin\/login$/, async ({ corpo }) => {
      if (!env.ADMIN_PASSWORD) fail(500, "Configure ADMIN_PASSWORD no Netlify.");
      if (!safeEqual(String(corpo.senha || ""), env.ADMIN_PASSWORD)) fail(401, "Senha incorreta.");
      return { token: signToken({ role: "admin" }, segredo(), { issuer: ISSUER, expiresIn: parseDuration(env.SESSION_DURATION, 12 * 3600) }) };
    }],

    ["GET", /^\/api\/admin\/resumo$/, async () => {
      const [novos, andamento, totalBeats] = await Promise.all([
        pedidos().countDocuments({ status: "novo" }), pedidos().countDocuments({ status: "em andamento" }), beats().countDocuments({})
      ]);
      return { resumo: { novos, andamento, beats: totalBeats } };
    }, true],

    ["GET", /^\/api\/admin\/beats$/, async () => {
      await semearSePreciso();
      const lista = await beats().find({}).sort({ ordem: 1, criadoEm: -1 }).toArray();
      return { beats: lista.map(beatAdmin) };
    }, true],

    ["POST", /^\/api\/admin\/beats$/, async ({ corpo }) => {
      await semearSePreciso();
      const doc = { ...dadosBeat(corpo), criadoEm: agora() };
      const r = await beats().insertOne(doc);
      return { beat: beatAdmin({ ...doc, _id: r.insertedId }) };
    }, true],

    ["PUT", /^\/api\/admin\/beats\/(\w+)$/, async ({ corpo, params }) => {
      const _id = toId(params[0]) || fail(400, "Beat inválido.");
      const r = await beats().updateOne({ _id }, { $set: { ...dadosBeat(corpo, true), atualizadoEm: agora() } });
      if (!r.matchedCount) fail(404, "Beat não encontrado.");
      return { beat: beatAdmin(await beats().findOne({ _id })) };
    }, true],

    ["DELETE", /^\/api\/admin\/beats\/(\w+)$/, async ({ params }) => {
      const _id = toId(params[0]) || fail(400, "Beat inválido.");
      const r = await beats().deleteOne({ _id });
      if (!r.deletedCount) fail(404, "Beat não encontrado.");
      return {};
    }, true],

    ["GET", /^\/api\/admin\/pedidos$/, async ({ query }) => {
      const filtro = STATUS_PEDIDO.includes(query.status) ? { status: query.status } : {};
      const lista = await pedidos().find(filtro).sort({ criadoEm: -1 }).limit(300).toArray();
      return { pedidos: lista.map(pedidoAdmin) };
    }, true],

    ["PATCH", /^\/api\/admin\/pedidos\/(\w+)$/, async ({ corpo, params }) => {
      const _id = toId(params[0]) || fail(400, "Pedido inválido.");
      const mudanca = { atualizadoEm: agora() };
      if (corpo.status !== undefined) mudanca.status = STATUS_PEDIDO.includes(corpo.status) ? corpo.status : fail(400, "Status inválido.");
      if (corpo.nota !== undefined) mudanca.nota = textoLongo(corpo.nota, 1000);
      const r = await pedidos().updateOne({ _id }, { $set: mudanca });
      if (!r.matchedCount) fail(404, "Pedido não encontrado.");
      return { pedido: pedidoAdmin(await pedidos().findOne({ _id })) };
    }, true],

    ["DELETE", /^\/api\/admin\/pedidos\/(\w+)$/, async ({ params }) => {
      const _id = toId(params[0]) || fail(400, "Pedido inválido.");
      const r = await pedidos().deleteOne({ _id });
      if (!r.deletedCount) fail(404, "Pedido não encontrado.");
      return {};
    }, true],

    ["PUT", /^\/api\/admin\/config$/, async ({ corpo }) => {
      const numero = String(corpo.whatsapp ?? "").replace(/\D/g, "");
      if (numero.length < 10 || numero.length > 15) fail(400, "WhatsApp inválido. Use só números com DDI e DDD, ex.: 5516999999999.");
      const nova = { promoAtiva: Boolean(corpo.promoAtiva), promoTexto: texto(corpo.promoTexto, 140), whatsapp: numero };
      const atual = await configs().findOne({ _id: "loja" });
      if (atual) await configs().updateOne({ _id: "loja" }, { $set: nova });
      else await configs().insertOne({ _id: "loja", ...nova });
      return { config: nova };
    }, true],

    ["POST", /^\/api\/admin\/upload$/, async ({ bytes, headers }) => {
      const tipo = String(headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = MIDIA_TIPOS[tipo] || fail(415, "Formato não aceito. Use JPG, PNG, WEBP, MP3, WAV ou OGG.");
      if (!bytes?.length) fail(400, "Arquivo vazio.");
      if (bytes.length > MIDIA_MAX) fail(413, "Arquivo grande demais (máx. 5,5 MB). Para áudio, envie um MP3.");
      const chave = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
      await midia.put(chave, bytes, tipo);
      return { url: `/api/midia/${chave}` };
    }, true]
  ];

  return async function handle({ method, path, query = {}, headers = {}, corpo = {}, bytes = null, ip = "" }) {
    try {
      for (const [metodo, padrao, fn, admin] of rotas) {
        const m = path.match(padrao);
        if (!m || metodo !== method) continue;
        if (admin) exigirAdmin(headers);
        const r = await fn({ corpo: corpo || {}, params: m.slice(1), query, headers, bytes, ip });
        if (r && r.bruto) return r;
        return { status: 200, json: { ok: true, ...r } };
      }
      fail(404, "Rota não encontrada.");
    } catch (erro) {
      if (erro instanceof HttpError) return { status: erro.status, json: { ok: false, message: erro.message } };
      console.error("Erro na API:", erro);
      return { status: 500, json: { ok: false, message: "Erro interno do servidor." } };
    }
  };
}
