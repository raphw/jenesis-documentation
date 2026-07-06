// The current Jenesis build-tool release shown on the landing page. `version` is the build-time fallback
// (kept fresh by assets/js/version.js, which reads the latest tag from the GitHub API at page load); the
// release URL is a permalink GitHub always redirects to the newest release, so the link never goes stale.
export default {
  version: "v0.9.4",
  releaseUrl: "https://github.com/raphw/jenesis/releases/latest",
  apiUrl: "https://api.github.com/repos/raphw/jenesis/releases/latest",
  install: "curl -fsSL https://get.jenesis.build | bash",
};
