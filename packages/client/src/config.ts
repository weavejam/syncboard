/** Service + relay endpoints. Service is created via env at build time but
 *  defaults work for local dev. */
export const SERVICE_HTTP =
  import.meta.env.VITE_SERVICE_HTTP ?? "http://localhost:8787";
export const SERVICE_WS =
  import.meta.env.VITE_SERVICE_WS ?? "ws://localhost:8787";
