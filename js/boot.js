// Roda antes da pintura: liga o modo de animação só se o usuário aceita movimento.
// Se o motion.js não confirmar em 4 s, o conteúdo volta a aparecer sem animação.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  root.classList.add("js-anim");
  setTimeout(function () {
    if (!window.__tpMotion) root.classList.remove("js-anim");
  }, 4000);
})();
