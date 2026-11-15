// Your GitHub links. Paste the repository URL here after creating it.
export const site = {
  githubUsername: 'Kieranmcm07',
  repositoryUrl: '',
};

export function setupGithubLinks() {
  const profile = document.querySelector('#creator-link');
  profile.href = `https://github.com/${encodeURIComponent(site.githubUsername)}`;
  profile.textContent = site.githubUsername;
  document.querySelector('#projects-link').href = `${profile.href}?tab=repositories`;

  // An empty URL keeps the repository button out of the page until it is ready.
  const repository = document.querySelector('#repository-link');
  repository.hidden = !site.repositoryUrl;
  if (site.repositoryUrl) repository.href = site.repositoryUrl;
}
