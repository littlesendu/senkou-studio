'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ratings = require('../source/assets/welkin/review-ratings.js');
hexo.extend.helper.register('studio_customer_reviews', function () {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(hexo.source_dir, 'reviews/data.json'), 'utf8').replace(/^\uFEFF/, ''));
    return ratings.publicReviews(value).reverse();
  } catch { return []; }
});
hexo.extend.helper.register('studio_member_rating', function (target, reviews) {
  const summary = ratings.forTarget(reviews, target);
  return { ...summary, label: ratings.label(target, summary) };
});
