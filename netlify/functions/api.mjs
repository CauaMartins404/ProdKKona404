// Função do Netlify: toda chamada para /api/... cai aqui.
// A senha do banco NUNCA fica no código: vem da variável MONGODB_URI,
// configurada no painel do Netlify (Site configuration → Environment variables).
import { MongoClient, ObjectId } from "mongodb";
import { getStore } from "@netlify/blobs";
import { createLojaApi } from "../../server/loja.mjs";

let pronto = null;

async function conectar() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI não configurada no Netlify.");
  const client = new MongoClient(uri, { maxPoolSize: 8, serverSelectionTimeoutMS: 7000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "kkona404");
  await Promise.all([
    db.collection("beats").createIndex({ ativo: 1, ordem: 1 }),
    db.collection("pedidos").createIndex({ status: 1, criadoEm: -1 }),
    db.collection("pedidos").createIndex({ ipHash: 1, criadoEm: -1 })
  ]);

  // Capas e áudios enviados pelo painel ficam no Netlify Blobs (armazenamento de arquivos do próprio Netlify).
  // O armazenamento só é aberto quando alguém envia ou pede um arquivo.
  let loja = null;
  const store = () => (loja ||= getStore({ name: "midia", consistency: "strong" }));
  const midia = {
    put: (chave, bytes, tipo) => store().set(chave, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { metadata: { tipo } }),
    async get(chave) {
      const r = await store().getWithMetadata(chave, { type: "arrayBuffer" });
      return r ? { bytes: new Uint8Array(r.data), tipo: r.metadata?.tipo || "application/octet-stream" } : null;
    }
  };

  return createLojaApi({
    db,
    midia,
    toId: v => (ObjectId.isValid(String(v || "")) ? new ObjectId(String(v)) : null),
    idStr: v => String(v),
    env: process.env
  });
}

// Explica o erro de conexão sem mostrar senha nem link do banco.
function motivo(erro) {
  const texto = `${erro?.name || ""} ${erro?.codeName || ""} ${erro?.message || ""}`;
  if (/MONGODB_URI não configurada/.test(texto)) return "a variável MONGODB_URI não chegou na função (faça um novo deploy depois de criar as variáveis).";
  if (/bad auth|Authentication failed|AuthenticationFailed/i.test(texto)) return "usuário ou senha do banco recusados (confira o MONGODB_URI).";
  if (/not authorized|Unauthorized/i.test(texto)) return "o usuário do banco não tem permissão no banco MONGODB_DB (no Atlas, dê a ele \"Read and write to any database\").";
  if (/Invalid scheme|URI must|Invalid connection string|querySrv|ENOTFOUND/i.test(texto)) return "o MONGODB_URI está com formato errado (sem aspas, começando com mongodb+srv://).";
  if (/ServerSelection|timed out|ETIMEDOUT|ECONNREFUSED/i.test(texto)) return "o Atlas não respondeu (em Network Access, libere 0.0.0.0/0).";
  return `${erro?.name || "Erro"} (${erro?.codeName || erro?.code || "sem código"})`;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  let corpo = {};
  let bytes = null;

  try {
    if (!["GET", "HEAD", "DELETE"].includes(request.method)) {
      if ((headers["content-type"] || "").includes("application/json")) corpo = await request.json();
      else bytes = new Uint8Array(await request.arrayBuffer());
    }
  } catch {
    return Response.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  try {
    pronto ||= conectar().catch(erro => { pronto = null; throw erro; });
    const handle = await pronto;
    const r = await handle({
      method: request.method === "HEAD" ? "GET" : request.method,
      path: url.pathname.replace(/\/+$/, ""),
      query: Object.fromEntries(url.searchParams),
      headers, corpo, bytes,
      ip: context?.ip || headers["x-nf-client-connection-ip"] || ""
    });
    if (r.bruto) return new Response(request.method === "HEAD" ? null : r.bruto, { status: r.status, headers: r.headers });
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch (erro) {
    console.error("Falha ao conectar:", erro);
    return Response.json({ ok: false, message: `Sem conexão com o banco de dados: ${motivo(erro)}` }, { status: 503 });
  }
};

export const config = { path: "/api/*" };