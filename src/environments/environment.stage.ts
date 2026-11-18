export const environment = {
  production: false,
  apiUrl: 'https://api.stage.mapr.mobi/api/v1',
  baseUrl: 'https://api.stage.mapr.mobi',
  /** Geocoding for the map search (Photon). Can point at a self-hosted instance or a proxy. */
  photonUrl: 'https://photon.komoot.io',
  buildDate: new Date().toISOString()
}; 