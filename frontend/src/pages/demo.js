import { boot, $ } from "../lib/ui.js";
import { initVideos } from "./video.js";
boot("demo");
// Chapter start times in seconds (filled from the recording).
const CHAPTERS = [["Welcome", 0], ["Connect a wallet", 21], ["Switch to Studionet", 35], ["Browse the arena", 53], ["Enter a round", 69], ["Run the judge", 125], ["Results and claim", 171], ["Host a round", 213], ["The ledger", 257], ["Documentation", 271], ["Disconnect and wrap up", 290]];
const ol = $("#chapters"), card = $("[data-video]"), v = $("video");
const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
ol.innerHTML = CHAPTERS.map(([t, s]) => `<li><button data-t="${s}"><time>${mm(s)}</time>${t}</button></li>`).join("");
initVideos();
ol.addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) card.__seek(Number(b.dataset.t)); });
v.addEventListener("loadedmetadata", () => { $("#dur").textContent = `${mm(v.duration)} · Connect, host, enter, judge, claim`; });
v.preload = "metadata";
