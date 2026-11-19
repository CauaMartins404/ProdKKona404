// Modo demonstração: roda a loja no seu computador com banco e arquivos de mentira.
//   npm run demo   →   loja em http://localhost:8888   ·   painel em http://localhost:8888/admin.html
// Senha do painel na demonstração: demo1234
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createLojaApi } from "../server/loja.mjs";
import { fakeDb, fakeIds } from "../tests/fake-db.mjs";

const raiz = fileURLToPath(new URL("../public/", import.meta.url));
const porta = Number(process.env.PORT || 8888);
const tipos = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };

const arquivos = new Map();
const api = createLojaApi({
  db: fakeDb(), ...fakeIds,
  midia: { put: async (k, b, t) => arquivos.set(k, { bytes: b, tipo: t }), get: async k => arquivos.get(k) || null },
  env: { JWT_SECRET: "demo-".repeat(8), ADMIN_PASSWORD: "demo1234" }
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const partes = [];
      for await (const p of req) partes.push(p);
      const bruto = Buffer.concat(partes);
      const json = (req.headers["content-type"] || "").includes("application/json");
      const r = await api({
        method: req.method, path: url.pathname.replace(/\/+$/, ""), query: Object.fromEntries(url.searchParams),
        headers: req.headers, corpo: json && bruto.length ? JSON.parse(bruto) : {}, bytes: json ? null : new Uint8Array(bruto),
        ip: req.socket.remoteAddress
      });
      if (r.bruto) { res.writeHead(r.status, r.headers); return res.end(Buffer.from(r.bruto)); }
      res.writeHead(r.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(r.json));
    }
    const caminho = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
    const arquivo = join(raiz, caminho);
    if (!arquivo.startsWith(raiz)) throw new Error("fora");
    const info = await stat(arquivo);
    const tipo = tipos[extname(arquivo).toLowerCase()] || "application/octet-stream";
    const faixa = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    const dados = await readFile(arquivo);
    if (faixa) {
      const ini = Number(faixa[1]), fim = faixa[2] ? Number(faixa[2]) : info.size - 1;
      res.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fim}/${info.size}`, "Accept-Ranges": "bytes" });
      return res.end(dados.subarray(ini, fim + 1));
    }
    res.writeHead(200, { "Content-Type": tipo, "Accept-Ranges": "bytes" });
    res.end(dados);
  } catch {
    res.writeHead(404);
    res.end("Não encontrado");
  }
}).listen(porta, () => console.log(`Loja: http://localhost:${porta}  ·  Painel: http://localhost:${porta}/admin.html (senha demo1234)`));
