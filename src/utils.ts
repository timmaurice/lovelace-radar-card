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
