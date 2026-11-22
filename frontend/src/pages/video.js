// Click-to-play video cards: the poster covers the video, one click starts it with sound controls.
import { $$ } from "../lib/ui.js";
export function initVideos(root = document) {
  $$("[data-video]", root).forEach((card) => {
    const v = card.querySelector("video"), cover = card.querySelector(".play-cover");
    if (!v || !cover || card.__v) return; card.__v = 1;
    v.controls = false;
    const start = () => { cover.classList.add("gone"); v.controls = true; v.preload = "auto"; v.play().catch(() => { v.controls = true; }); };
    cover.addEventListener("click", start);
    v.addEventListener("ended", () => { cover.classList.remove("gone"); v.controls = false; v.currentTime = 0; });
    card.__seek = (t) => { start(); v.currentTime = t; };
  });
}
