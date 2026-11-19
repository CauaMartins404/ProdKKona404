// KKona404 — loja (vitrine, player e pedidos)
import { $, h, aviso, ocupado, api, reais, armazenado, icones } from "./comum.js";

const estado = {
  config: { promoAtiva: false, promoTexto: "", whatsapp: "5516994586033" },
  beats: [],
  visiveis: [],
  atual: null,
  pedido: null
};
const audio = $("audio");

// ---------- catálogo ----------
async function carregar() {
  $("faixas").replaceChildren(...Array.from({ length: 4 }, () => h("div", { class: "esqueleto" })));
  try {
    const [c, b] = await Promise.all([api("/api/config"), api("/api/beats")]);
    estado.config = c.config;
    estado.beats = b.beats;
    aplicarConfig();
    montarGeneros();
    filtrar();
  } catch (erro) {
    $("faixas").replaceChildren(h("div", { class: "estado" },
      h("i", { class: "fas fa-plug", "aria-hidden": "true" }),
      h("strong", { text: "Catálogo fora do ar" }), erro.message,
      h("button", { class: "btn-hero", type: "button", text: "Tentar de novo", onclick: carregar })));
  }
}

function aplicarConfig() {
  const { promoAtiva, promoTexto, whatsapp } = estado.config;
  $("promo").replaceChildren(h("i", { class: "fas fa-fire", "aria-hidden": "true" }), promoTexto || "", h("i", { class: "fas fa-fire", "aria-hidden": "true" }));
  $("promo").classList.toggle("hidden", !promoAtiva || !promoTexto);
  $("link-whats").href = `https://wa.me/${whatsapp}?text=${encodeURIComponent("Salve KKona! Vim pelo site.")}`;
}

function montarGeneros() {
  const generos = [...new Set(estado.beats.map(b => b.genero).filter(Boolean))].sort();
  $("f-genero").replaceChildren(h("option", { value: "", text: "Todos" }), ...generos.map(g => h("option", { value: g, text: g })));
}

function filtrar() {
  const busca = $("f-busca").value.trim().toLowerCase();
  const genero = $("f-genero").value;
  const bpm = $("f-bpm").value;
  estado.visiveis = estado.beats.filter(b =>
    (!busca || `${b.titulo} ${b.genero} ${b.tom}`.toLowerCase().includes(busca)) &&
    (!genero || b.genero === genero) &&
    (!bpm || (bpm === "lento" && b.bpm < 120) || (bpm === "medio" && b.bpm >= 120 && b.bpm <= 140) || (bpm === "rapido" && b.bpm > 140)));
  desenharFaixas();
}

function desenharFaixas() {
  const alvo = $("faixas");
  const vazio = (icone, titulo, destaque, texto) => h("div", { class: "estado" },
    h("i", { class: `fas ${icone}`, "aria-hidden": "true" }),
    h("strong", {}, `${titulo} `, h("span", { text: destaque })), texto);
  if (!estado.beats.length) return alvo.replaceChildren(vazio("fa-compact-disc", "Catálogo em", "produção", "Novos beats chegando em breve."));
  if (!estado.visiveis.length) return alvo.replaceChildren(vazio("fa-filter", "Nada com esses", "filtros", "Tente outro gênero ou BPM."));
  alvo.replaceChildren(...estado.visiveis.map(b => {
    const atual = estado.atual?.id === b.id;
    const tocando = atual && !audio.paused;
    return h("article", { class: `beat-card ${atual ? "tocando" : ""}` },
      h("button", { type: "button", class: "beat-capa", "aria-label": `${tocando ? "Pausar" : "Tocar"} ${b.titulo}`, onclick: () => tocar(b) },
        h("img", { src: b.capa || "assets/img/Pierrot.jpeg", alt: "", loading: "lazy", width: 240, height: 240 }),
        h("span", { class: "play-overlay", html: tocando ? icones.pause : icones.play })),
      h("div", { class: "beat-info" },
        h("h3", {}, h("span", { text: b.titulo }), tocando && h("span", { class: "ondas", "aria-hidden": "true" }, h("i"), h("i"), h("i"))),
        h("div", { class: "beat-meta" }, h("span", { text: b.genero || "Beat" }), h("span", { text: [b.bpm && `${b.bpm} BPM`, b.tom].filter(Boolean).join(" · ") })),
        h("div", { class: "beat-preco" }, b.precoBaseAntigo && h("s", { text: reais(b.precoBaseAntigo) }), h("strong", { text: reais(b.precoBase) }), h("small", { text: "a partir de" })),
        h("button", { type: "button", class: "btn-licenciar", onclick: () => abrirPedido("licenca", b) },
          h("i", { class: "fas fa-shopping-cart", "aria-hidden": "true" }), "Comprar licença")));
  }));
}

// ---------- player ----------
function tocar(beat) {
  if (estado.atual?.id === beat.id) {
    audio.paused ? audio.play().catch(() => aviso("Não deu para tocar este áudio.", "erro")) : audio.pause();
    return;
  }
  estado.atual = beat;
  audio.src = beat.audio;
  $("p-capa").src = beat.capa || "assets/img/Pierrot.jpeg";
  $("p-titulo").textContent = beat.titulo;
  $("p-sub").textContent = [beat.genero, beat.bpm && `${beat.bpm} BPM`].filter(Boolean).join(" · ") || "KKona404";
  audio.play().catch(() => aviso("Não deu para tocar este áudio.", "erro"));
}

function pular(direcao) {
  const lista = estado.visiveis.length ? estado.visiveis : estado.beats;
  if (!lista.length) return;
  const i = lista.findIndex(b => b.id === estado.atual?.id);
  tocar(lista[(i + direcao + lista.length) % lista.length]);
}

const tempo = s => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

function atualizarPlayer() {
  const tocando = !audio.paused;
  $("p-play").innerHTML = tocando ? icones.pause : icones.play;
  $("p-play").setAttribute("aria-label", tocando ? "Pausar" : "Tocar");
  desenharFaixas();
}

function ligarPlayer() {
  $("p-ant").innerHTML = icones.ant;
  $("p-prox").innerHTML = icones.prox;
  $("p-vol-icone").innerHTML = icones.vol;
  $("p-play").innerHTML = icones.play;
  $("p-play").addEventListener("click", () => (estado.atual ? tocar(estado.atual) : estado.visiveis[0] && tocar(estado.visiveis[0])));
  $("p-ant").addEventListener("click", () => pular(-1));
  $("p-prox").addEventListener("click", () => pular(1));
  audio.addEventListener("play", atualizarPlayer);
  audio.addEventListener("pause", atualizarPlayer);
  audio.addEventListener("ended", () => pular(1));
  audio.addEventListener("timeupdate", () => {
    $("p-atual").textContent = tempo(audio.currentTime);
    if (audio.duration) $("p-barra").value = Math.round((audio.currentTime / audio.duration) * 1000);
  });
  audio.addEventListener("loadedmetadata", () => { $("p-total").textContent = tempo(audio.duration); });
  $("p-barra").addEventListener("input", e => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; });
  const vol = Number(armazenado("kk.volume") ?? 0.8);
  audio.volume = Number.isFinite(vol) ? vol : 0.8;
  $("p-volume").value = audio.volume;
  $("p-volume").addEventListener("input", e => {
    audio.volume = Number(e.target.value);
    $("p-vol-icone").innerHTML = audio.volume === 0 ? icones.mudo : icones.vol;
    armazenado("kk.volume", String(audio.volume));
  });
  document.addEventListener("keydown", e => {
    if (e.code !== "Space" || e.target.closest("input, textarea, select, button, dialog")) return;
    e.preventDefault();
    $("p-play").click();
  });
}

// ---------- pedidos ----------
const TEXTOS = {
  licenca: ["Licenciar beat", ""],
  exclusivo: ["Beat exclusivo", "Conte a ideia: referências, clima, BPM e prazo."],
  mixagem: ["Mix & Master", "Diga quantas faixas/stems e mande referências se tiver."],
  feat: ["Feat / Colab", "Fale do projeto e onde ele vai sair."],
  contato: ["Contato", "Mande sua dúvida ou proposta."]
};

function abrirPedido(tipo, beat = null) {
  estado.pedido = { tipo, beat };
  const [titulo, ajuda] = TEXTOS[tipo];
  $("t-pedido").textContent = titulo;
  $("btn-pedir").textContent = beat ? "Comprar" : "Enviar pedido";
  $("pedido-ajuda").textContent = ajuda;
  $("form-pedido").reset();
  $("form-pedido").classList.remove("hidden");
  $("pedido-ok").classList.add("hidden");
  $("pedido-beat").classList.toggle("hidden", !beat);
  $("licencas").classList.toggle("hidden", !beat);
  if (beat) {
    $("pb-capa").src = beat.capa || "assets/img/Pierrot.jpeg";
    $("pb-titulo").textContent = beat.titulo;
    $("pb-tags").replaceChildren(...[beat.genero, beat.bpm && `${beat.bpm} BPM`, beat.tom].filter(Boolean).map(t => h("span", { text: t })));
    const valor = (atual, antigo) => [antigo && h("s", { text: reais(antigo) }), h("strong", { text: reais(atual) })];
    $("v-base").replaceChildren(...valor(beat.precoBase, beat.precoBaseAntigo).filter(Boolean));
    $("v-stems").replaceChildren(...valor(beat.precoStems, beat.precoStemsAntigo).filter(Boolean));
  }
  $("dlg-pedido").showModal();
  $("pd-nome").focus();
}

async function enviarPedido(evento) {
  evento.preventDefault();
  const { tipo, beat } = estado.pedido;
  const nome = $("pd-nome").value.trim();
  const contato = $("pd-contato").value.trim();
  if (nome.length < 2) { $("pd-nome").focus(); return aviso("Diga seu nome.", "erro"); }
  if (contato.length < 5) { $("pd-contato").focus(); return aviso("Deixe um contato (WhatsApp, Instagram ou e-mail).", "erro"); }
  const botao = $("btn-pedir");
  ocupado(botao, true, "Enviando...");
  try {
    const r = await api("/api/pedidos", {
      metodo: "POST",
      dados: {
        tipo, nome, contato, mensagem: $("pd-msg").value, site: $("pd-site").value,
        beatId: beat?.id, licenca: document.querySelector("input[name=licenca]:checked")?.value
      }
    });
    $("ok-codigo").textContent = r.pedido.codigo;
    $("ok-whats").href = r.whatsapp || `https://wa.me/${estado.config.whatsapp}`;
    $("form-pedido").classList.add("hidden");
    $("pedido-ok").classList.remove("hidden");
  } catch (erro) {
    aviso(erro.message, "erro", 5000);
  } finally {
    ocupado(botao, false);
  }
}

// ---------- termos ----------
function verificarTermos() {
  if (armazenado("kk.termos") !== "aceito") $("dlg-termos").showModal();
}

function ligarEventos() {
  $("f-busca").addEventListener("input", filtrar);
  $("f-genero").addEventListener("change", filtrar);
  $("f-bpm").addEventListener("change", filtrar);
  $("form-pedido").addEventListener("submit", enviarPedido);
  $("btn-aceitar").addEventListener("click", () => { armazenado("kk.termos", "aceito"); $("dlg-termos").close(); });
  $("dlg-termos").addEventListener("cancel", e => { if (armazenado("kk.termos") !== "aceito") e.preventDefault(); });
  $("btn-termos").addEventListener("click", () => $("dlg-termos").showModal());
  document.addEventListener("click", e => {
    const botao = e.target.closest("[data-pedido]");
    if (botao) return abrirPedido(botao.dataset.pedido);
    if (e.target.closest("[data-fechar]")) e.target.closest("dialog")?.close();
    if (e.target.id === "dlg-pedido") e.target.close();
  });
  $("ano").textContent = new Date().getFullYear();
}

ligarEventos();
ligarPlayer();
verificarTermos();
carregar();