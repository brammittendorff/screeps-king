// Types for Screeps features that aren't in the official typings
declare const FIND_DROPPED_ENERGY: number;

interface StructureWithStore extends Structure {
  store: Store<ResourceConstant, any>;
  storeCapacity?: number;
}