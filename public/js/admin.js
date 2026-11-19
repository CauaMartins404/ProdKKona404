// KKona404 — painel do produtor
import { $, h, aviso, ocupado, api, reais } from "./comum.js";

const TIPOS = { licenca: "Licença de beat", exclusivo: "Beat exclusivo", mixagem: "Mix & Master", feat: "Feat / Colab", contato: "Contato" };
const STATUS = [["novo", "Novo"], ["em andamento", "Em andamento"], ["concluido", "Concluído"], ["cancelado", "Cancelado"]];

const estado = { token: lerToken(), beats: [], editando: null };

function lerToken() { try { return sessionStorage.getItem("kk.admin") || ""; } catch { return ""; } }
function gravarToken(t) { try { t ? sessionStorage.setItem("kk.admin", t) : sessionStorage.removeItem("kk.admin"); } catch { /* sem armazenamento */ } }

async function chamar(caminho, opcoes = {}) {
  try {
    return await api(caminho, { ...opcoes, token: estado.token });
  } catch (erro) {
    if (erro.status === 401) sair();
    throw erro;
  }
}

// ---------- login ----------
async function entrar(e) {
  e.preventDefault();
  const botao = $("btn-entrar");
  ocupado(botao, true, "Entrando...");
  try {
    const r = await api("/api/admin/login", { metodo: "POST", dados: { senha: $("senha").value } });
    estado.token = r.token;
    gravarToken(r.token);
    mostrarPainel();
  } catch (erro) {
    aviso(erro.message, "erro");
    $("senha").select();
  } finally {
    ocupado(botao, false);
  }
}

function sair() {
  estado.token = "";
  gravarToken("");
  $("tela-painel").classList.add("hidden");
  $("tela-login").classList.remove("hidden");
  $("senha").value = "";
}

function mostrarPainel() {
  $("tela-login").classList.add("hidden");
  $("tela-painel").classList.remove("hidden");
  trocarAba("pedidos");
  carregarResumo();
}

function trocarAba(aba) {
  for (const b of document.querySelectorAll(".abas button")) b.setAttribute("aria-selected", String(b.dataset.aba === aba));
  for (const id of ["pedidos", "beats", "config"]) $(`aba-${id}`).classList.toggle("hidden", id !== aba);
  if (aba === "pedidos") carregarPedidos();
  if (aba === "beats") carregarBeats();
  if (aba === "config") carregarConfig();
}

async function carregarResumo() {
  try {
    const { resumo } = await chamar("/api/admin/resumo");
    $("resumo").replaceChildren(
      h("div", { class: "novo" }, h("strong", { text: resumo.novos }), h("span", { text: "pedidos novos" })),
      h("div", {}, h("strong", { text: resumo.andamento }), h("span", { text: "em andamento" })),
      h("div", {}, h("strong", { text: resumo.beats }), h("span", { text: "beats cadastrados" })));
  } catch { /* resumo é opcional */ }
}

// ---------- pedidos ----------
async function carregarPedidos() {
  const alvo = $("lista-pedidos");
  alvo.replaceChildren(h("div", { class: "esqueleto" }));
  try {
    const status = $("f-status").value;
    const { pedidos } = await chamar(`/api/admin/pedidos${status ? `?status=${encodeURIComponent(status)}` : ""}`);
    if (!pedidos.length) return alvo.replaceChildren(h("div", { class: "estado" }, h("strong", { text: "Nenhum pedido aqui" }), "Quando alguém pedir pela loja, aparece nesta lista."));
    alvo.replaceChildren(...pedidos.map(cartaoPedido));
  } catch (erro) {
    alvo.replaceChildren(h("div", { class: "estado" }, h("strong", { text: "Erro ao carregar" }), erro.message));
  }
}

function linkContato(contato) {
  const numeros = contato.replace(/\D/g, "");
  if (contato.includes("@") && contato.includes(".") && !contato.startsWith("@")) return `mailto:${contato}`;
  if (contato.startsWith("@")) return `https://instagram.com/${contato.slice(1)}`;
  if (numeros.length >= 10) return `https://wa.me/${numeros.length <= 11 ? `55${numeros}` : numeros}`;
  return null;
}

function cartaoPedido(p) {
  const link = linkContato(p.contato);
  const classe = p.status.replace(" ", "-");
  return h("article", { class: `cartao pedido ${classe}` },
    h("div", { class: "pedido-topo" },
      h("div", {}, h("strong", { text: TIPOS[p.tipo] || p.tipo }), " ", h("span", { class: "pedido-cod", text: p.codigo })),
      h("span", { class: "pedido-data", text: new Date(p.criadoEm).toLocaleString("pt-BR") })),
    h("div", { class: "pedido-info" },
      h("span", {}, "Cliente: ", h("b", { text: p.nome })),
      h("span", {}, "Contato: ", link ? h("a", { href: link, target: "_blank", rel: "noopener", text: p.contato }) : h("b", { text: p.contato })),
      p.beatTitulo && h("span", {}, "Beat: ", h("b", { text: `${p.beatTitulo} (${p.licenca === "stems" ? "com stems" : "completo"})` })),
      p.valor !== null && h("span", {}, "Valor: ", h("b", { text: reais(p.valor) }))),
    p.mensagem && h("div", { class: "pedido-msg", text: p.mensagem }),
    h("div", { class: "pedido-acoes" },
      h("select", { "aria-label": "Status do pedido", onchange: e => atualizarPedido(p.id, { status: e.target.value }) },
        STATUS.map(([v, t]) => h("option", { value: v, text: t, selected: v === p.status }))),
      h("input", { value: p.nota, placeholder: "Anotação interna (ex.: pagou, enviado...)", "aria-label": "Anotação", onchange: e => atualizarPedido(p.id, { nota: e.target.value }, false) }),
      link ? h("a", { class: "btn btn-contorno btn-p", href: link, target: "_blank", rel: "noopener", text: "Responder" }) : h("span"),
      h("button", { type: "button", class: "btn btn-perigo btn-p", text: "Apagar", onclick: () => apagarPedido(p) })));
}

async function atualizarPedido(id, dados, recarregar = true) {
  try {
    await chamar(`/api/admin/pedidos/${id}`, { metodo: "PATCH", dados });
    aviso("Pedido atualizado.");
    carregarResumo();
    if (recarregar) carregarPedidos();
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

async function apagarPedido(p) {
  if (!confirm(`Apagar o pedido ${p.codigo} de ${p.nome}?`)) return;
  try {
    await chamar(`/api/admin/pedidos/${p.id}`, { metodo: "DELETE" });
    carregarPedidos();
    carregarResumo();
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

// ---------- beats ----------
async function carregarBeats() {
  const alvo = $("lista-beats");
  alvo.replaceChildren(h("div", { class: "esqueleto" }));
  try {
    const { beats } = await chamar("/api/admin/beats");
    estado.beats = beats;
    $("generos").replaceChildren(...[...new Set(beats.map(b => b.genero).filter(Boolean))].map(g => h("option", { value: g })));
    if (!beats.length) return alvo.replaceChildren(h("div", { class: "estado" }, h("strong", { text: "Nenhum beat ainda" }), "Clique em “+ Novo beat”."));
    alvo.replaceChildren(...beats.map(b => h("article", { class: `cartao beat-linha ${b.ativo ? "" : "oculto"}` },
      h("img", { src: b.capa || "assets/img/Pierrot.jpeg", alt: "" }),
      h("div", {},
        h("strong", { text: b.titulo }), !b.ativo && h("span", { class: "etiqueta", text: "escondido" }),
        h("div", { class: "tags" }, [b.genero, b.bpm && `${b.bpm} BPM`, b.tom, `ordem ${b.ordem}`].filter(Boolean).map(t => h("span", { text: t })))),
      h("div", { class: "precos" }, h("div", { text: `Completo ${reais(b.precoBase)}` }), h("div", { text: `Stems ${reais(b.precoStems)}` })),
      h("div", { class: "beat-botoes" },
        h("button", { type: "button", class: "btn btn-contorno btn-p", text: "Editar", onclick: () => abrirBeat(b) }),
        h("button", { type: "button", class: "btn btn-contorno btn-p", text: b.ativo ? "Esconder" : "Mostrar", onclick: () => alternarBeat(b) }),
        h("button", { type: "button", class: "btn btn-perigo btn-p", text: "Apagar", onclick: () => apagarBeat(b) })))));
  } catch (erro) {
    alvo.replaceChildren(h("div", { class: "estado" }, h("strong", { text: "Erro ao carregar" }), erro.message));
  }
}

const CAMPOS = {
  titulo: "b-titulo", genero: "b-genero", bpm: "b-bpm", tom: "b-tom", capa: "b-capa", audio: "b-audio",
  precoBase: "b-preco-base", precoBaseAntigo: "b-preco-base-antigo", precoStems: "b-preco-stems", precoStemsAntigo: "b-preco-stems-antigo", ordem: "b-ordem"
};

function abrirBeat(beat = null) {
  estado.editando = beat;
  $("t-beat").textContent = beat ? "Editar beat" : "Novo beat";
  $("form-beat").reset();
  if (beat) {
    for (const [chave, id] of Object.entries(CAMPOS)) $(id).value = beat[chave] ?? "";
    $("b-ativo").checked = beat.ativo;
  } else {
    $("b-ordem").value = estado.beats.length + 1;
  }
  previas();
  $("dlg-beat").showModal();
  $("b-titulo").focus();
}

function previas() {
  const capa = $("b-capa").value.trim();
  $("b-capa-previa").src = capa || "assets/img/Pierrot.jpeg";
  const audio = $("b-audio").value.trim();
  const previa = $("b-audio-previa");
  if (!audio) previa.removeAttribute("src");
  else if (previa.getAttribute("src") !== audio) previa.src = audio;
}

async function enviarArquivo(arquivo, campo, botaoRotulo) {
  if (!arquivo) return;
  if (arquivo.size > 5_500_000) return aviso("Arquivo grande demais (máx. 5,5 MB). Para áudio, use um MP3.", "erro", 6000);
  const original = botaoRotulo.firstChild.textContent;
  botaoRotulo.firstChild.textContent = "Enviando...";
  try {
    const r = await chamar("/api/admin/upload", { metodo: "POST", corpoBruto: arquivo, tipo: arquivo.type || "application/octet-stream", tempo: 60000 });
    $(campo).value = r.url;
    previas();
    aviso("Arquivo enviado.");
  } catch (erro) {
    aviso(erro.message, "erro", 6000);
  } finally {
    botaoRotulo.firstChild.textContent = original;
  }
}

async function salvarBeat(e) {
  e.preventDefault();
  const dados = Object.fromEntries(Object.entries(CAMPOS).map(([k, id]) => [k, $(id).value.trim()]));
  dados.ativo = $("b-ativo").checked;
  if (!dados.titulo) return aviso("Dê um título ao beat.", "erro");
  if (!dados.audio) return aviso("Envie o áudio ou cole o link.", "erro");
  const botao = $("btn-salvar-beat");
  ocupado(botao, true, "Salvando...");
  try {
    if (estado.editando) await chamar(`/api/admin/beats/${estado.editando.id}`, { metodo: "PUT", dados });
    else await chamar("/api/admin/beats", { metodo: "POST", dados });
    $("dlg-beat").close();
    aviso("Beat salvo.");
    carregarBeats();
    carregarResumo();
  } catch (erro) {
    aviso(erro.message, "erro", 5000);
  } finally {
    ocupado(botao, false);
  }
}

async function alternarBeat(b) {
  try {
    await chamar(`/api/admin/beats/${b.id}`, { metodo: "PUT", dados: { ativo: !b.ativo } });
    carregarBeats();
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

async function apagarBeat(b) {
  if (!confirm(`Apagar “${b.titulo}” de vez? (Para só tirar da loja, use “Esconder”.)`)) return;
  try {
    await chamar(`/api/admin/beats/${b.id}`, { metodo: "DELETE" });
    carregarBeats();
    carregarResumo();
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

// ---------- configurações ----------
async function carregarConfig() {
  try {
    const { config } = await api("/api/config");
    $("c-promo-ativa").checked = config.promoAtiva;
    $("c-promo-texto").value = config.promoTexto || "";
    $("c-whats").value = config.whatsapp || "";
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

async function salvarConfig(e) {
  e.preventDefault();
  try {
    await chamar("/api/admin/config", { metodo: "PUT", dados: { promoAtiva: $("c-promo-ativa").checked, promoTexto: $("c-promo-texto").value, whatsapp: $("c-whats").value } });
    aviso("Configurações salvas.");
  } catch (erro) {
    aviso(erro.message, "erro", 5000);
  }
}

// ---------- início ----------
$("form-login").addEventListener("submit", entrar);
$("btn-sair").addEventListener("click", sair);
document.querySelector(".abas").addEventListener("click", e => { const b = e.target.closest("button[data-aba]"); if (b) trocarAba(b.dataset.aba); });
$("f-status").addEventListener("change", carregarPedidos);
$("btn-recarregar").addEventListener("click", () => { carregarPedidos(); carregarResumo(); });
$("btn-novo-beat").addEventListener("click", () => abrirBeat());
$("form-beat").addEventListener("submit", salvarBeat);
$("b-capa").addEventListener("change", previas);
$("b-audio").addEventListener("change", previas);
$("b-capa-arquivo").addEventListener("change", e => enviarArquivo(e.target.files?.[0], "b-capa", e.target.parentElement));
$("b-audio-arquivo").addEventListener("change", e => enviarArquivo(e.target.files?.[0], "b-audio", e.target.parentElement));
$("form-config").addEventListener("submit", salvarConfig);
document.addEventListener("click", e => {
  if (e.target.closest("[data-fechar]")) e.target.closest("dialog")?.close();
  if (e.target.tagName === "DIALOG") e.target.close();
});

if (estado.token) {
  chamar("/api/admin/resumo").then(mostrarPainel).catch(() => sair());
}
