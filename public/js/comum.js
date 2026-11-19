// Funções usadas pela loja e pelo painel.
export const $ = id => document.getElementById(id);

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v; // usado só com ícones fixos deste arquivo
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}

export function aviso(texto, tipo = "ok", tempo = 3600) {
  const caixa = $("avisos");
  if (!caixa) return;
  const el = h("div", { class: `aviso ${tipo === "erro" ? "erro" : ""}`, role: "status", text: texto });
  caixa.append(el);
  while (caixa.children.length > 3) caixa.firstElementChild.remove();
  // Fica por cima até das janelas abertas (camada superior do navegador).
  try { if (caixa.showPopover) { if (caixa.matches(":popover-open")) caixa.hidePopover(); caixa.showPopover(); } } catch { /* navegador antigo */ }
  setTimeout(() => el.remove(), tempo);
}

export function ocupado(botao, sim, texto = "Aguarde...") {
  if (!botao) return;
  if (sim) { botao.dataset.original = botao.textContent; botao.textContent = texto; botao.disabled = true; }
  else { botao.textContent = botao.dataset.original || botao.textContent; botao.disabled = false; }
}

export async function api(caminho, { metodo = "GET", dados, token, corpoBruto, tipo, tempo = 20000 } = {}) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempo);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (corpoBruto) { body = corpoBruto; headers["Content-Type"] = tipo; }
  else if (dados !== undefined) { body = JSON.stringify(dados); headers["Content-Type"] = "application/json"; }
  try {
    const resp = await fetch(caminho, { method: metodo, headers, body, signal: controle.signal, cache: "no-store" });
    let json;
    try { json = await resp.json(); } catch { throw Object.assign(new Error("Resposta inesperada do servidor."), { status: resp.status }); }
    if (!resp.ok || !json.ok) throw Object.assign(new Error(json.message || `Erro ${resp.status}`), { status: resp.status });
    return json;
  } catch (erro) {
    if (erro.name === "AbortError") throw new Error("Demorou demais. Tente de novo.");
    if (erro instanceof TypeError) throw new Error("Sem conexão com o servidor.");
    throw erro;
  } finally {
    clearTimeout(timer);
  }
}

export const reais = v => (v === null || v === undefined ? "" : `R$ ${Number(v).toFixed(2).replace(".", ",").replace(",00", "")}`);

export function armazenado(chave, valor) {
  try {
    if (valor === undefined) return localStorage.getItem(chave);
    if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor);
  } catch { return null; }
  return valor;
}

const svg = d => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
export const icones = {
  play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  ant: svg('<path d="M6 5h2v14H6zM9.5 12 19 18V6z"/>'),
  prox: svg('<path d="M16 5h2v14h-2zM14.5 12 5 18V6z"/>'),
  vol: svg('<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  mudo: svg('<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')
};
