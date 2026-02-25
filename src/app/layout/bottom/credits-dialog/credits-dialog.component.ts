import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../../shared/shared.module';

interface InfoComponent {
  name: string;
  icon: string;
  url?: string;
  license?: string;
}

@Component({
  selector: 'app-credits-dialog',
  standalone: true,
  imports: [
    SharedModule,
  ],
  templateUrl: './credits-dialog.component.html',
  styleUrl: './credits-dialog.component.css'
})
export class CreditsDialogComponent {
  visualComponents: InfoComponent[] = [
    { name: 'OpenStreetMap', icon: 'map', url: 'https://www.openstreetmap.org' },
    { name: 'Angular', icon: 'code', url: 'https://angular.io' },
    { name: 'Material Design', icon: 'desktop_windows', url: 'https://material.angular.io' },
    { name: 'Carto', icon: 'place', url: 'https://carto.com' },
    { name: 'MapLibre', icon: 'place', url: 'https://maplibre.org' },
    { name: 'Nominatim', icon: 'place', url: 'https://nominatim.org' },
    { name: 'Flaticon', icon: 'place', url: 'https://www.flaticon.com' }
  ];

  dataComponents: InfoComponent[] = [
    { name: 'NVBW', icon: 'storage', url: 'https://www.nvbw.de' },
    { name: 'DELFI', icon: 'storage', url: 'https://www.delfi.de' },
    { name: 'DESTATIS', icon: 'bar_chart', url: 'https://www.destatis.de' },
    { name: 'MID', icon: 'directions_car', url: 'https://www.mobilitaet-in-deutschland.de' },
    { name: 'OpenStreetMap', icon: 'map', url: 'https://www.openstreetmap.org' },
    { name: 'OpenDataSoft', icon: 'storage', url: 'https://www.opendatasoft.com' },
    { name: 'GeoJsonUtilities', icon: 'place', url: 'https://geodata.bw-im.de' }
  ];

  backendComponents: InfoComponent[] = [
    { name: 'Django', icon: 'dns', url: 'https://www.djangoproject.com' },
    { name: 'PostGIS', icon: 'storage', url: 'https://postgis.net' },
    { name: 'pgBouncer', icon: 'storage', url: 'https://pgbouncer.org' }
  ];

  routingComponents: InfoComponent[] = [
    { name: 'Valhalla', icon: 'directions', url: 'https://valhalla.readthedocs.io' },
    { name: 'MOTIS', icon: 'directions', url: 'https://motis-project.de' },
    { name: 'OpenRouteService', icon: 'directions', url: 'https://openrouteservice.org' }
  ];

  citiesComponents: InfoComponent[] = [
    { name: 'Karlsruhe', icon: 'location_city', url: 'https://transparenz.karlsruhe.de/dataset/stadtteile', license: 'CC Zero' },
    { name: 'Mannheim', icon: 'location_city', url: 'https://mannheim.opendatasoft.com/pages/info/', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Stuttgart', icon: 'location_city', url: 'https://opendata.stuttgart.de/dataset/kleinraumige-gliederung', license:'cc by 4.0' },
    { name: 'München', icon: 'location_city', url: 'https://opendata.muenchen.de/ne/dataset/vablock_viertel_opendata', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Nürnberg', icon: 'location_city', url: 'https://wiki.openstreetmap.org/wiki/N%C3%BCrnberg/Stadtteile', license: "cc by 4.0" },
    { name: 'Berlin', icon: 'location_city', url: 'https://gdi.berlin.de/geonetwork/srv/ger/catalog.search#/metadata/1cc18674-2a0c-36e3-aba3-f34a54c0d844', license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Bremen', icon: 'location_city', url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=D9F32B22-C647-42FD-9E95-1344AC57BC46' , license: 'cc by 4.0' },
    { name: 'Hamburg', icon: 'location_city', url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=F35EAC11-C236-429F-B1BF-751C0C18E8B7' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Köln', icon: 'location_city', url: 'https://www.offenedaten-koeln.de/dataset/stadtteile-k%C3%B6ln' , license: 'Datenlizenz Deutschland – Zero – Version 2.0' },
    { name: 'Duisburg', icon: 'location_city', url: 'https://opendata-duisburg.de/dataset/ortsteile' , license: 'CC BY 3.0 DE' },
    { name: 'Münster', icon: 'location_city', url: 'https://opendata.stadt-muenster.de/dataset/geokoordinaten-der-stadtteil-grenzen-geometriedaten-der-kleinr%C3%A4umigen-gebietsgliederung-5' , license: 'dl-by-de/2.0' },
    { name: 'Düsseldorf', icon: 'location_city', url: 'https://open.nrw/dataset/stadtteilgrenzen-dusseldorf-2025-d' , license: 'Datenlizenz Deutschland – Zero – Version 2.0' },
    { name: 'Essen', icon: 'location_city', url: 'https://opendata.essen.de/dataset/verwaltungsgrenzen-der-stadt-essen' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Bochum', icon: 'location_city', url: 'https://bochum.opendata.ruhr/dataset/bochum-stadtgebiet_stadtbezirke' , license: 'CC by Zero' },
    { name: 'Dresden', icon: 'location_city', url: 'https://opendata.dresden.de/informationsportal/#app/mainpage' , license: 'Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Leipzig', icon: 'location_city', url: 'https://opendata.leipzig.de/de/dataset/geodaten-stadtbezirke-leipzig/resource/81a423d8-1a2b-4f84-b9f1-0d8b9533d5a8' , license: '	Datenlizenz Deutschland Namensnennung 2.0' },
    { name: 'Wuppertal', icon: 'location_city', url: 'https://www.offenedaten-wuppertal.de/dataset/stadtbezirke-wuppertal' , license: 'cc-by/4.0' },
    { name: 'Bonn', icon: 'location_city', url: 'https://opendata.bonn.de/dataset/fl%C3%A4chen-der-stadtbezirke' , license: 'cc zero' },
    { name: 'Bielefeld', icon: 'location_city', url: 'https://open-data.bielefeld.de/dataset/stadtbezirke' , license: 'cc by 4.0' },
    { name: 'Augsburg', icon: 'location_city', url: 'https://geodaten.augsburg.de/portal/apps/experiencebuilder/experience/?id=99fbbe168804490eab9cc1cebb959e9e&page=Gebietseinteilungen' , license: 'cc by 4.0' },
    { name: 'Frankfurt', icon: 'location_city', url: 'https://offenedaten.frankfurt.de/#app/startpage' , license: 'Datenlizenz Deutschland Namensnennung 2.0' }
  ];



  constructor(
    public dialogRef: MatDialogRef<CreditsDialogComponent>
  ) {}

  openLink(url: string) {
    window.open(url, '_blank');
  }

  onClose() {
    this.dialogRef.close();
  }
}
