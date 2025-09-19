import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class IndexService {
  readonly indexColors = {
    error: 'rgb(128, 128, 128)',
    best: 'rgb(50, 97, 45)',
    good: 'rgb(60, 176, 67)',
    medium: 'rgb(238, 210, 2)',
    poor: 'rgb(237, 112, 20)',
    bad: 'rgb(194, 24, 7)',
    worst: 'rgb(150, 86, 162)'
  };

  constructor() { }

  getIndexName(index: number): string {
    if (index <= 0) return "Error";
    if (index < 0.28) return "A+";
    if (index < 0.32) return "A";
    if (index < 0.35) return "A-";
    if (index < 0.4) return "B+";
    if (index < 0.45) return "B";
    if (index < 0.5) return "B-";
    if (index < 0.56) return "C+";
    if (index < 0.63) return "C";
    if (index < 0.71) return "C-";
    if (index < 0.8) return "D+";
    if (index < 0.9) return "D";
    if (index < 1.0) return "D-";
    if (index < 1.12) return "E+";
    if (index < 1.26) return "E";
    if (index < 1.41) return "E-";
    if (index < 1.59) return "F+";
    if (index < 1.78) return "F";
    return "F-";
  }

  getIndexColor(index: number): string {
    if (index <= 0) return this.indexColors.error;
    if (index < 0.35) return this.indexColors.best;
    if (index < 0.5) return this.indexColors.good;
    if (index < 0.71) return this.indexColors.medium;
    if (index < 1) return this.indexColors.poor;
    if (index < 1.41) return this.indexColors.bad;
    return this.indexColors.worst;
  }

}