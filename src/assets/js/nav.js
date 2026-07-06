// Mobile navigation: on narrow viewports the section menu is collapsed and revealed by the header's
// "Menu" button. On wide viewports the menu is always visible and the button is hidden by CSS.
(function () {
  var button = document.querySelector(".nav-toggle");
  var sidebar = document.getElementById("section-nav");
  if (!button || !sidebar) return;

  var mobile = window.matchMedia("(max-width: 48rem)");

  function sync() {
    if (mobile.matches) {
      sidebar.hidden = button.getAttribute("aria-expanded") !== "true";
    } else {
      sidebar.hidden = false; // desktop: always shown
    }
  }

  button.addEventListener("click", function () {
    var open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    sync();
  });

  mobile.addEventListener("change", sync);
  sync();
})();
