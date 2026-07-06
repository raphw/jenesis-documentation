// Keep the landing page's "Latest release" version fresh without a rebuild: read the newest release tag
// from the GitHub API and update the badge. Progressive enhancement - if the request fails or is rate
// limited, the build-time fallback stays, and the release link is a permalink that is always correct.
(function () {
  var el = document.querySelector("[data-latest-version]");
  if (!el) return;
  fetch("https://api.github.com/repos/raphw/jenesis/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.tag_name) el.textContent = d.tag_name; })
    .catch(function () {});
})();
