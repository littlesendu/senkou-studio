'use strict';
const consent = require('../source/assets/welkin/service-consent-data.js');
hexo.extend.helper.register('studio_service_consent', function () {
  return consent.validate(this.theme.studio?.service_consent);
});
