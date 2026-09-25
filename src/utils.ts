import type { HomeAssistant } from './types.js';

/**
 * Dispatches a custom event with an optional detail value.
 *
 * @param node The element to dispatch the event from.
 * @param type The name of the event.
 * @param detail The detail value to pass with the event.
 * @param options The options for the event.
 */
export const fireEvent = <T>(node: HTMLElement, type: string, detail?: T, options?: CustomEventInit<T>): void => {
  const event = new CustomEvent(type, { bubbles: true, cancelable: false, composed: true, ...options, detail });
  node.dispatchEvent(event);
};

/**
 * Converts degrees to radians.
 * @param degrees The angle in degrees.
 * @returns The angle in radians.
 */
export function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 * @param radians The angle in radians.
 * @returns The angle in degrees.
 */
export function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculates the distance between two GPS coordinates.
 * @param lat1 Latitude of the starting point.
 * @param lon1 Longitude of the starting point.
 * @param lat2 Latitude of the destination point.
 * @param lon2 Longitude of the destination point.
 * @param unit The unit of measurement ('km' or 'mi').
 * @returns The distance in the specified unit.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number, unit: string): number {
  const R = unit === 'km' ? 6371 : 3959; // Radius of the earth in km or miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the bearing between two GPS coordinates.
 * @param lat1 Latitude of the starting point.
 * @param lon1 Longitude of the starting point.
 * @param lat2 Latitude of the destination point.
 * @param lon2 Longitude of the destination point.
 * @returns The bearing in degrees.
 */
export function getAzimuth(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  brng = (brng + 360) % 360;
  return brng;
}

/**
 * Formats a number the way the reader's language writes it, so a German card
 * shows "1,30 km" rather than the "1.30 km" `toFixed` hands out regardless of
 * locale. The fallback is English rather than the runtime default: the card
 * always knows Home Assistant's language, and an unset locale must not make the
 * output depend on the machine the browser happens to run on.
 */
function formatNumber(value: number, fractionDigits: number, locale?: string): string {
  return new Intl.NumberFormat(locale || 'en', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Formats a distance value into a string with appropriate units.
 * Converts to meters or feet for distances less than 1 km/mi.
 * @param distance The distance value.
 * @param unit The unit of measurement ('km' or 'mi').
 * @param options Formatting options, including the locale to format the number in.
 * @returns The formatted distance string.
 */
export function formatDistance(
  distance: number,
  unit: string,
  options?: { removeIntegerDecimals?: boolean; locale?: string },
): string {
  const locale = options?.locale;
  // Decide on the rounded value, not the raw one. A nominal 1 km comes out of
  // the haversine as 999.998 m, which is still below 1 - so the small-unit
  // branch used to win and print "1000 m" where the reader expects "1.00 km".
  if (unit === 'km') {
    const metres = Math.round(distance * 1000);
    if (metres < 1000) return `${formatNumber(metres, 0, locale)} m`;
  }
  if (unit === 'mi') {
    const feet = Math.round(distance * 5280);
    if (feet < 5280) return `${formatNumber(feet, 0, locale)} ft`;
  }

  const rounded = Math.round(distance * 100) / 100;
  if (options?.removeIntegerDecimals && Number.isInteger(rounded)) {
    return `${formatNumber(rounded, 0, locale)} ${unit}`;
  }
  return `${formatNumber(rounded, 2, locale)} ${unit}`;
}

/**
 * An entity's display name: a configured `name` wins, then `hass.formatEntityName` - the
 * helper HA's own cards name entities with - and, on a hass object without it, the friendly
 * name. The entity id is the last resort, also for an entity HA doesn't know.
 */
export function entityDisplayName(
  hass: Pick<HomeAssistant, 'states' | 'formatEntityName'>,
  entityId: string,
  name?: string,
): string {
  if (name) return name;
  const stateObj = hass.states[entityId];
  if (!stateObj) return entityId;
  return hass.formatEntityName?.(stateObj, undefined) || stateObj.attributes.friendly_name || entityId;
}
