import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class ScoringService {
  readonly scoreColors = {
    error: 'rgb(128, 128, 128)',
    best: 'rgb(50, 97, 45)',
    good: 'rgb(60, 176, 67)',
    medium: 'rgb(238, 210, 2)',
    poor: 'rgb(237, 112, 20)',
    bad: 'rgb(194, 24, 7)',
    worst: 'rgb(150, 86, 162)'
  };
  
  constructor() {}

  getScoreName(score: number): string {
    if (score <= 0) return "Error";
    if (score < 0.28) return "A+";
    if (score < 0.32) return "A";
    if (score < 0.35) return "A-";
    if (score < 0.4) return "B+";
    if (score < 0.45) return "B";
    if (score < 0.5) return "B-";
    if (score < 0.56) return "C+";
    if (score < 0.63) return "C";
    if (score < 0.71) return "C-";
    if (score < 0.8) return "D+";
    if (score < 0.9) return "D";
    if (score < 1.0) return "D-";
    if (score < 1.12) return "E+";
    if (score < 1.26) return "E";
    if (score < 1.41) return "E-";
    if (score < 1.59) return "F+";
    if (score < 1.78) return "F";
    return "F-";
  }

  getScoreColor(score: number): string {
    if (score <= 0) return this.scoreColors.error;
    if (score < 0.35) return this.scoreColors.best;
    if (score < 0.5) return this.scoreColors.good;
    if (score < 0.71) return this.scoreColors.medium;
    if (score < 1) return this.scoreColors.poor;
    if (score < 1.41) return this.scoreColors.bad;
    return this.scoreColors.worst;
  }

}