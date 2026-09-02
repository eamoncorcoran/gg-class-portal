/**
 * A student's postal address.
 *
 * Small enough to live in one file, and worth having one file for, because the
 * same rules are needed in three places: saving it, showing it back, and
 * putting it in a spreadsheet. Written once so those cannot disagree.
 */

/* The 32 counties, because the course is taught to teachers on both sides of the
   border and a list that stops at 26 would quietly tell some of them they are
   somewhere else. Alphabetical, since that is how somebody scans a list looking
   for their own. */
export const COUNTIES = Object.freeze([
  'Antrim', 'Armagh', 'Carlow', 'Cavan', 'Clare', 'Cork', 'Derry', 'Donegal',
  'Down', 'Dublin', 'Fermanagh', 'Galway', 'Kerry', 'Kildare', 'Kilkenny',
  'Laois', 'Leitrim', 'Limerick', 'Longford', 'Louth', 'Mayo', 'Meath',
  'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Tipperary', 'Tyrone',
  'Waterford', 'Westmeath', 'Wexford', 'Wicklow',
]);

/**
 * An Eircode, as it is meant to be written.
 *
 * Seven characters in two halves: a routing key and a unique identifier, shown
 * with a space between them. People type them in every combination of case and
 * spacing, and all of those mean the same address, so what is stored is the one
 * form — otherwise a spreadsheet of them cannot be sorted, matched or posted.
 *
 * Returns null for anything that is not one, so the caller decides what to do
 * about it rather than having a decision made here.
 */
export function normaliseEircode(value) {
  const bare = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (bare.length !== 7) return null;
  const routing = bare.slice(0, 3);
  /* Almost every routing key is a letter and two digits. D6W is the exception —
     Dublin 6West — and leaving it out would reject a real address in the middle
     of the city. */
  if (!/^[A-Z]\d{2}$/.test(routing) && routing !== 'D6W') return null;
  return `${routing} ${bare.slice(3)}`;
}

/** Is this county one of the ones on the list, however it was typed. */
export function normaliseCounty(value) {
  const asked = String(value || '').trim().toLowerCase().replace(/^co\.?\s+/, '');
  return COUNTIES.find((county) => county.toLowerCase() === asked) || null;
}

/** Has this student given us an address we could post something to. */
export function hasAddress(user) {
  return Boolean(user?.address_line1 && user?.address_county && user?.eircode);
}

/** The address as it would be written on an envelope. */
export function formatAddress(user) {
  if (!user?.address_line1) return '';
  return [user.address_line1, user.address_line2, `Co. ${user.address_county}`, user.eircode]
    .filter(Boolean).join(', ');
}
