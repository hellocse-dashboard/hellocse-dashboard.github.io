// The GitHub API, with the dispatch token a page reads in its data (the stats, the board of the reviews): the runs of the
// sync workflow, and starting one.

/**
 * @param {Pick<SyncTrigger, 'repository' | 'token'>} trigger
 * @param {string} path
 * @param {RequestInit} [options]
 */
function githubApi({ repository, token }, path, options = {}) {

  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  })
}

// The last runs of the workflow, newest first.
/**
 * @param {SyncTrigger} trigger
 * @returns {Promise<{ status: string, created_at: string }[]>}
 */
export async function recentRuns(trigger) {
  const response = await githubApi(trigger, `/actions/workflows/${trigger.workflow}/runs?per_page=5`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()).workflow_runs
}

/**
 * @param {SyncTrigger} trigger
 * @param {boolean} full
 * @param {string | null} [proof]
 */
export async function dispatchSync(trigger, full, proof = null) {
  const { workflow, ref } = trigger
  const response = await githubApi(trigger, `/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs: { full: String(full), ...(proof ? { proof } : {}) } }),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
}
