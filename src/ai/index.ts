/**
 * AI module index
 * Exports all AI behaviors
 */

import { HarvesterAI } from './harvester';
import { UpgraderAI } from './upgrader';
import { TowerAI } from './tower';
import { BuilderAI } from './builder';
import { ClaimerAI } from './claimer';
import { DestroyerAI } from './destroyer';

// Export all AI modules
export const AI = {
  harvester: HarvesterAI,
  upgrader: UpgraderAI,
  tower: TowerAI,
  builder: BuilderAI,
  claimer: ClaimerAI,
  destroyer: DestroyerAI
};