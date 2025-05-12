import * as _ from 'lodash';

// Utility to fetch and store real-time mineral market prices and trends
export class MarketTrends {
  static MINERALS: MineralConstant[] = [
    RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN,
    RESOURCE_UTRIUM,
    RESOURCE_LEMERGIUM,
    RESOURCE_KEANIUM,
    RESOURCE_ZYNTHIUM,
    RESOURCE_CATALYST
  ];

  /**
   * Update market prices and trends in Memory.marketTrends
   */
  public static update(): void {
    if (Game.time % 1000 !== 0) return;
    if (!Memory.marketTrends) Memory.marketTrends = {};
    for (const mineral of this.MINERALS) {
      const orders = Game.market.getAllOrders({ type: ORDER_SELL, resourceType: mineral });
      if (!orders.length) continue;
      // Use the lowest price sell order as the market price
      const price = _.min(orders.map(o => o.price));
      if (!Memory.marketTrends[mineral]) Memory.marketTrends[mineral] = { history: [] };
      Memory.marketTrends[mineral].current = price;
      Memory.marketTrends[mineral].history.push({ time: Game.time, price });
      // Keep only the last 20 entries (~20,000 ticks)
      if (Memory.marketTrends[mineral].history.length > 20) {
        Memory.marketTrends[mineral].history.shift();
      }
    }
  }

  /**
   * Get current price and trend (percent change over last 20,000 ticks)
   */
  public static get(mineral: MineralConstant): { price: number, trend: number } {
    const data = Memory.marketTrends && Memory.marketTrends[mineral];
    if (!data || !data.current || !data.history || data.history.length < 2) {
      return { price: 1, trend: 0 };
    }
    const price = data.current;
    const old = data.history[0].price;
    const trend = ((price - old) / old) * 100;
    return { price, trend };
  }
} 