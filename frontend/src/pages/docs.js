import { boot, $, $$ } from "../lib/ui.js";
import { CONFIG } from "../config.js";
boot("docs");
$("#d-addr").textContent = CONFIG.contract;
// scroll-spy for the table of contents
const links = $$(".toc a"), map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.remove("on")); map.get(e.target.id)?.classList.add("on"); } }), { rootMargin: "-90px 0px -65% 0px" });
$$(".prose section").forEach((s) => io.observe(s));
// open a method when linked to, copy buttons for code blocks
$$("pre").forEach((pre) => { const b = document.createElement("button"); b.className = "btn ghost sm"; b.style.cssText = "float:right;margin:-6px -8px 0 8px;padding:4px 10px"; b.textContent = "Copy"; b.onclick = async () => { await navigator.clipboard?.writeText(pre.innerText.replace(/^Copy\n?/, "")); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }; pre.prepend(b); });
