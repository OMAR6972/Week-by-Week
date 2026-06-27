/* Academic Hub - student-data.js
   Loads the latest data from the database and refreshes the page live.
   Reuses the app's built-in LIVE_UPDATE mechanism (overwrites the window.*
   globals + re-renders, keeping the student on their current page).
   If anything fails, the site keeps running on the bundled course_data.js -
   it can never break the page. */

(function () {
  var sb = window.__ahSupabase;
  if (!sb) return; // no client -> bundled data is already showing, nothing to do

  sb.from('site_data').select('key, value').then(function (res) {
    if (res.error) {
      console.warn('[AcademicHub] Live data load failed - using bundled data.', res.error.message);
      return;
    }
    var rows = res.data || [];
    if (!rows.length) {
      console.warn('[AcademicHub] Database returned no data - using bundled data.');
      return;
    }

    var payload = {};
    var changed = false;
    rows.forEach(function (r) {
      payload[r.key] = r.value;
      // only flag a refresh if the live value differs from what's already shown
      try {
        if (JSON.stringify(window[r.key]) !== JSON.stringify(r.value)) changed = true;
      } catch (e) { changed = true; }
    });

    if (changed) {
      // app's existing handler applies the payload and re-renders
      window.postMessage({ type: 'LIVE_UPDATE', payload: payload }, '*');
      console.log('[AcademicHub] \u2705 Live data loaded & applied (' + rows.length + ' sets).');
    } else {
      console.log('[AcademicHub] \u2705 Live data matches bundled data (' + rows.length + ' sets). No refresh needed.');
    }
  }, function (err) {
    console.warn('[AcademicHub] Live data load error - using bundled data.', err);
  });
})();
