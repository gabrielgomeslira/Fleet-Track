// Inicialização síncrona do tema antes da renderização para evitar FOUC.
// Consulte frontend/src/theme/theme.ts para a implementação TypeScript e regras.
;(function () {
  var THEME_KEY = 'ft-theme'
  var theme = 'dark'
  try {
    var stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      theme = stored
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light'
    } else {
      theme = 'dark'
    }
  } catch (e) {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light'
    } else {
      theme = 'dark'
    }
  }
  document.documentElement.setAttribute('data-theme', theme)
})()
