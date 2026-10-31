/* =====================================================================
   獨立日曆站：登入後直接進入月曆（沿用 PATS Apps Script）
   ===================================================================== */

var PatsMain = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function showAuth() {
    PATS.hide($('loading'));
    PATS.show($('auth'));
    PATS.hide($('app'));
    if (window.PatsAuth && PatsAuth.showLoginPanel) PatsAuth.showLoginPanel();
  }

  function enterApp(user) {
    if (!user || user.canChat === false) {
      PATS.toast('這個帳號無法使用日曆。', 'error');
      if (window.PatsAuth) PatsAuth.logout({ relogin: false });
      else showAuth();
      return;
    }
    PATS.state.user = user;
    PATS.state.view = 'calendar';
    PATS.hide($('loading'));
    PATS.hide($('auth'));
    PATS.show($('app'));
    var name = $('me-name');
    if (name) name.textContent = user.displayName || user.username || user.email || '已登入';
    if (window.PatsCalendar) PatsCalendar.render();
  }

  function boot() {
    PatsAuth.init();
    if (!PATS.state.config.apiUrl) {
      showAuth();
      PatsAuth.showError(PATS.describeError('NO_API_URL'));
      return;
    }
    var token = PATS.readToken();
    if (!token) return showAuth();
    PATS.state.token = token;
    PATS.rpc('session', { token: token })
      .then(function (result) {
        if (!result || !result.user) {
          PATS.writeToken(null);
          return showAuth();
        }
        enterApp(result.user);
      })
      .catch(function (err) {
        if (err.code === 'AUTH_REQUIRED') PATS.writeToken(null);
        showAuth();
        if (err.code === 'NETWORK' || err.code === 'BAD_RESPONSE') {
          PatsAuth.showError(err.message);
        }
      });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    enterApp: enterApp,
    showAuth: showAuth,
    setView: function () {}
  };
})();
