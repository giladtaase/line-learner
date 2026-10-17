import 'fake-indexeddb/auto';

// React Router's data router builds a fetch Request (with an AbortSignal) for
// every navigation. Under jsdom the signal comes from jsdom while Request is
// Node's, which rejects it, so navigation in tests never completes. The app
// has no route loaders that could be aborted, so tests drop the signal.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { signal, ...rest } = init;
      super(input, rest);
    } else {
      super(input, init);
    }
  }
} as typeof Request;
