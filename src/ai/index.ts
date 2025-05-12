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
import { DefenderAI } from './defender';
import { HaulerAI } from './hauler';
import { ArcherAI } from './archer';
import { ScoutAI } from './scout';
import { RepairerAI } from './repairer';

// Export all AI modules
export const AI = {
  harvester: HarvesterAI,
  hauler: HaulerAI,
  upgrader: UpgraderAI,
  tower: TowerAI,
  builder: BuilderAI,
  repairer: RepairerAI,
  claimer: ClaimerAI,
  destroyer: DestroyerAI,
  defender: DefenderAI,
  archer: ArcherAI,
  scout: ScoutAI
};

// TowerAI should accept an optional callback for analytics/logging
// Example: TowerAI.task(tower, (action: string) => { ... })