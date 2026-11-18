export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api/v1',
  baseUrl: 'http://localhost:8000',
  wsURL: 'ws://localhost:8000/api/v1/ws',
  /** Geocoding for the map search (Photon). Can point at a self-hosted instance or a proxy. */
  photonUrl: 'https://photon.komoot.io',
  buildDate: new Date().toISOString()
};  