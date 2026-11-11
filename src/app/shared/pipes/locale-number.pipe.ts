import { formatNumber, registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

registerLocaleData(localeDe);

const SUPPORTED_LOCALES = ['de', 'en'];

/** Current UI locale derived from the active translation language. */
export function currentNumberLocale(translate: TranslateService): string {
  const lang = translate.currentLang || translate.defaultLang || 'de';
  return SUPPORTED_LOCALES.includes(lang) ? lang : 'de';
}

/**
 * Like Angular's `number` pipe, but follows the active ngx-translate language
 * (e.g. 20.682 in German, 20,682 in English) instead of the static LOCALE_ID.
 */
@Pipe({
  name: 'localeNumber',
  pure: false,
})
export class LocaleNumberPipe implements PipeTransform {
  private translate = inject(TranslateService);

  transform(value: number | string | null | undefined, digitsInfo?: string): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(num)) {
      return null;
    }
    return formatNumber(num, currentNumberLocale(this.translate), digitsInfo);
  }
}
