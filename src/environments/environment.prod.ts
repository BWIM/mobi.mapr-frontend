export const environment = {
  production: true,
  apiUrl: 'https://api.mapr.mobi/api/v1',
  baseUrl: 'https://api.mapr.mobi',
  /** Geocoding for the map search (Photon). Can point at a self-hosted instance or a proxy. */
  photonUrl: 'https://photon.komoot.io',
  buildDate: new Date().toISOString()
}; 