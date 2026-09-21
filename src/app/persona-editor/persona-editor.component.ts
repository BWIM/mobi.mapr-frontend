import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GeoJSONSource, Map as MapLibreMap, NavigationControl, Popup } from 'maplibre-gl';
import { Subject, Subscription, forkJoin, Observable, of } from 'rxjs';
import { debounceTime, switchMap, tap, catchError } from 'rxjs/operators';
import { SharedModule } from '../shared/shared.module';
import { AuthService } from '../auth/auth.service';
import { CustomPersonaService, PreviewGeoJson } from '../services/custom-persona.service';
import { DashboardSessionService } from '../services/dashboard-session.service';
import { ProfileService } from '../services/profile.service';
import { RegioStarService } from '../services/regiostar.service';
import { buildBasemapStyle, findBasemapLabelsBeforeId } from '../services/basemap-style';
import {
  CustomPersona,
  PersonaActivityCategory,
  PersonaTemplate,
} from '../interfaces/custom-persona';
import { Profile } from '../interfaces/profile';
import { RegioStar } from '../interfaces/regiostar';
import { buildMapLibreStepExpression, parseScoreColors } from '../utils/score-colors.util';
import { buildIndexFillColorExpression } from '../utils/index-colors.util';

const DEFAULT_PROFILE_IDS = [4, 7, 12, 16];
const DEFAULT_SCORE_COLORS: Record<string, string> = {
  '0': 'rgb(46,125,50)',
  '480': 'rgb(102,187,106)',
  '960': 'rgb(255,241,118)',
  '1440': 'rgb(253,216,53)',
  '1800': 'rgb(239,83,80)',
  '2700': 'rgb(183,28,28)',
};
const MODE_ICONS: Record<string, string> = {
  pedestrian: 'directions_walk',
  bicycle: 'directions_bike',
  car: 'directions_car',
  bus: 'directions_bus',
  transit: 'train',
  tram: 'tram',
  default: 'directions',
};
const SOURCE_ID = 'custom-persona-preview';
const FILL_LAYER_ID = 'custom-persona-preview-fill';
const LINE_LAYER_ID = 'custom-persona-preview-line';
const WEIGHT_SLIDER_FLOOR = 100;
const WEIGHT_SLIDER_HEADROOM = 50;

export interface PersonaWeightItem {
  activity_id: number;
  activity_name: string;
  activity_display_name: string;
  weight: number;
  categories: PersonaActivityCategory[];
}

export interface PersonaWeightGroup {
  name: string;
  items: PersonaWeightItem[];
}

export interface RegiostarGroup {
  class_name: string;
  regiostars: RegioStar[];
}

@Component({
  selector: 'app-persona-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule, TranslateModule],
  templateUrl: './persona-editor.component.html',
  styleUrl: './persona-editor.component.css',
})
export class PersonaEditorComponent implements OnInit, OnDestroy {
  private previewMapRef?: ElementRef<HTMLDivElement>;

  @ViewChild('previewMap')
  set previewMap(ref: ElementRef<HTMLDivElement> | undefined) {
    this.previewMapRef = ref;
    if (ref) {
      this.tryInitMap();
    }
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private customPersonaService = inject(CustomPersonaService);
  private dashboardSessionService = inject(DashboardSessionService);
  private profileService = inject(ProfileService);
  private regiostarService = inject(RegioStarService);
  private translate = inject(TranslateService);

  templates = signal<PersonaTemplate[]>([]);
  persona = signal<CustomPersona | null>(null);
  profiles = signal<Profile[]>([]);
  regiostars = signal<RegioStar[]>([]);
  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  publishing = signal(false);
  previewLoading = signal(false);
  error = signal<string | null>(null);
  creatingFrom = signal<number | null>(null);
  selectedProfileIds = signal<number[]>([...DEFAULT_PROFILE_IDS]);
  selectedRegiostarIds = signal<number[] | null>(null);
  colorByIndex = signal(true);
  regiostarPanelOpen = signal(false);
  expandedRegiostarGroups = signal<Set<string>>(new Set());
  liveUpdate = signal(true);
  pendingUpdate = signal(false);
  weightsTextCopied = signal(false);
  weightsTextError = signal<string | null>(null);
  weightSliderMax = 150;

  displayName = '';
  description = '';
  canUseCar = true;
  weights: PersonaWeightItem[] = [];
  weightsText = '';

  groupedRegiostars = computed<RegiostarGroup[]>(() => {
    const grouped = new Map<string, RegioStar[]>();
    for (const regiostar of this.regiostars()) {
      const key = regiostar.class_name?.display_name || 'Other';
      const items = grouped.get(key) ?? [];
      items.push(regiostar);
      grouped.set(key, items);
    }
    return Array.from(grouped.entries())
      .map(([class_name, items]) => ({
        class_name,
        regiostars: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.class_name.localeCompare(b.class_name));
  });

  private map?: MapLibreMap;
  private popup?: Popup;
  private mapReady = false;
  private hoverBound = false;
  private save$ = new Subject<void>();
  private preview$ = new Subject<void>();
  private subscriptions = new Subscription();
  private latestPreview: PreviewGeoJson | null = null;
  private saveNeedsPreview = false;
  private weightsTextFocused = false;
  private weightsTextCopyTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/landing']);
      return;
    }

    this.subscriptions.add(
      this.save$
        .pipe(
          debounceTime(400),
          switchMap(() => this.persist().pipe(catchError(() => of(null))))
        )
        .subscribe()
    );
    this.subscriptions.add(
      this.preview$.pipe(debounceTime(250)).subscribe(() => this.loadPreview())
    );

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.loadEditor(Number(idParam));
    } else {
      this.loadTemplates();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.popup?.remove();
    this.map?.remove();
    if (this.weightsTextCopyTimer) {
      clearTimeout(this.weightsTextCopyTimer);
    }
  }

  weightPercent(weight: number): number {
    const total = this.weights.reduce((sum, item) => sum + item.weight, 0);
    return total > 0 ? Math.round((weight / total) * 1000) / 10 : 0;
  }

  weightGroups(): PersonaWeightGroup[] {
    const grouped = new Map<string, PersonaWeightItem[]>();

    for (const item of this.weights) {
      const label = item.categories[0]?.display_name ?? '';
      const items = grouped.get(label) ?? [];
      items.push(item);
      grouped.set(label, items);
    }

    return Array.from(grouped.entries()).map(([name, items]) => ({ name, items }));
  }

  profileIcon(profile: Profile): string {
    const modeName = profile.mode?.name?.toLowerCase() ?? '';
    return (
      profile.icon_name ||
      profile.mode?.icon_name ||
      MODE_ICONS[modeName] ||
      MODE_ICONS['default']
    );
  }

  selectTemplate(template: PersonaTemplate): void {
    if (this.creatingFrom() !== null) {
      return;
    }
    this.creatingFrom.set(template.id);
    this.error.set(null);
    this.customPersonaService.createFromTemplate(template.id).subscribe({
      next: (persona) => {
        this.router.navigate(['/persona-editor', persona.id], { replaceUrl: true });
      },
      error: (err) => {
        this.creatingFrom.set(null);
        this.error.set(err?.error?.error || 'personaEditor.createError');
      },
    });
  }

  onMetaChange(): void {
    this.syncWeightsText();
    this.queuePersonaChange(false);
  }

  onWeightChange(): void {
    this.expandWeightSliderMax();
    this.syncWeightsText();
    this.queuePersonaChange(true);
  }

  onCarChange(): void {
    this.syncWeightsText();
    this.queuePersonaChange(true);
  }

  onWeightsTextFocus(): void {
    this.weightsTextFocused = true;
  }

  onWeightsTextBlur(): void {
    this.weightsTextFocused = false;
    this.applyWeightsText();
  }

  copyWeightsText(): void {
    if (!this.weightsTextFocused) {
      this.syncWeightsText();
    }
    void navigator.clipboard.writeText(this.weightsText).then(() => {
      this.weightsTextCopied.set(true);
      if (this.weightsTextCopyTimer) {
        clearTimeout(this.weightsTextCopyTimer);
      }
      this.weightsTextCopyTimer = setTimeout(() => this.weightsTextCopied.set(false), 1500);
    });
  }

  applyWeightsText(): void {
    const raw = this.weightsText.trim();
    if (!raw) {
      this.weightsTextError.set('personaEditor.weightsTextError');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.weightsTextError.set('personaEditor.weightsTextError');
      return;
    }

    let name: unknown;
    let description: unknown;
    let canUseCar: unknown;
    let activities: unknown;

    if (Array.isArray(parsed)) {
      activities = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      name = obj['name'] ?? obj['display_name'];
      description = obj['description'];
      canUseCar = obj['can_use_car'] ?? obj['canUseCar'];
      activities = obj['activities'] ?? obj['weights'];
    }

    if (!Array.isArray(activities)) {
      this.weightsTextError.set('personaEditor.weightsTextError');
      return;
    }

    const byId = new Map<number, number>();
    const byKey = new Map<string, number>();
    const byName = new Map<string, number>();

    for (const entry of activities) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const rec = entry as Record<string, unknown>;
      const weightValue = rec['weight'] ?? rec['percent'];
      const weight = Number(weightValue);
      if (!Number.isFinite(weight) || weight < 0) {
        continue;
      }
      const id = Number(rec['id'] ?? rec['activity_id']);
      if (Number.isFinite(id) && id > 0) {
        byId.set(id, weight);
      }
      const key = String(rec['key'] ?? rec['activity_name'] ?? '')
        .trim()
        .toLowerCase();
      if (key) {
        byKey.set(key, weight);
      }
      const label = String(rec['name'] ?? rec['activity'] ?? rec['activity_display_name'] ?? '')
        .trim()
        .toLowerCase();
      if (label) {
        byName.set(label, weight);
      }
    }

    let changed = false;
    for (const item of this.weights) {
      const next =
        byId.get(item.activity_id) ??
        byKey.get(item.activity_name?.toLowerCase()) ??
        byName.get(item.activity_display_name.toLowerCase());
      if (next === undefined || next === item.weight) {
        continue;
      }
      item.weight = next;
      changed = true;
    }

    if (typeof name === 'string' && name !== this.displayName) {
      this.displayName = name;
      changed = true;
    }
    if (typeof description === 'string' && description !== this.description) {
      this.description = description;
      changed = true;
    }
    if (typeof canUseCar === 'boolean' && canUseCar !== this.canUseCar) {
      this.canUseCar = canUseCar;
      changed = true;
    }

    this.weightsTextError.set(null);
    this.expandWeightSliderMax();
    this.syncWeightsText(true);
    if (changed) {
      this.queuePersonaChange(true);
    }
  }

  setLiveUpdate(enabled: boolean): void {
    this.liveUpdate.set(enabled);
    if (enabled && this.pendingUpdate()) {
      this.applyPendingUpdate();
    }
  }

  applyPendingUpdate(): void {
    this.pendingUpdate.set(false);
    this.saveNeedsPreview = true;
    this.save$.next();
  }

  private queuePersonaChange(refreshPreview: boolean): void {
    this.saved.set(false);
    if (refreshPreview) {
      this.saveNeedsPreview = true;
    }
    if (this.liveUpdate()) {
      this.save$.next();
      return;
    }
    this.pendingUpdate.set(true);
  }

  private queuePreview(): void {
    if (this.liveUpdate()) {
      this.preview$.next();
      return;
    }
    this.pendingUpdate.set(true);
  }

  toggleProfile(profileId: number): void {
    const current = this.selectedProfileIds();
    if (current.includes(profileId)) {
      if (current.length === 1) {
        return;
      }
      this.selectedProfileIds.set(current.filter((id) => id !== profileId));
    } else {
      this.selectedProfileIds.set([...current, profileId].sort((a, b) => a - b));
    }
    this.queuePreview();
  }

  selectAllRegiostars(): void {
    this.selectedRegiostarIds.set(null);
    this.queuePreview();
  }

  toggleRegiostarPanel(): void {
    this.regiostarPanelOpen.update((open) => !open);
  }

  toggleRegiostarGroupExpanded(className: string): void {
    const next = new Set(this.expandedRegiostarGroups());
    if (next.has(className)) {
      next.delete(className);
    } else {
      next.add(className);
    }
    this.expandedRegiostarGroups.set(next);
  }

  isRegiostarGroupExpanded(className: string): boolean {
    return this.expandedRegiostarGroups().has(className);
  }

  getRegiostarGroupState(className: string): 'all' | 'some' | 'none' {
    const group = this.groupedRegiostars().find((item) => item.class_name === className);
    if (!group || group.regiostars.length === 0) {
      return 'none';
    }
    const selectedCount = group.regiostars.filter((item) => this.isRegiostarSelected(item.id)).length;
    if (selectedCount === group.regiostars.length) {
      return 'all';
    }
    if (selectedCount === 0) {
      return 'none';
    }
    return 'some';
  }

  toggleRegiostarGroup(className: string): void {
    const group = this.groupedRegiostars().find((item) => item.class_name === className);
    if (!group) {
      return;
    }
    const groupIds = group.regiostars.map((item) => item.id);
    const allIds = this.regiostars().map((item) => item.id);
    const current = this.selectedRegiostarIds();
    const selected = new Set(current === null ? allIds : current);
    if (this.getRegiostarGroupState(className) === 'all') {
      for (const id of groupIds) {
        selected.delete(id);
      }
    } else {
      for (const id of groupIds) {
        selected.add(id);
      }
    }
    if (selected.size === 0) {
      return;
    }
    this.selectedRegiostarIds.set(selected.size === allIds.length ? null : [...selected]);
    this.queuePreview();
  }

  toggleRegiostar(id: number): void {
    const allIds = this.regiostars().map((item) => item.id);
    const current = this.selectedRegiostarIds();
    const selected = new Set(current === null ? allIds : current);
    if (selected.has(id)) {
      if (selected.size === 1) {
        return;
      }
      selected.delete(id);
    } else {
      selected.add(id);
    }
    this.selectedRegiostarIds.set(selected.size === allIds.length ? null : [...selected]);
    this.queuePreview();
  }

  isRegiostarSelected(id: number): boolean {
    const selected = this.selectedRegiostarIds();
    return selected === null || selected.includes(id);
  }

  selectedRegiostarCount(): number {
    const selected = this.selectedRegiostarIds();
    return selected === null ? this.regiostars().length : selected.length;
  }

  setColorByIndex(value: boolean): void {
    if (this.colorByIndex() === value) {
      return;
    }
    this.colorByIndex.set(value);
    this.applyPreviewStyle();
  }

  publish(): void {
    const persona = this.persona();
    if (!persona) {
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    this.persist()
      .pipe(switchMap(() => this.customPersonaService.publish(persona.id)))
      .subscribe({
        next: (response) => {
          this.publishing.set(false);
          this.dashboardSessionService.setProjectId(response.project.id.toString());
          this.router.navigate(['/dashboard'], {
            queryParams: { project_id: response.project.id },
          });
        },
        error: (err) => {
          this.publishing.set(false);
          this.error.set(err?.error?.error || 'personaEditor.publishError');
        },
      });
  }

  rebake(): void {
    const persona = this.persona();
    if (!persona?.published_project_id) {
      return;
    }
    this.publishing.set(true);
    this.error.set(null);
    this.persist()
      .pipe(switchMap(() => this.customPersonaService.rebake(persona.id)))
      .subscribe({
        next: () => {
          this.publishing.set(false);
          this.dashboardSessionService.setProjectId(persona.published_project_id!.toString());
          this.router.navigate(['/dashboard'], {
            queryParams: { project_id: persona.published_project_id },
          });
        },
        error: (err) => {
          this.publishing.set(false);
          this.error.set(err?.error?.error || 'personaEditor.rebakeError');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/users-area']);
  }

  private loadTemplates(): void {
    this.loading.set(true);
    this.customPersonaService.getTemplates().subscribe({
      next: (response) => {
        this.templates.set(response.results);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('personaEditor.loadError');
        this.loading.set(false);
      },
    });
  }

  private loadEditor(id: number): void {
    this.loading.set(true);
    forkJoin({
      persona: this.customPersonaService.getCustomPersona(id),
      profiles: this.profileService.getProfiles(1, 100),
      regiostars: this.regiostarService.getRegioStars(1, 100),
    }).subscribe({
      next: ({ persona, profiles, regiostars }) => {
        this.applyPersona(persona);
        this.profiles.set(
          profiles.results.filter((profile) => DEFAULT_PROFILE_IDS.includes(profile.id))
        );
        this.regiostars.set(
          [...regiostars.results].sort((a, b) => a.name.localeCompare(b.name))
        );
        this.loading.set(false);
        this.preview$.next();
      },
      error: () => {
        this.error.set('personaEditor.loadError');
        this.loading.set(false);
      },
    });
  }

  private applyPersona(persona: CustomPersona): void {
    this.persona.set(persona);
    this.displayName = persona.display_name;
    this.description = persona.description || '';
    this.canUseCar = persona.can_use_car;
    this.weights = persona.weights
      .map((item) => ({
        activity_id: item.activity_id,
        activity_name: item.activity_name,
        activity_display_name: item.activity_display_name,
        weight: item.weight,
        categories: item.categories ?? [],
      }))
      .sort(
        (a, b) =>
          b.weight - a.weight || a.activity_display_name.localeCompare(b.activity_display_name)
      );
    this.expandWeightSliderMax();
    this.syncWeightsText();
  }

  private formatWeightsText(): string {
    return JSON.stringify(
      {
        name: this.displayName,
        description: this.description,
        can_use_car: this.canUseCar,
        activities: this.weights.map((item) => ({
          id: item.activity_id,
          key: item.activity_name,
          name: item.activity_display_name,
          category: item.categories[0]?.display_name ?? '',
          weight: Number(item.weight) || 0,
          percent: this.weightPercent(item.weight),
        })),
      },
      null,
      2
    );
  }

  private syncWeightsText(force = false): void {
    if (!force && this.weightsTextFocused) {
      return;
    }
    this.weightsText = this.formatWeightsText();
  }

  private expandWeightSliderMax(): void {
    const highest = this.weights.reduce(
      (max, item) => Math.max(max, Number(item.weight) || 0),
      0
    );
    const needed = Math.max(WEIGHT_SLIDER_FLOOR, highest) + WEIGHT_SLIDER_HEADROOM;
    if (needed > this.weightSliderMax) {
      this.weightSliderMax = Math.ceil(needed / 10) * 10;
    }
  }

  private persist(): Observable<CustomPersona | null> {
    const persona = this.persona();
    if (!persona) {
      return of(null);
    }
    const refreshPreview = this.saveNeedsPreview;
    this.saveNeedsPreview = false;
    this.saving.set(true);
    this.saved.set(false);
    return this.customPersonaService
      .updateCustomPersona(persona.id, {
        display_name: this.displayName,
        description: this.description,
        can_use_car: this.canUseCar,
        weights: this.weights.map((item) => ({
          activity_id: item.activity_id,
          weight: Number(item.weight) || 0,
        })),
      })
      .pipe(
        tap({
          next: (updated) => {
            this.saving.set(false);
            this.saved.set(true);
            this.pendingUpdate.set(false);
            this.applyPersona(updated);
            if (refreshPreview) {
              this.preview$.next();
            }
          },
          error: (err) => {
            this.saving.set(false);
            this.saved.set(false);
            if (!this.liveUpdate()) {
              this.pendingUpdate.set(true);
            }
            this.error.set(err?.error?.error || 'personaEditor.saveError');
          },
        })
      );
  }

  private loadPreview(): void {
    const persona = this.persona();
    if (!persona) {
      return;
    }
    this.previewLoading.set(true);
    this.customPersonaService
      .getPreviewGeoJson(persona.id, {
        profileIds: this.selectedProfileIds(),
        regiostarIds: this.selectedRegiostarIds() ?? undefined,
      })
      .subscribe({
        next: (geojson) => {
          this.latestPreview = geojson;
          this.previewLoading.set(false);
          this.renderPreview(geojson);
        },
        error: () => {
          this.previewLoading.set(false);
          this.error.set('personaEditor.previewError');
        },
      });
  }

  private tryInitMap(): void {
    if (!this.persona() || this.map || !this.previewMapRef) {
      return;
    }
    this.map = new MapLibreMap({
      container: this.previewMapRef.nativeElement,
      style: buildBasemapStyle(),
      center: [9.15, 48.66],
      zoom: 7.2,
      dragRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
    });
    this.popup = new Popup({ closeButton: false, closeOnClick: false });
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.dragRotate.disable();
    this.map.touchZoomRotate.disableRotation();
    this.map.once('load', () => {
      this.mapReady = true;
      this.map?.resize();
      if (this.latestPreview) {
        this.renderPreview(this.latestPreview);
      }
    });
    requestAnimationFrame(() => this.map?.resize());
  }

  private renderPreview(geojson: PreviewGeoJson): void {
    if (!this.map || !this.mapReady) {
      return;
    }
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson as never);
      this.applyPreviewStyle();
      return;
    }
    this.map.addSource(SOURCE_ID, { type: 'geojson', data: geojson as never });
    const beforeId = findBasemapLabelsBeforeId(this.map);
    this.map.addLayer(
      {
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': this.fillColorExpression() as never,
          'fill-opacity': 0.78,
        },
      },
      beforeId
    );
    this.map.addLayer(
      {
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.6,
        },
      },
      beforeId
    );
    this.bindPreviewHover();
  }

  private bindPreviewHover(): void {
    if (!this.map || this.hoverBound) {
      return;
    }
    this.hoverBound = true;
    this.map.on('mousemove', FILL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      if (!feature || !this.map) {
        return;
      }
      this.map.getCanvas().style.cursor = 'pointer';
      this.popup
        ?.setLngLat(event.lngLat)
        .setDOMContent(this.buildPopupContent(feature.properties as Record<string, unknown>))
        .addTo(this.map);
    });
    this.map.on('mouseleave', FILL_LAYER_ID, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';
      }
      this.popup?.remove();
    });
  }

  private buildPopupContent(properties: Record<string, unknown> | null | undefined): HTMLElement {
    const container = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = String(properties?.['name'] ?? '');
    container.appendChild(title);
    container.appendChild(document.createElement('br'));
    container.appendChild(
      document.createTextNode(
        `${this.translate.instant('personaEditor.score')}: ${properties?.['score'] ?? ''}`
      )
    );
    container.appendChild(document.createElement('br'));
    container.appendChild(
      document.createTextNode(
        `${this.translate.instant('personaEditor.index')}: ${properties?.['index'] ?? ''}`
      )
    );
    return container;
  }

  private applyPreviewStyle(): void {
    if (!this.map?.getLayer(FILL_LAYER_ID)) {
      return;
    }
    this.map.setPaintProperty(FILL_LAYER_ID, 'fill-color', this.fillColorExpression() as never);
  }

  private fillColorExpression(): unknown {
    if (this.colorByIndex()) {
      return buildIndexFillColorExpression();
    }
    const config = parseScoreColors(DEFAULT_SCORE_COLORS);
    return config ? buildMapLibreStepExpression(config) : 'rgb(233, 233, 233)';
  }
}
