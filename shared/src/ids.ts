import { monotonicFactory } from 'ulid';

export { ulid as newId } from 'ulid';
/** ULID rosnący także w tej samej milisekundzie (kolejność zapisów w kolejce offline). */
export const newOrderedId = monotonicFactory();
