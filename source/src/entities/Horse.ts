import { Mob } from './Mob';
import type { EntityHost } from './Entity';
import { horseModel, HORSE_COAT_COUNT } from './mobModels';

/**
 * HORSE (2.7): a wild steed of the grasslands in one of five coats. Craft a Saddle,
 * right-click a horse with it and climb on: it runs where you look, W sets off, S
 * brakes and Jump takes it over fences of one block and more.
 */
export class Horse extends Mob {
  coat: number;

  constructor(host?: EntityHost, coat = Math.floor(Math.random() * HORSE_COAT_COUNT)) {
    super('horse', host, horseModel(coat));
    this.coat = coat;
  }

  setCoat(coat: number): void {
    this.coat = ((coat % HORSE_COAT_COUNT) + HORSE_COAT_COUNT) % HORSE_COAT_COUNT;
    this.setModel(horseModel(this.coat));
  }

  serialize(): Record<string, unknown> | null {
    const s = super.serialize();
    if (!s) return null;
    return { ...s, cv: this.coat };
  }
}
