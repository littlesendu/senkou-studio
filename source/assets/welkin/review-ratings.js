// Shared by static rendering and the browser so member ratings stay consistent.
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SenkouReviewRatings = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function publicReviews(value) {
    const list = Array.isArray(value) ? value : value?.reviews;
    return (Array.isArray(list) ? list : []).filter(item => item &&
      typeof item.target === 'string' && item.target.trim() &&
      typeof item.content === 'string' && item.content.trim() &&
      Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5 &&
      (item.status == null || item.status === 'approved')).slice(-100);
  }
  function forTarget(value, target) {
    const reviews = publicReviews(value).filter(item => item.target.trim() === String(target).trim());
    return { score: reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : 5, count: reviews.length };
  }
  function label(target, summary) {
    return target + '：' + (summary.count ? summary.score + ' 星，满分 5 星，来自 ' + summary.count + ' 条已审核评价' : '默认 5 星，满分 5 星，暂无评价');
  }
  return { publicReviews, forTarget, label };
});
