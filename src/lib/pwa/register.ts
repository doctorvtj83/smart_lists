/**
 * Whether this page load should register the service worker.
 *
 * Why a pure predicate rather than an `if` inside the effect: the two conditions
 * are the entire policy, and both are awkward to exercise from a component test
 * (one is a build-time constant, the other a browser capability). Pulled out
 * here, the policy is three lines of test instead of two mocked environments.
 */
export function shouldRegisterServiceWorker(
  nodeEnv: string | undefined,
  hasServiceWorker: boolean,
): boolean {
  // Production only: in `next dev` the cache-first rule for /_next/static would
  // serve stale chunks after an edit and look exactly like broken hot reload.
  return nodeEnv === "production" && hasServiceWorker;
}
