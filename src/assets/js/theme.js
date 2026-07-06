// Light/dark theme toggle, persisted in localStorage, plus logo swapping.
// The base template ships the light (ink) marks; under a dark theme they are swapped for the dark
// (cream) marks so the single-colour SVGs stay legible on either background.
(function () {
  var root = document.documentElement;

  function swapLogos(theme) {
    document.querySelectorAll("img[data-logo]").forEach(function (img) {
      var name = img.getAttribute("data-logo");
      img.src = "/assets/logos/" + (theme === "dark" ? "dark" : "light") + "/" + name + ".svg";
    });
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("jenesis-theme", theme);
    swapLogos(theme);
  }

  // Reflect the theme chosen before first paint (set inline in the <head>) onto the logos.
  swapLogos(root.getAttribute("data-theme") || "light");

  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }
})();
