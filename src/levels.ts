import * as THREE from 'three';
import type { World } from './worlds/world';
import type { Model } from './vehicles/kit';
import { buildGarage } from './worlds/garage';
import { buildTaxi } from './vehicles/taxi';
import { buildStreet, buildSchool, buildStation, buildDepot } from './worlds/places';

// المستويات الخمسة: المركبة، المكان، النجوم حسب الوقت، والمكافأة.

export interface LevelDef {
  id: 'l1' | 'l2' | 'l3' | 'l4' | 'l5';
  icon: string;
  vehicle: () => Model;
  world: (scene: THREE.Scene, renderer: THREE.WebGLRenderer) => World;
  /** مستويات نظر إضافية فوق السلّم العادي (للمركبات العالية) */
  extraHeights?: number[];
  /** الوقت (ثوانٍ) للحصول على 3 نجوم ثم نجمتين */
  par: [number, number];
  coins: number;
}

export const LEVELS: LevelDef[] = [
  { id: 'l1', icon: '🚕', vehicle: buildTaxi, world: buildGarage, par: [240, 420], coins: 150 },
  { id: 'l2', icon: '🚖', vehicle: buildTaxi, world: buildStreet, par: [300, 500], coins: 220 },
  { id: 'l3', icon: '🚌', vehicle: buildTaxi, world: buildSchool, extraHeights: [3.1], par: [420, 700], coins: 320 },
  { id: 'l4', icon: '🚚', vehicle: buildTaxi, world: buildStation, extraHeights: [3.1], par: [480, 780], coins: 420 },
  { id: 'l5', icon: '🚛', vehicle: buildTaxi, world: buildDepot, extraHeights: [3.3, 4.1], par: [600, 960], coins: 600 },
];

export function starsFor(level: LevelDef, seconds: number) {
  return seconds <= level.par[0] ? 3 : seconds <= level.par[1] ? 2 : 1;
}

/** المكافأة: أساس المستوى × (0.6 + 0.2 × النجوم) */
export function coinsFor(level: LevelDef, stars: number) {
  return Math.round(level.coins * (0.6 + 0.2 * stars));
}
