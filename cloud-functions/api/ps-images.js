import { handleImageSearch } from '../../lib/ps-image-search.mjs';

export function onRequest(context) { return handleImageSearch(context); }
